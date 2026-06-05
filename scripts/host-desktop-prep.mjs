/**
 * Перед сборкой .exe: dist-host + бандл сервера + portable Node в host-desktop/bundle.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const r = spawnSync(process.execPath, [join(root, 'scripts', 'stage-host-installer.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(r.status ?? 1);
