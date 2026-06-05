import { networkInterfaces } from 'node:os';

export function listLanIPv4(): string[] {
  const out: string[] = [];
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        out.push(net.address);
      }
    }
  }
  return [...new Set(out)];
}
