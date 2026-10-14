/**
 * vite-plugin-pwa всегда вшивает NavigationRoute→index.html (denylist у нас не попадает в sw.js).
 * Тогда navigate на /auth-callback.html?code=… отдаёт меню, а не callback → OAuth мёртв (см. docs/up2down.ru.har.bak).
 */
import fs from 'node:fs'
import path from 'node:path'

const swPath = path.resolve('dist/sw.js')
if (!fs.existsSync(swPath)) {
  console.warn('patch-sw-auth-callback: dist/sw.js нет — пропуск')
  process.exit(0)
}

const before = fs.readFileSync(swPath, 'utf8')
const after = before.replace(
  /,?e\.registerRoute\(new e\.NavigationRoute\(e\.createHandlerBoundToURL\(["']index\.html["']\)\)\)/g,
  '',
)

if (after === before) {
  console.warn(
    'patch-sw-auth-callback: NavigationRoute(index.html) не найден — проверьте dist/sw.js вручную',
  )
  process.exit(0)
}

fs.writeFileSync(swPath, after)
console.log('patch-sw-auth-callback: убран NavigationRoute→index.html (OAuth/auth-callback)')
