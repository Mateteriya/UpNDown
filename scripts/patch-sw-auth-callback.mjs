/**
 * vite-plugin-pwa всегда вшивает NavigationRoute→index.html (denylist у нас не попадает в sw.js).
 * Тогда navigate на /auth-callback.html?code=… отдаёт меню, а не callback → OAuth мёртв.
 * Патчим и dist/ (прод), и dist-host/ (LAN party).
 */
import fs from 'node:fs';
import path from 'node:path';

const targets = [
  path.resolve('dist/sw.js'),
  path.resolve('dist-host/sw.js'),
];

let patched = 0;
for (const swPath of targets) {
  if (!fs.existsSync(swPath)) {
    console.warn(`patch-sw-auth-callback: нет ${path.relative(process.cwd(), swPath)} — пропуск`);
    continue;
  }
  const before = fs.readFileSync(swPath, 'utf8');
  const after = before.replace(
    /,?e\.registerRoute\(new e\.NavigationRoute\(e\.createHandlerBoundToURL\(["']index\.html["']\)\)\)/g,
    '',
  );
  if (after === before) {
    console.warn(
      `patch-sw-auth-callback: NavigationRoute не найден в ${path.relative(process.cwd(), swPath)}`,
    );
    continue;
  }
  fs.writeFileSync(swPath, after);
  console.log(`patch-sw-auth-callback: OK ${path.relative(process.cwd(), swPath)}`);
  patched += 1;
}

if (patched === 0 && !targets.some((p) => fs.existsSync(p))) {
  process.exit(0);
}
