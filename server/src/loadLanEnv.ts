/**
 * LAN: подхватить корневой .env.local (и server/.env), без утечки в Vite-бандл.
 * В браузер попадают только VITE_*; SUPABASE_SERVICE_ROLE_KEY остаётся в Node.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function applyEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    const cur = process.env[key];
    if (cur === undefined || cur.trim() === '') {
      process.env[key] = val;
    }
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const serverDir = join(here, '..');

applyEnvFile(join(repoRoot, '.env'));
applyEnvFile(join(repoRoot, '.env.local'));
applyEnvFile(join(serverDir, '.env'));

if (!(process.env.SUPABASE_URL ?? '').trim()) {
  const fromVite = (process.env.VITE_SUPABASE_URL ?? '').trim();
  if (fromVite) process.env.SUPABASE_URL = fromVite;
}
