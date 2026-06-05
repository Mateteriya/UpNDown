import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { platform } from 'node:os';

export type TunnelProvider = 'cloudflare' | 'ngrok' | 'localtunnel';
export type TunnelRole = 'ws' | 'game';

export interface TunnelState {
  id: string;
  provider: TunnelProvider;
  role: TunnelRole;
  localPort: number;
  status: 'starting' | 'running' | 'error' | 'stopped';
  publicHttps: string | null;
  publicWs: string | null;
  error: string | null;
}

const URL_PATTERNS = [
  /https:\/\/[a-z0-9][-a-z0-9.]*\.trycloudflare\.com/gi,
  /https:\/\/[a-z0-9][-a-z0-9.]*\.ngrok-free\.app/gi,
  /https:\/\/[a-z0-9][-a-z0-9.]*\.ngrok\.io/gi,
  /https:\/\/[a-z0-9][-a-z0-9.]*\.loca\.lt/gi,
  /https:\/\/[a-z0-9][-a-z0-9.]*\.lhr\.life/gi,
];

function httpsToWs(url: string): string {
  return url.replace(/^https:/i, 'wss:');
}

function extractPublicUrl(text: string): string | null {
  for (const re of URL_PATTERNS) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m?.[0]) return m[0].replace(/\/$/, '');
  }
  return null;
}

function tunnelId(provider: TunnelProvider, role: TunnelRole): string {
  return `${provider}-${role}`;
}

function commandFor(provider: TunnelProvider, port: number): { cmd: string; args: string[] } {
  const isWin = platform() === 'win32';
  switch (provider) {
    case 'cloudflare':
      return {
        cmd: isWin ? 'cloudflared.exe' : 'cloudflared',
        args: ['tunnel', '--url', `http://127.0.0.1:${port}`],
      };
    case 'ngrok':
      return {
        cmd: isWin ? 'ngrok.exe' : 'ngrok',
        args: ['http', String(port), '--log=stdout'],
      };
    case 'localtunnel':
      return {
        cmd: isWin ? 'npx.cmd' : 'npx',
        args: ['--yes', 'localtunnel', '--port', String(port)],
      };
  }
}

type ActiveTunnel = TunnelState & { proc: ChildProcessWithoutNullStreams; buffer: string };

export class TunnelManager {
  private readonly tunnels = new Map<string, ActiveTunnel>();

  list(): TunnelState[] {
    return [...this.tunnels.values()].map((t) => ({
      id: t.id,
      provider: t.provider,
      role: t.role,
      localPort: t.localPort,
      status: t.status,
      publicHttps: t.publicHttps,
      publicWs: t.publicWs,
      error: t.error,
    }));
  }

  getSuggestedPublic(): { publicWs: string | null; publicGame: string | null } {
    const ws =
      this.tunnels.get(tunnelId('cloudflare', 'ws')) ??
      this.tunnels.get(tunnelId('ngrok', 'ws')) ??
      this.tunnels.get(tunnelId('localtunnel', 'ws'));
    const game =
      this.tunnels.get(tunnelId('cloudflare', 'game')) ??
      this.tunnels.get(tunnelId('ngrok', 'game')) ??
      this.tunnels.get(tunnelId('localtunnel', 'game'));

    const pickWs = (t: ActiveTunnel | undefined) =>
      t?.status === 'running' ? t.publicWs : null;
    const pickGame = (t: ActiveTunnel | undefined) =>
      t?.status === 'running' ? t.publicHttps : null;

    return {
      publicWs: pickWs(ws) ?? pickWs(game),
      publicGame: pickGame(game) ?? pickGame(ws),
    };
  }

  async start(provider: TunnelProvider, role: TunnelRole, localPort: number): Promise<TunnelState> {
    const id = tunnelId(provider, role);
    this.stop(id);

    const { cmd, args } = commandFor(provider, localPort);
    const entry: ActiveTunnel = {
      id,
      provider,
      role,
      localPort,
      status: 'starting',
      publicHttps: null,
      publicWs: null,
      error: null,
      proc: null as unknown as ChildProcessWithoutNullStreams,
      buffer: '',
    };

    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(this.snapshot(entry));
      };

      let proc: ChildProcessWithoutNullStreams;
      try {
        proc = spawn(cmd, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: platform() === 'win32',
          windowsHide: true,
        });
      } catch (e) {
        entry.status = 'error';
        entry.error =
          e instanceof Error
            ? e.message
            : `${provider} не найден. Установите CLI (cloudflared / ngrok) или используйте localtunnel (нужен npx).`;
        finish();
        return;
      }

      entry.proc = proc;
      this.tunnels.set(id, entry);

      const onData = (chunk: Buffer) => {
        entry.buffer += chunk.toString('utf8');
        if (entry.buffer.length > 32_000) entry.buffer = entry.buffer.slice(-16_000);
        const url = extractPublicUrl(entry.buffer);
        if (url && entry.status !== 'running') {
          entry.publicHttps = url;
          entry.publicWs = httpsToWs(url);
          entry.status = 'running';
          entry.error = null;
          finish();
        }
      };

      proc.stdout?.on('data', onData);
      proc.stderr?.on('data', onData);

      proc.on('error', (err) => {
        entry.status = 'error';
        entry.error = err.message;
        finish();
      });

      proc.on('exit', (code) => {
        if (entry.status === 'running') {
          entry.status = 'stopped';
        } else if (entry.status === 'starting') {
          entry.status = 'error';
          entry.error = entry.error ?? `Процесс завершился (код ${code ?? '?'})`;
        }
        this.tunnels.delete(id);
        finish();
      });

      setTimeout(() => {
        if (entry.status === 'starting') {
          entry.status = 'error';
          entry.error =
            entry.error ??
            `Таймаут: ${provider} не выдал публичный URL за 45 с. Проверьте установку CLI.`;
          try {
            proc.kill();
          } catch {
            /* ignore */
          }
          this.tunnels.delete(id);
          finish();
        }
      }, 45_000);
    });
  }

  stop(id: string): void {
    const t = this.tunnels.get(id);
    if (!t) return;
    try {
      t.proc.kill();
    } catch {
      /* ignore */
    }
    this.tunnels.delete(id);
  }

  stopAll(): void {
    for (const id of [...this.tunnels.keys()]) this.stop(id);
  }

  /** Cloudflare WS + game (два процесса). */
  async startInternetPack(wsPort: number, gamePort: number): Promise<TunnelState[]> {
    return Promise.all([
      this.start('cloudflare', 'ws', wsPort),
      this.start('cloudflare', 'game', gamePort),
    ]);
  }

  private snapshot(entry: ActiveTunnel): TunnelState {
    return {
      id: entry.id,
      provider: entry.provider,
      role: entry.role,
      localPort: entry.localPort,
      status: entry.status,
      publicHttps: entry.publicHttps,
      publicWs: entry.publicWs,
      error: entry.error,
    };
  }
}
