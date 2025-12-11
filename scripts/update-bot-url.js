#!/usr/bin/env node

/**
 * Скрипт для обновления MINIAPP_BASE_URL в bot/src/index.ts
 * Принимает новый URL как аргумент командной строки
 */

const fs = require('fs');
const path = require('path');

const BOT_INDEX_PATH = path.join(__dirname, '..', 'bot', 'src', 'index.ts');
const NEW_URL = process.argv[2];

if (!NEW_URL) {
  console.error('❌ Не указан новый URL');
  console.error('Использование: node scripts/update-bot-url.js <NEW_URL>');
  process.exit(1);
}

// Валидация URL
try {
  new URL(NEW_URL);
} catch (e) {
  console.error('❌ Некорректный URL:', NEW_URL);
  process.exit(1);
}

// Читаем файл
let content;
try {
  content = fs.readFileSync(BOT_INDEX_PATH, 'utf8');
} catch (error) {
  console.error('❌ Ошибка чтения файла:', error.message);
  process.exit(1);
}

// Ищем и заменяем MINIAPP_BASE_URL
// Паттерн: const MINIAPP_BASE_URL = process.env.MINIAPP_BASE_URL || "старый-url";
const urlPattern = /(const\s+MINIAPP_BASE_URL\s*=\s*process\.env\.MINIAPP_BASE_URL\s*\|\|\s*")([^"]+)(")/;

if (!urlPattern.test(content)) {
  console.error('❌ Не найден паттерн MINIAPP_BASE_URL в файле');
  process.exit(1);
}

const oldContent = content;
const newContent = content.replace(urlPattern, `$1${NEW_URL}$3`);

// Также обновляем fallback в getMainMenuKeyboard
const baseUrlPattern = /(const\s+baseUrl\s*=\s*\(MINIAPP_BASE_URL\s*\|\|\s*")([^"]+)("\))/;
const finalContent = newContent.replace(baseUrlPattern, `$1${NEW_URL}$3`);

// Проверяем, были ли изменения
if (oldContent === finalContent) {
  console.log('ℹ️ URL уже актуален, изменений не требуется');
  process.exit(0);
}

// Записываем обновленный файл
try {
  fs.writeFileSync(BOT_INDEX_PATH, finalContent, 'utf8');
  console.log(`✅ MINIAPP_BASE_URL обновлен на: ${NEW_URL}`);
} catch (error) {
  console.error('❌ Ошибка записи файла:', error.message);
  process.exit(1);
}
