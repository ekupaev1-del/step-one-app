#!/usr/bin/env tsx

/**
 * Скрипт для обновления MINIAPP_BASE_URL в конфигурации бота
 * Получает preview URL из Vercel API и обновляет код
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const BOT_INDEX_PATH = join(process.cwd(), 'bot', 'src', 'index.ts');
const NEW_URL = process.argv[2];

if (!NEW_URL) {
  console.error('❌ Не указан новый URL');
  console.error('Использование: tsx scripts/update_miniapp_url.ts <NEW_URL>');
  process.exit(1);
}

// Валидация URL
try {
  new URL(NEW_URL);
} catch (e) {
  console.error('❌ Некорректный URL:', NEW_URL);
  process.exit(1);
}

// Проверка доступности URL
async function checkUrlAvailability(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000), // 10 секунд таймаут
    });
    return response.ok || response.status === 301 || response.status === 302;
  } catch (error) {
    console.warn('⚠️ Не удалось проверить доступность URL:', error);
    return true; // Продолжаем даже если проверка не удалась
  }
}

async function updateBotUrl() {
  console.log(`🔄 Обновляю MINIAPP_BASE_URL на: ${NEW_URL}`);

  // Проверяем доступность URL
  console.log('🔍 Проверяю доступность URL...');
  const isAvailable = await checkUrlAvailability(NEW_URL);
  if (!isAvailable) {
    console.warn('⚠️ URL недоступен, но продолжаю обновление');
  } else {
    console.log('✅ URL доступен');
  }

  // Читаем файл
  let content: string;
  try {
    content = readFileSync(BOT_INDEX_PATH, 'utf8');
  } catch (error: any) {
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
  let newContent = content.replace(urlPattern, `$1${NEW_URL}$3`);

  // Также обновляем fallback в getMainMenuKeyboard
  const baseUrlPattern = /(const\s+baseUrl\s*=\s*\(MINIAPP_BASE_URL\s*\|\|\s*")([^"]+)("\))/;
  newContent = newContent.replace(baseUrlPattern, `$1${NEW_URL}$3`);

  // Проверяем, были ли изменения
  if (oldContent === newContent) {
    console.log('ℹ️ URL уже актуален, изменений не требуется');
    process.exit(0);
  }

  // Записываем обновленный файл
  try {
    writeFileSync(BOT_INDEX_PATH, newContent, 'utf8');
    console.log(`✅ MINIAPP_BASE_URL обновлен на: ${NEW_URL}`);
    console.log(`✅ Файл сохранен: ${BOT_INDEX_PATH}`);
  } catch (error: any) {
    console.error('❌ Ошибка записи файла:', error.message);
    process.exit(1);
  }
}

// Запускаем обновление
updateBotUrl().catch((error) => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});
