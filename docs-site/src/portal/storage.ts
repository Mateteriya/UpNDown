const STORAGE_KEY = 'upndown-portal-v3';

export function loadChecked(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('upndown-portal-v2');
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function saveChecked(set: Set<string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

export function exportProgress(checked: Set<string>): string {
  return JSON.stringify(
    { version: 3, checked: [...checked], exportedAt: new Date().toISOString() },
    null,
    2,
  );
}

export function importProgress(json: string): Set<string> {
  const data = JSON.parse(json) as { checked?: string[] };
  if (!Array.isArray(data.checked)) throw new Error('Неверный формат');
  return new Set(data.checked);
}
