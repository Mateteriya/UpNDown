/** Заглушка UPnP для LAN-установщика. */
export function getUpnpState(): { status: string } {
  return { status: 'disabled' };
}

export async function tryUpnpPortForward(_ports: number[]): Promise<{ status: string }> {
  return { status: 'disabled' };
}

export async function clearUpnpMappings(_ports: number[]): Promise<void> {}
