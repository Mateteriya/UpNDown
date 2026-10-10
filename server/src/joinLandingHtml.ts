/** HTML лендинга /join — без внешних ассетов (офлайн Wi‑Fi). */

export function buildAppJoinDeepLinkHtml(opts: {
  code: string | null;
  playHref: string;
  appHref: string;
  /** Всегда для спец. хоста: путь скачивания APK */
  apkHref: string;
  apkReady: boolean;
  escapeHtml: (s: string) => string;
}): string {
  const { code, playHref, appHref, apkHref, apkReady, escapeHtml: esc } = opts;
  const codeBlock = code
    ? `<p class="code">${esc(code)}</p>`
    : `<p class="muted">Код комнаты не указан — откройте игру и введите код вручную.</p>`;

  const apkBlock = apkReady
    ? `<a class="btn secondary" href="/apk">Скачать для Android</a>
       <p class="muted apk-note">iPhone — зелёная кнопка выше (без установки).</p>`
    : `<a class="btn secondary" href="${esc(apkHref)}">APK для Android</a>
       <p class="muted apk-note">Файла на хосте ещё нет. iPhone: играйте кнопкой выше.</p>`;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<meta name="color-scheme" content="dark"/>
<title>Up&amp;Down · вход в комнату</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100dvh; min-height: 100vh;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #f3e8ff;
    background: #0b0820;
    background-image:
      radial-gradient(ellipse 80% 50% at 20% 0%, rgba(34,211,238,0.22), transparent 55%),
      radial-gradient(ellipse 70% 45% at 90% 100%, rgba(232,121,249,0.2), transparent 50%);
    display: flex; align-items: center; justify-content: center; padding: 24px 16px;
  }
  .card {
    width: min(420px, 100%);
    padding: 28px 22px 24px;
    border-radius: 22px;
    border: 1px solid rgba(167,139,250,0.45);
    background: #120e2a;
    box-shadow: 0 0 0 3px rgba(103,232,249,0.12), 0 20px 40px rgba(0,0,0,0.45);
    text-align: center;
  }
  h1 {
    margin: 0 0 8px; font-size: 1.45rem; letter-spacing: 0.04em;
    color: #67e8f9; font-weight: 800;
  }
  .sub { margin: 0 0 14px; font-size: 0.95rem; color: #c4b5fd; line-height: 1.45; }
  .ios-tip {
    margin: 0 0 16px; padding: 10px 12px; border-radius: 12px;
    background: rgba(34,211,238,0.12); border: 1px solid rgba(103,232,249,0.35);
    color: #a5f3fc; font-size: 0.86rem; line-height: 1.4; text-align: left;
  }
  .code {
    margin: 0 0 18px; font: 800 1.7rem/1 ui-monospace, Menlo, monospace;
    letter-spacing: 0.18em; color: #67e8f9;
  }
  .muted { margin: 0 0 12px; color: #a78bfa; font-size: 0.88rem; line-height: 1.4; }
  .apk-note { margin-top: 4px; font-size: 0.8rem; }
  .actions { display: flex; flex-direction: column; gap: 10px; }
  a.btn {
    display: block; text-decoration: none; padding: 15px 16px; border-radius: 999px;
    font-weight: 800; letter-spacing: 0.02em; font-size: 1rem;
  }
  a.primary {
    color: #041018;
    background: #22d3ee;
    box-shadow: 0 0 20px rgba(34,211,238,0.35);
  }
  a.secondary {
    color: #f3e8ff;
    border: 1px solid rgba(232,121,249,0.5);
    background: rgba(232,121,249,0.14);
  }
  a.ghost {
    color: #c4b5fd; font-size: 0.88rem; padding: 8px;
    background: transparent; border: 0;
  }
  .hint { margin: 16px 0 0; font-size: 0.78rem; color: #8b7cb8; line-height: 1.4; }
  code { font-size: 0.85em; color: #a5f3fc; }
</style>
</head>
<body>
  <main class="card">
    <h1>Up&amp;Down</h1>
    <p class="sub">Вас пригласили за стол. Нужна та же Wi‑Fi (или точка доступа), что у хоста — интернет не обязателен.</p>
    <p class="ios-tip"><strong>iPhone:</strong> нажмите большую кнопку ниже — игра откроется в Safari. Установка приложения не нужна.</p>
    ${codeBlock}
    <div class="actions">
      <a class="btn primary" id="playBtn" href="${esc(playHref)}">Открыть игру в браузере</a>
      ${apkBlock}
      <a class="btn secondary" href="${esc(appHref)}">У меня уже есть приложение (Android)</a>
      <a class="btn ghost" href="/play/">На главную игры</a>
    </div>
    <p class="hint">Если экран пустой — телефон не в той же сети, что ноут хоста.</p>
  </main>
</body>
</html>`;
}

/**
 * /apk — коротко + скачивание через fetch→blob (обход бага Chrome:
 * после «невозможно безопасно скачать» прямой .apk часто не сохраняется).
 */
export function buildApkReadyHtml(opts: {
  apkHref: string;
  zipHref: string;
  zipReady: boolean;
  sizeLabel: string;
  escapeHtml: (s: string) => string;
}): string {
  const esc = opts.escapeHtml;
  const zipBtn = opts.zipReady
    ? `<a class="btn alt" href="${esc(opts.zipHref)}" id="zipDl">Скачать ZIP</a>
       <p class="muted">Откройте архив → нажмите updown.apk → Установить.</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<meta name="color-scheme" content="dark"/>
<title>Up&amp;Down · APK</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100dvh; font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #f3e8ff; background: #0b0820;
    display: flex; align-items: center; justify-content: center; padding: 24px 16px;
  }
  .card {
    width: min(420px, 100%); padding: 24px 18px 18px; border-radius: 20px;
    border: 1px solid rgba(167,139,250,0.45); background: #120e2a; text-align: center;
  }
  h1 { margin: 0 0 6px; color: #67e8f9; font-size: 1.2rem; }
  .sub { margin: 0 0 16px; color: #c4b5fd; font-size: 0.9rem; }
  button.btn, a.btn {
    display: block; width: 100%; text-align: center; text-decoration: none;
    padding: 15px 16px; border-radius: 999px; font-weight: 800; font-size: 1rem;
    border: 0; cursor: pointer; margin: 0 0 10px; font-family: inherit;
    box-sizing: border-box;
  }
  button.btn, a.btn.main { color: #041018; background: #22d3ee; }
  a.btn.alt {
    color: #f3e8ff; background: rgba(232,121,249,0.16);
    border: 1px solid rgba(232,121,249,0.45);
  }
  button.btn.dl {
    display: none; color: #041018;
    background: linear-gradient(135deg, #5ee89a, #22d3ee);
  }
  button.btn.dl.on { display: block; }
  button.btn:disabled { opacity: 0.7; cursor: wait; }
  .bar {
    display: none; height: 10px; border-radius: 999px; overflow: hidden;
    background: rgba(167,139,250,0.2); margin: 0 0 10px;
  }
  .bar.on { display: block; }
  .bar > i {
    display: block; height: 100%; width: 0%;
    background: linear-gradient(90deg, #22d3ee, #a78bfa);
    transition: width 0.15s linear;
  }
  .status { min-height: 1.3em; margin: 0 0 12px; color: #a5f3fc; font-size: 0.88rem; font-weight: 700; }
  .muted { margin: 0 0 10px; color: #a78bfa; font-size: 0.8rem; line-height: 1.35; }
  a.ghost { display: block; color: #c4b5fd; font-size: 0.86rem; padding: 8px; text-decoration: none; }
</style>
</head>
<body>
  <main class="card">
    <h1>Скачивание</h1>
    <p class="sub">${esc(opts.sizeLabel)} · не гасите экран</p>
    <div class="bar" id="bar"><i id="barFill"></i></div>
    <p class="status" id="status"></p>
    <button type="button" class="btn" id="apkDl">Скачать и сохранить</button>
    <button type="button" class="btn dl" id="openDl">Перейти в Загрузки</button>
    ${zipBtn}
    <a class="ghost" href="/play/">Играть в браузере</a>
    <a class="ghost" href="/join">← Назад</a>
  </main>
  <script>
(function () {
  var btn = document.getElementById('apkDl');
  var openDl = document.getElementById('openDl');
  var status = document.getElementById('status');
  var bar = document.getElementById('bar');
  var fill = document.getElementById('barFill');
  var apkUrl = ${JSON.stringify(opts.apkHref)};
  var zipUrl = ${JSON.stringify(opts.zipHref)};
  var lastFile = null;
  var lastBlobUrl = '';

  function setStatus(t) { if (status) status.textContent = t || ''; }
  function setPct(p) {
    if (!bar || !fill) return;
    bar.classList.add('on');
    fill.style.width = Math.max(0, Math.min(100, p)) + '%';
  }
  function showDownloads() {
    if (openDl) openDl.classList.add('on');
  }
  function canShareFile(file) {
    try {
      return !!(navigator.canShare && navigator.canShare({ files: [file] }));
    } catch (e) {
      return false;
    }
  }

  /** Реально кладёт файл в «Загрузки» Chrome (могут спросить «Сохранить» — это нормально). */
  function saveToDownloadsFolder(blob) {
    if (lastBlobUrl) try { URL.revokeObjectURL(lastBlobUrl); } catch (e) {}
    lastBlobUrl = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = lastBlobUrl;
    a.download = 'updown.apk';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      try { URL.revokeObjectURL(lastBlobUrl); } catch (e) {}
    }, 120000);
  }

  async function downloadViaBlob() {
    btn.disabled = true;
    setStatus('Загрузка…');
    setPct(0);
    var res = await fetch(apkUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var total = Number(res.headers.get('Content-Length') || 0);
    var reader = res.body && res.body.getReader ? res.body.getReader() : null;
    var chunks = [];
    var received = 0;
    if (reader) {
      while (true) {
        var step = await reader.read();
        if (step.done) break;
        chunks.push(step.value);
        received += step.value.length;
        if (total > 0) {
          var pct = Math.round((received / total) * 100);
          setPct(pct);
          setStatus('Загрузка ' + pct + '%');
        } else {
          setStatus('Загрузка ' + Math.round(received / 1048576) + ' МБ…');
        }
      }
    } else {
      var buf = await res.arrayBuffer();
      chunks = [new Uint8Array(buf)];
      setPct(100);
    }
    setPct(100);
    setStatus('Сохраняем в Загрузки…');
    var blob = new Blob(chunks, { type: 'application/octet-stream' });
    lastFile = new File([blob], 'updown.apk', { type: 'application/vnd.android.package-archive' });
    /* Главный путь — в папку Загрузки (не Share: иначе файл «куда-то ушёл» и папки пустые). */
    saveToDownloadsFolder(blob);
    setStatus('Если Chrome спросит — нажмите «Сохранить». Потом: Загрузки → updown.apk');
    showDownloads();
    btn.disabled = false;
    btn.textContent = 'Скачать снова';
  }

  btn.addEventListener('click', function () {
    downloadViaBlob().catch(function (err) {
      console.error(err);
      setStatus('Сбой загрузки. Попробуйте ZIP.');
      btn.disabled = false;
      showDownloads();
    });
  });

  openDl.addEventListener('click', function () {
    /* Только открыть Загрузки — без повторного скачивания */
    function tip() {
      setStatus('Если папка не открылась: шторка уведомлений → updown.apk, или «Файлы» → Загрузки');
    }
    try {
      window.location.href = 'intent:#Intent;action=android.intent.action.VIEW_DOWNLOADS;end';
      setTimeout(tip, 800);
    } catch (e) {
      tip();
    }
  });
})();
  </script>
</body>
</html>`;
}

/** Страница /apk когда файла updown.apk ещё нет на хосте. */
export function buildApkMissingHtml(escapeHtml: (s: string) => string): string {
  const esc = escapeHtml;
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Up&amp;Down · APK</title>
<style>
  body { margin:0; min-height:100dvh; font-family:system-ui,-apple-system,sans-serif; color:#f3e8ff;
    background:#0b0820; display:grid; place-items:center; padding:24px 16px; }
  .card { max-width:440px; padding:24px; border-radius:18px; border:1px solid rgba(167,139,250,.45);
    background:#120e2a; line-height:1.45; }
  h1 { margin:0 0 10px; color:#67e8f9; font-size:1.2rem; }
  code { color:#a5f3fc; }
  a { color:#a78bfa; }
</style>
</head>
<body>
  <main class="card">
    <h1>APK пока не на хосте</h1>
    <p>Положите файл <code>dist-host/apk/updown.apk</code> на ПК хоста или нажмите «Получить APK» на панели.</p>
    <p>Пока можно играть в браузере: <a href="/play/">/play/</a>.</p>
  </main>
</body>
</html>`;
}
