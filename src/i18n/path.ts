export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] != null ? String(vars[key]) : `{${key}}`,
  );
}

export type MessageTree = { [key: string]: string | MessageTree };

export function getByPath(tree: MessageTree, path: string): string | undefined {
  const parts = path.split('.');
  let cur: string | MessageTree | undefined = tree;
  for (const part of parts) {
    if (cur == null || typeof cur === 'string') return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function flattenKeys(tree: MessageTree, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') keys.push(path);
    else keys.push(...flattenKeys(v, path));
  }
  return keys;
}
