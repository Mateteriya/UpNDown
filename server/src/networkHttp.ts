import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TunnelManager } from './tunnelManager.js';
import { getUpnpState, tryUpnpPortForward, clearUpnpMappings } from './upnpHelper.js';
import { isGameDistAvailable, lanGameAppUrl } from './gameStatic.js';
import { parseGameBackupPorts, parseLanBackupPorts } from './lanPorts.js';
import { listLanIPv4 } from './networkInfo.js';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function buildNetworkStatus(
  port: number,
  gameAppPort: number,
  _tunnels?: TunnelManager,
): Record<string, unknown> {
  const ips = listLanIPv4();
  const primaryIp = ips[0] ?? '127.0.0.1';
  const wsBackupPorts = parseLanBackupPorts(port, process.env.WS_BACKUP_PORTS);
  const gameBackupPorts = parseGameBackupPorts(gameAppPort, process.env.GAME_BACKUP_PORTS);

  const wsUrlLan = `ws://${primaryIp}:${port}`;
  const gameAppUrlLan = lanGameAppUrl(primaryIp, port, gameAppPort);

  return {
    port,
    gameAppPort,
    wsBackupPorts,
    gameBackupPorts,
    lanIps: ips,
    wsUrlLan,
    gameAppUrlLan,
    lanWsAlternates: wsBackupPorts.map((p) => `ws://${primaryIp}:${p}`),
    lanGameAlternates: gameBackupPorts.map((p) => `http://${primaryIp}:${p}`),
    gameReady: isGameDistAvailable(),
  };
}

export async function handleNetworkApi(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  port: number,
  gameAppPort: number,
  tunnels: TunnelManager,
): Promise<boolean> {
  if (path === '/api/network/status' && req.method === 'GET') {
    sendJson(res, 200, buildNetworkStatus(port, gameAppPort, tunnels));
    return true;
  }

  if (path === '/api/network/tunnel/start' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const provider = body.provider as string;
    const role = body.role as string;
    if (
      provider !== 'cloudflare' &&
      provider !== 'ngrok' &&
      provider !== 'localtunnel'
    ) {
      sendJson(res, 400, { ok: false, error: 'invalid_provider' });
      return true;
    }
    if (role !== 'ws' && role !== 'game') {
      sendJson(res, 400, { ok: false, error: 'invalid_role' });
      return true;
    }
    const localPort = role === 'ws' ? port : gameAppPort;
    const state = await tunnels.start(provider, role, localPort);
    sendJson(res, 200, {
      ok: state.status === 'running',
      tunnel: state,
      network: buildNetworkStatus(port, gameAppPort, tunnels),
    });
    return true;
  }

  if (path === '/api/network/tunnel/internet-pack' && req.method === 'POST') {
    const results = await tunnels.startInternetPack(port, gameAppPort);
    sendJson(res, 200, {
      ok: results.every((t) => t.status === 'running'),
      tunnels: results,
      network: buildNetworkStatus(port, gameAppPort, tunnels),
    });
    return true;
  }

  if (path === '/api/network/tunnel/stop' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const id = typeof body.id === 'string' ? body.id : '';
    if (id === 'all') tunnels.stopAll();
    else if (id) tunnels.stop(id);
    sendJson(res, 200, { ok: true, network: buildNetworkStatus(port, gameAppPort, tunnels) });
    return true;
  }

  if (path === '/api/network/upnp' && req.method === 'POST') {
    const upnp = await tryUpnpPortForward([port, gameAppPort]);
    sendJson(res, 200, { ok: upnp.status === 'ok', upnp, network: buildNetworkStatus(port, gameAppPort, tunnels) });
    return true;
  }

  if (path === '/api/network/upnp/clear' && req.method === 'POST') {
    await clearUpnpMappings([port, gameAppPort]);
    sendJson(res, 200, { ok: true, network: buildNetworkStatus(port, gameAppPort, tunnels) });
    return true;
  }

  return false;
}
