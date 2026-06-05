/** Заглушка для LAN-установщика (без туннелей в интернет). */
export type TunnelState = { id: string; status: string; provider?: string; role?: string };

export class TunnelManager {
  stopAll(): void {}
  stop(_id: string): void {}
  async start(
    _provider: string,
    _role: string,
    _localPort: number,
  ): Promise<TunnelState> {
    return { id: 'disabled', status: 'disabled' };
  }
  async startInternetPack(_wsPort: number, _gamePort: number): Promise<TunnelState[]> {
    return [];
  }
}
