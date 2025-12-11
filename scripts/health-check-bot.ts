#!/usr/bin/env tsx

/**
 * Health-check скрипт для проверки работоспособности бота
 * Отправляет тестовое сообщение и проверяет, что бот отвечает
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TEST_CHAT_ID = process.env.TEST_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN не установлен');
  process.exit(1);
}

if (!TEST_CHAT_ID) {
  console.error('❌ TEST_CHAT_ID не установлен');
  process.exit(1);
}

async function healthCheck() {
  console.log('🏥 Выполняю health-check бота...');

  try {
    // Отправляем тестовое сообщение
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: TEST_CHAT_ID,
          text: '🧪 Health-check: бот работает корректно',
          parse_mode: 'HTML',
        }),
      }
    );

    const data = await response.json();

    if (data.ok) {
      console.log('✅ Health-check пройден: бот отвечает');
      console.log(`   Message ID: ${data.result.message_id}`);
      return true;
    } else {
      console.error('❌ Health-check не пройден:', data.description);
      return false;
    }
  } catch (error: any) {
    console.error('❌ Ошибка health-check:', error.message);
    return false;
  }
}

// Проверяем, что бот может получить информацию о себе
async function checkBotInfo() {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`
    );
    const data = await response.json();

    if (data.ok) {
      console.log(`✅ Бот активен: @${data.result.username}`);
      return true;
    } else {
      console.error('❌ Бот не активен:', data.description);
      return false;
    }
  } catch (error: any) {
    console.error('❌ Ошибка проверки бота:', error.message);
    return false;
  }
}

// Запускаем проверки
async function runHealthCheck() {
  console.log('🔍 Проверяю статус бота...\n');

  const botInfoOk = await checkBotInfo();
  console.log('');

  const messageOk = await healthCheck();
  console.log('');

  if (botInfoOk && messageOk) {
    console.log('✅ Все проверки пройдены успешно!');
    process.exit(0);
  } else {
    console.error('❌ Некоторые проверки не пройдены');
    process.exit(1);
  }
}

runHealthCheck();
