/**
 * Portable Node.js win-x64 для установщика (только при сборке .exe).
 */
import { createWriteStream, existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const NODE_VERSION = process.env.UPDOWN_NODE_VERSION ?? '22.16.0';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const destExe = join(root, 'host-desktop', 'bundle', 'node', 'node.exe');

if (existsSync(destExe)) {
  console.log('[download-node-win] Уже есть', destExe);
  process.exit(0);
}

const base = `node-v${NODE_VERSION}-win-x64`;
const url = `https://nodejs.org/dist/v${NODE_VERSION}/${base}.zip`;
const zipPath = join(root, 'host-desktop', 'bundle', `${base}.zip`);

mkdirSync(join(root, 'host-desktop', 'bundle', 'node'), { recursive: true });

console.log('[download-node-win] Скачиваем', url);

const res = await fetch(url);
if (!res.ok) throw new Error(`HTTP ${res.status} для ${url}`);
await pipeline(res.body, createWriteStream(zipPath));

// Распаковка zip через PowerShell (на Windows без доп. npm-пакетов)
import { spawnSync } from 'node:child_process';
const extractDir = join(root, 'host-desktop', 'bundle', '_node_extract');
rmSync(extractDir, { recursive: true, force: true });
mkdirSync(extractDir, { recursive: true });

const ps = spawnSync(
  'powershell',
  [
    '-NoProfile',
    '-Command',
    `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
  ],
  { stdio: 'inherit' },
);
if (ps.status !== 0) process.exit(ps.status ?? 1);

const srcExe = join(extractDir, base, 'node.exe');
if (!existsSync(srcExe)) throw new Error('node.exe не найден после распаковки');
copyFileSync(srcExe, destExe);
rmSync(extractDir, { recursive: true, force: true });
rmSync(zipPath, { force: true });

console.log('[download-node-win] OK →', destExe);
