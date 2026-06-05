/** Запасные LAN-порты для ссылок и доп. слушателей (если 3001 занят или режет файрвол). */

export function parseLanBackupPorts(
  mainPort: number,
  envValue: string | undefined,
  defaultOffsets: number[] = [1, 2],
): number[] {
  if (envValue?.trim()) {
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
  defaultOffsets: number[] = [1, 2],
): number[] {
  return parseLanBackupPorts(mainPort, envValue, defaultOffsets);
}
