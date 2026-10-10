/**
 * Пишет mipmap-иконки Android из public/icon-512.png (или icon-256.png).
 * Windows: System.Drawing через PowerShell. Без sharp.
 */
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = join(root, 'android', 'app', 'src', 'main', 'res');

const src =
  [join(root, 'public', 'icon-512.png'), join(root, 'public', 'icon-256.png'), join(root, 'public', 'icon.png')].find(
    (p) => existsSync(p),
  ) || null;

if (!src) {
  console.warn('[gen-android-icons] нет public/icon-512.png — пропуск');
  process.exit(0);
}

if (process.platform !== 'win32') {
  console.warn('[gen-android-icons] пока только Windows — пропуск');
  process.exit(0);
}

/** @type {{ folder: string, launcher: number, foreground: number }[]} */
const dens = [
  { folder: 'mipmap-mdpi', launcher: 48, foreground: 108 },
  { folder: 'mipmap-hdpi', launcher: 72, foreground: 162 },
  { folder: 'mipmap-xhdpi', launcher: 96, foreground: 216 },
  { folder: 'mipmap-xxhdpi', launcher: 144, foreground: 324 },
  { folder: 'mipmap-xxxhdpi', launcher: 192, foreground: 432 },
];

const jobs = dens.flatMap(({ folder, launcher, foreground }) => {
  const dir = join(res, folder);
  mkdirSync(dir, { recursive: true });
  return [
    { out: join(dir, 'ic_launcher.png'), size: launcher },
    { out: join(dir, 'ic_launcher_round.png'), size: launcher },
    { out: join(dir, 'ic_launcher_foreground.png'), size: foreground },
  ];
});

const listPath = join(tmpdir(), `updown-icon-jobs-${Date.now()}.json`);
writeFileSync(listPath, JSON.stringify({ src, jobs }), 'utf8');

const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$cfg = Get-Content -Raw -Encoding UTF8 '${listPath.replace(/'/g, "''")}' | ConvertFrom-Json
$img = [System.Drawing.Image]::FromFile($cfg.src)
try {
  foreach ($j in $cfg.jobs) {
    $bmp = New-Object System.Drawing.Bitmap ([int]$j.size), ([int]$j.size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(255, 10, 6, 28))
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $pad = [int]([Math]::Round([double]$j.size * 0.12))
    $g.DrawImage($img, $pad, $pad, $j.size - 2 * $pad, $j.size - 2 * $pad)
    $g.Dispose()
    $bmp.Save($j.out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
  }
} finally {
  $img.Dispose()
}
Remove-Item -Force '${listPath.replace(/'/g, "''")}'
Write-Output 'OK'
`;

const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
  encoding: 'utf8',
});
if (r.status !== 0) {
  console.error(r.stdout || '');
  console.error(r.stderr || '');
  console.error('[gen-android-icons] не удалось сгенерировать иконки');
  process.exit(1);
}

const bgColor = join(res, 'values', 'ic_launcher_background.xml');
if (existsSync(dirname(bgColor))) {
  writeFileSync(
    bgColor,
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0A061C</color>
</resources>
`,
    'utf8',
  );
}

console.log('[gen-android-icons] OK из', src);
process.exit(0);
