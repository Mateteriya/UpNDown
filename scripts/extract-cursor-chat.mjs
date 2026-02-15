/**
 * Однократное извлечение чата Cursor из state.vscdb.
 * Запуск: закрыть Cursor, затем из папки проекта:
 *   node scripts/extract-cursor-chat.mjs
 * Или с путём к копии БД:
 *   node scripts/extract-cursor-chat.mjs "C:\path\to\state.vscdb"
 *
 * Папка воркспейса Up$Down: 625825e8ddf7c68ce7c82ad662261529
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const WORKSPACE_HASH = '625825e8ddf7c68ce7c82ad662261529';
const defaultDbPath = process.env.APPDATA
  ? join(process.env.APPDATA, 'Cursor', 'User', 'workspaceStorage', WORKSPACE_HASH, 'state.vscdb')
  : null;

const dbPath = process.argv[2] || defaultDbPath;
if (!dbPath) {
  console.error('Укажите путь к state.vscdb или запускайте на Windows (APPDATA).');
  process.exit(1);
}

if (!existsSync(dbPath)) {
  console.error('Файл не найден:', dbPath);
  console.error('Закройте Cursor и повторите попытку.');
  process.exit(1);
}

async function main() {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  let initSqlJs;
  try {
    initSqlJs = require('sql.js');
  } catch (e) {
    console.error('Установите sql.js: npm install sql.js --save-dev');
    process.exit(1);
  }

  const SQL = await initSqlJs();
  let buffer;
  try {
    buffer = readFileSync(dbPath);
  } catch (e) {
    if (e.code === 'EBUSY' || e.code === 'EPERM') {
      console.error('Файл занят. Полностью закройте Cursor (включая фоновые процессы) и повторите.');
    } else {
      console.error('Ошибка чтения:', e.message);
    }
    process.exit(1);
  }

  const db = new SQL.Database(buffer);
  const allKeysRes = db.exec('SELECT key FROM ItemTable');
  const allKeys = allKeysRes.length && allKeysRes[0].values.length ? allKeysRes[0].values.map((r) => r[0]) : [];
  const chatLikeKeys = allKeys.filter((k) => /chat|aichat|prompt|composer|conversation/i.test(k));
  let keysToCheck = chatLikeKeys.length ? chatLikeKeys : allKeys;
  console.log('Проверяем ключей:', keysToCheck.length, chatLikeKeys.length ? '(по ключам чата)' : '(все)');

  const targetTitle = 'Позиционирование элементов карт для мобильной версии';
  const outDir = join(projectRoot, 'extracted-chat');
  const searchTerms = ['Позиционирование', 'позиционирование', 'мобильной', 'карт', '2001aa09-ea47-48a5-8635-b528722eea8c'];

  const stmt = db.prepare('SELECT value FROM ItemTable WHERE key = ?');
  for (const key of keysToCheck) {
    stmt.bind([key]);
    if (!stmt.step()) {
      stmt.reset();
      continue;
    }
    const value = stmt.getAsObject().value;
    stmt.reset();
    if (value == null || typeof value !== 'string') continue;

    let data;
    try {
      data = JSON.parse(value);
    } catch {
      continue;
    }

    const str = JSON.stringify(data);
    if (!searchTerms.some((term) => str.includes(term))) continue;

    console.log('Найден ключ:', key);
    const outPath = join(outDir, `chat-${key.replace(/[^a-zA-Z0-9.-]/g, '_')}.json`);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
    console.log('Сохранено:', outPath);

    if (data.chatSessions || data.sessions || Array.isArray(data)) {
      const sessions = data.chatSessions || data.sessions || data;
      for (const s of sessions) {
        const title = s.title || s.name || s.id || '';
        if (title.includes('Позиционирование') || title.includes('мобильной') || title.includes('карт')) {
          console.log('\n--- Найден чат:', title, '---');
          const msgPath = join(outDir, `chat-${(title || 'session').replace(/[^a-zA-Z0-9 а-яё-]/gi, '_')}.json`);
          writeFileSync(msgPath, JSON.stringify(s, null, 2), 'utf8');
          console.log('Содержимое чата сохранено:', msgPath);
        }
      }
    }
  }

  stmt.free();
  db.close();
  console.log('\nГотово. Проверьте папку extracted-chat в корне проекта.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
