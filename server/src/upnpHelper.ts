import natUpnp from 'nat-upnp';

export interface UpnpMappingResult {
  port: number;
  ok: boolean;
  error?: string;
}

export interface UpnpState {
  status: 'idle' | 'working' | 'ok' | 'error';
  externalIp: string | null;
  mappings: UpnpMappingResult[];
  error: string | null;
  publicWs: string | null;
  publicGame: string | null;
}

function promisify<T>(fn: (cb: (err: Error | null, result: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    fn((err, result) => (err ? reject(err) : resolve(result)));
  });
}

let lastState: UpnpState = {
  status: 'idle',
  externalIp: null,
  mappings: [],
  error: null,
  publicWs: null,
  publicGame: null,
};

export function getUpnpState(): UpnpState {
  return { ...lastState, mappings: [...lastState.mappings] };
}

export async function tryUpnpPortForward(
  ports: number[],
  ttl = 3600,
): Promise<UpnpState> {
  lastState = {
    status: 'working',
    externalIp: null,
    mappings: [],
    error: null,
    publicWs: null,
    publicGame: null,
  };

  const client = natUpnp.createClient();

  try {
    const externalIp = await promisify<string>((cb) => client.externalIp(cb));
    lastState.externalIp = externalIp;

    for (const port of ports) {
      try {
        await promisify<void>((cb) =>
          client.portMapping({ public: port, private: port, ttl }, cb),
        );
        lastState.mappings.push({ port, ok: true });
      } catch (e) {
        lastState.mappings.push({
          port,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const anyOk = lastState.mappings.some((m) => m.ok);
    lastState.status = anyOk ? 'ok' : 'error';
    if (!anyOk) {
      lastState.error = 'UPnP не открыл порты (отключён на роутере или недоступен).';
    } else {
      const wsPort = ports.find((p) => p === ports[0]) ?? ports[0];
      const gamePort = ports[1] ?? ports[0];
      lastState.publicWs = `ws://${externalIp}:${wsPort}`;
      lastState.publicGame = `http://${externalIp}:${gamePort}`;
    }
  } catch (e) {
    lastState.status = 'error';
    lastState.error = e instanceof Error ? e.message : String(e);
  } finally {
    try {
      client.close();
    } catch {
      /* ignore */
    }
  }

  return getUpnpState();
}

export async function clearUpnpMappings(ports: number[]): Promise<void> {
  const client = natUpnp.createClient();
  try {
    for (const port of ports) {
      await promisify<void>((cb) => client.portUnmapping({ public: port }, cb)).catch(() => {});
    }
  } finally {
    try {
      client.close();
    } catch {
      /* ignore */
    }
  }
  lastState = {
    status: 'idle',
    externalIp: null,
    mappings: [],
    error: null,
    publicWs: null,
    publicGame: null,
  };
}
