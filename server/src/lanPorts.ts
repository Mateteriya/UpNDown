/** Запасные LAN-порты — только если явно заданы `WS_BACKUP_PORTS`. Один listen — норма. */

export function parseLanBackupPorts(
  mainPort: number,
  envValue: string | undefined,
  defaultOffsets: number[] = [],
): number[] {
  /** Явно выкл.: пустая строка / none / off (для VPS/Docker). */
  if (envValue !== undefined) {
    const trimmed = envValue.trim().toLowerCase();
    if (!trimmed || trimmed === 'none' || trimmed === 'off' || trimmed === '0') return [];
    const seen = new Set<number>();
    const out: number[] = [];
    for (const part of envValue.split(',')) {
      const n = Number(part.trim());
      if (!Number.isFinite(n) || n <= 0 || n > 65535 || n === mainPort || seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
    return out;
  }
  return defaultOffsets
    .map((o) => mainPort + o)
    .filter((p) => p > 0 && p <= 65535 && p !== mainPort);
}

export function parseGameBackupPorts(
  mainPort: number,
  envValue: string | undefined,
  defaultOffsets: number[] = [],
): number[] {
  return parseLanBackupPorts(mainPort, envValue, defaultOffsets);
}
