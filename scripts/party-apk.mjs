/**
 * Раздача APK для спец. хоста / вечеринки.
 *
 *   npm run party:apk
 *
 * 1) При --build: полная веб-сборка + cap sync + иконки (иначе в APK попадёт старая заглушка)
 * 2) gradlew assembleDebug
 * 3) Копирует в dist-host/apk/updown.apk
 *
 * На Windows сам ищет JAVA_HOME в JBR Android Studio и ANDROID_HOME в типичных путях.
 * Флаг --no-sync: только gradle (если только что делали npm run cap:sync).
 *
 * Код выхода: 0 = готово; 2 = SDK/APK нет (инструкция в stdout).
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist-host', 'apk');
const outFile = join(outDir, 'updown.apk');
const androidApp = join(root, 'android', 'app');
const wantBuild = process.argv.includes('--build');
const skipSync = process.argv.includes('--no-sync');
function runNpmLike(cmd, args, env) {
  if (process.platform === 'win32') {
    const q = (s) => (/\s/.test(s) ? `"${s}"` : s);
    const line = [cmd, ...args].map(q).join(' ');
    return spawnSync('cmd.exe', ['/d', '/s', '/c', line], {
      cwd: root,
      encoding: 'utf8',
      env,
      windowsHide: true,
    });
  }
  return spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    env,
  });
}

function findApks(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) findApks(p, acc);
    else if (name.endsWith('.apk')) acc.push(p);
  }
  return acc;
}

function pickBestApk(paths) {
  if (!paths.length) return null;
  const scored = paths.map((p) => {
    const n = p.replace(/\\/g, '/').toLowerCase();
    let score = 0;
    if (n.includes('/release/')) score += 30;
    if (n.includes('updown') || n.includes('app-release')) score += 10;
    if (n.includes('app-debug')) score += 5;
    try {
      score += Math.min(20, Math.log10(statSync(p).size || 1));
    } catch {
      /* */
    }
    return { p, score, mtime: statSync(p).mtimeMs };
  });
  scored.sort((a, b) => b.score - a.score || b.mtime - a.mtime);
  return scored[0].p;
}

/** @returns {string | null} */
function firstExistingDir(candidates) {
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

/** JBR из Android Studio / системный JAVA_HOME */
function resolveJavaHome() {
  if (process.env.JAVA_HOME && existsSync(join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'))) {
    return process.env.JAVA_HOME;
  }
  const home = homedir();
  const winCandidates = [
    'D:\\Program Files\\Android Studio\\jbr',
    'C:\\Program Files\\Android Studio\\jbr',
    join(home, 'AppData', 'Local', 'Programs', 'Android Studio', 'jbr'),
    'C:\\Program Files\\Android\\Android Studio\\jbr',
    'C:\\Program Files\\Eclipse Adoptium\\jdk-21',
    'C:\\Program Files\\Microsoft\\jdk-21',
  ];
  const macCandidates = [
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    '/Applications/Android Studio.app/Contents/jre/Contents/Home',
  ];
  const jbr = firstExistingDir(process.platform === 'win32' ? winCandidates : macCandidates);
  if (jbr) return jbr;
  // Иногда java уже в PATH
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['java'], {
    encoding: 'utf8',
    shell: true,
  });
  if (which.status === 0 && which.stdout?.trim()) {
    return null; // PATH хватит, JAVA_HOME не обязателен
  }
  return null;
}

/** SDK с platforms/ или build-tools/ — пустой каталог не берём */
function sdkLooksUsable(sdk) {
  if (!sdk || !existsSync(sdk)) return false;
  return existsSync(join(sdk, 'platforms')) || existsSync(join(sdk, 'build-tools'));
}

function resolveAndroidSdk() {
  const home = homedir();
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    'D:\\Android\\Sdk',
    join(home, 'AppData', 'Local', 'Android', 'Sdk'),
    join(home, 'Android', 'Sdk'),
    'C:\\Android\\Sdk',
  ].filter(Boolean);
  for (const p of candidates) {
    if (sdkLooksUsable(p)) return p;
  }
  return firstExistingDir(candidates);
}

function buildEnv() {
  const env = { ...process.env };
  const javaHome = resolveJavaHome();
  if (javaHome) {
    env.JAVA_HOME = javaHome;
    const bin = join(javaHome, 'bin');
    const sep = process.platform === 'win32' ? ';' : ':';
    const prev = env.Path || env.PATH || '';
    const next = `${bin}${sep}${prev}`;
    env.PATH = next;
    env.Path = next;
  }
  const sdk = resolveAndroidSdk();
  if (sdk) {
    env.ANDROID_HOME = sdk;
    env.ANDROID_SDK_ROOT = sdk;
  }
  return { env, javaHome, sdk };
}

function resolveNpmCmd() {
  const candidates =
    process.platform === 'win32'
      ? [
          join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'npm.cmd'),
          join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'npm.cmd'),
        ]
      : ['npm'];
  return firstExistingDir(candidates.map((p) => dirname(p)))
    ? candidates.find((p) => existsSync(p)) || 'npm'
    : 'npm';
}

function resolveNpxCmd() {
  if (process.platform !== 'win32') return 'npx';
  const npm = resolveNpmCmd();
  if (npm.endsWith('npm.cmd')) return npm.replace(/npm\.cmd$/i, 'npx.cmd');
  return 'npx';
}

