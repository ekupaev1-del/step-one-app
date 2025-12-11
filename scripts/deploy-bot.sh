#!/bin/bash

# Простой скрипт для деплоя бота
# Использование: ./scripts/deploy-bot.sh

set -e

echo "🚀 Начинаю деплой бота..."

# 1. Получаем preview URL
echo "🔍 Получаю preview URL из Vercel..."
PREVIEW_URL=$(node scripts/get-vercel-preview-url.js | jq -r '.url // empty')

if [ -z "$PREVIEW_URL" ] || [ "$PREVIEW_URL" == "null" ]; then
  echo "⚠️ Preview URL не найден. Введи вручную:"
  read -p "Preview URL: " PREVIEW_URL
fi

echo "✅ Preview URL: $PREVIEW_URL"

# 2. Обновляем URL в коде
echo "🔄 Обновляю MINIAPP_BASE_URL..."
node scripts/update-bot-url.js "$PREVIEW_URL"

# 3. Коммитим
echo "💾 Коммичу изменения..."
git add bot/src/index.ts
git commit -m "Обновить MINIAPP_BASE_URL на $PREVIEW_URL" || echo "Нет изменений для коммита"

# 4. Пушим
echo "📤 Пушим в dev..."
git push origin dev

# 5. Рестарт бота (если на сервере)
if [ -n "$SSH_HOST" ]; then
  echo "🔄 Рестарт бота на сервере..."
  ssh "$SSH_USER@$SSH_HOST" "cd /path/to/bot && git pull && npm run build && pm2 restart step-one-bot"
else
  echo "⚠️ SSH_HOST не установлен, рестарт бота пропущен"
  echo "   Выполни вручную: pm2 restart step-one-bot"
fi

echo "✅ Деплой завершен!"
