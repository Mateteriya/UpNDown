/**
 * Копирует markdown из корня репозитория в docs-site/public/repo-docs/
 * чтобы ссылки в портале открывали документы локально (не только GitHub).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const outRoot = resolve(here, '../public/repo-docs');

const ROOT_MD = ['AGENTS.md', 'TZ.md'];

function copyMdTree(srcDir, relPrefix) {
  const manifest = [];
  if (!existsSync(srcDir)) return manifest;

  for (const name of readdirSync(srcDir)) {
    const full = join(srcDir, name);
    const rel = relPrefix ? `${relPrefix}/${name}` : name;
    if (statSync(full).isDirectory()) {
      manifest.push(...copyMdTree(full, rel));
    } else if (name.toLowerCase().endsWith('.md')) {
      const dest = join(outRoot, rel);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(full, dest);
      manifest.push(rel.replace(/\\/g, '/'));
    }
  }
  return manifest;
}

if (existsSync(outRoot)) {
  rmSync(outRoot, { recursive: true, force: true });
}
mkdirSync(outRoot, { recursive: true });

const files = [...copyMdTree(resolve(repoRoot, 'docs'), 'docs')];

for (const name of ROOT_MD) {
  const src = resolve(repoRoot, name);
  if (!existsSync(src)) continue;
  const dest = join(outRoot, name);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  files.push(name);
}

files.sort((a, b) => a.localeCompare(b, 'ru'));

writeFileSync(
  join(outRoot, 'manifest.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), count: files.length, files }, null, 2),
  'utf8',
);

console.log(`[sync-repo-docs] ${files.length} markdown files → public/repo-docs/`);