/** Gradle читает android/local.properties — пишем рабочий sdk.dir */
function ensureLocalProperties(sdk) {
  const propsPath = join(root, 'android', 'local.properties');
  const escaped = sdk.replace(/\\/g, '\\\\');
  const body =
    '## Generated by scripts/party-apk.mjs — local only (gitignored)\n' +
    `sdk.dir=${escaped}\n`;
  writeFileSync(propsPath, body, 'utf8');
  console.log('[party:apk] local.properties →', sdk);
}

function tryGradleAssemble() {
  const gradlew = join(root, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  if (!existsSync(gradlew)) {
    return { ok: false, reason: 'нет android/gradlew — сначала cap add android / cap sync' };
  }
  const { env, javaHome, sdk } = buildEnv();
  if (!sdk || !sdkLooksUsable(sdk)) {
    return {
      ok: false,
      reason:
        'Нет рабочего Android SDK (нужны platforms/build-tools). Установите SDK в Android Studio, затем: npm run party:apk -- --build',
    };
  }
  if (!javaHome) {
    const hasJava = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['java'], {
      encoding: 'utf8',
      shell: true,
      env,
    });
    if (hasJava.status !== 0) {
      return {
        ok: false,
        reason:
          'Нет Java (JAVA_HOME). Обычно хватает JBR из Android Studio — проверьте установку Studio и снова: npm run party:apk -- --build',
      };
    }
  }
  try {
    ensureLocalProperties(sdk);
  } catch (e) {
    return {
      ok: false,
      reason: 'не удалось записать android/local.properties: ' + (e instanceof Error ? e.message : e),
    };
  }
  if (!skipSync) {
    // Без `tsc`: в репо часто есть TS-ошибки, а в APK нужен актуальный vite dist.
    console.log('[party:apk] vite build + cap sync (полная игра в APK)…');
    const npx = resolveNpxCmd();
    const node = process.execPath;
    const fav = runNpmLike(node, [join(root, 'scripts', 'gen-favicon.mjs')], env);
    if (fav.status !== 0) {
      console.warn(fav.stdout || '');
      console.warn(fav.stderr || '');
    }
    const build = runNpmLike(npx, ['vite', 'build'], env);
    if (build.status !== 0) {
      console.error(build.stdout || '');
      console.error(build.stderr || '');
      return { ok: false, reason: 'vite build завершился с ошибкой' };
    }
    const sync = runNpmLike(npx, ['cap', 'sync', 'android'], env);
    if (sync.status !== 0) {
      console.error(sync.stdout || '');
      console.error(sync.stderr || '');
      return { ok: false, reason: 'npx cap sync android завершился с ошибкой' };
    }
    const icons = spawnSync(process.execPath, [join(root, 'scripts', 'gen-android-icons.mjs')], {
      cwd: root,
      encoding: 'utf8',
      env,
    });
    if (icons.status !== 0) {
      console.warn(icons.stdout || '');
      console.warn(icons.stderr || '');
      console.warn('[party:apk] иконки не обновились — продолжаем со старыми');
    } else {
      console.log(icons.stdout?.trim() || '[party:apk] иконки OK');
    }
  } else {
    console.log('[party:apk] --no-sync: пропускаем веб-сборку');
  }

  console.log('[party:apk] JAVA_HOME =', env.JAVA_HOME || '(из PATH)');
  console.log('[party:apk] ANDROID_HOME =', sdk);
  console.log('[party:apk] gradlew assembleDebug…');
  const r = spawnSync(gradlew, ['assembleDebug', '-p', join(root, 'android')], {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    env,
  });
  if (r.status !== 0) {
    console.error(r.stdout || '');
    console.error(r.stderr || '');
    return { ok: false, reason: 'gradlew assembleDebug завершился с ошибкой' };
  }
  return { ok: true };
}

mkdirSync(outDir, { recursive: true });

if (wantBuild) {
  const b = tryGradleAssemble();
  if (!b.ok) {
    console.error('[party:apk]', b.reason);
    console.error('');
    console.error('Вручную:');
    console.error('  1) npm run cap:sync');
    console.error('  2) Android Studio → Build → Build APK(s)');
    console.error('  3) скопируйте APK → dist-host/apk/updown.apk');
    console.error('     или снова: npm run party:apk');
    process.exit(2);
  }
}

const candidates = findApks(join(androidApp, 'build', 'outputs'));
const src = pickBestApk(candidates);

if (!src) {
  console.error('[party:apk] APK не найден в android/app/build/outputs/');
  console.error('');
  console.error('Сделайте одно из:');
  console.error('  npm run party:apk -- --build     (нужен Android SDK)');
  console.error('  или соберите APK в Android Studio и снова npm run party:apk');
  console.error('');
  console.error('Папка раздачи уже есть:', outDir);
  process.exit(2);
}

copyFileSync(src, outFile);
const zipFile = join(outDir, 'updown.zip');
try {
  if (existsSync(zipFile)) unlinkSync(zipFile);
} catch {
  /* */
}
if (process.platform === 'win32') {
  const zipPs = `Compress-Archive -LiteralPath '${outFile.replace(/'/g, "''")}' -DestinationPath '${zipFile.replace(/'/g, "''")}' -Force`;
  const z = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', zipPs], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (z.status === 0 && existsSync(zipFile)) {
    console.log('[party:apk] ZIP:', zipFile);
  } else {
    console.warn('[party:apk] ZIP не собран (не критично):', (z.stderr || z.stdout || '').trim());
  }
}
console.log('[party:apk] OK');
console.log('  из:', src);
console.log('  в: ', outFile);
console.log('Гости: /apk → «Скачать и сохранить» (после Старт на панели)');
process.exit(0);
