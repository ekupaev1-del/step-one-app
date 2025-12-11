#!/bin/bash

# Простой скрипт для обновления URL бота
# Использование: ./scripts/sync-bot-url.sh <PREVIEW_URL>

set -e

PREVIEW_URL="$1"
BOT_INDEX="bot/src/index.ts"

if [ -z "$PREVIEW_URL" ]; then
  echo "❌ Укажи preview URL"
  echo "Использование: ./scripts/sync-bot-url.sh https://step-one-app-git-dev-xxxxxx.vercel.app"
  exit 1
fi

# Проверяем формат URL
if [[ ! "$PREVIEW_URL" =~ ^https?:// ]]; then
  echo "❌ Некорректный URL. Должен начинаться с http:// или https://"
  exit 1
fi

echo "🔄 Обновляю MINIAPP_BASE_URL на: $PREVIEW_URL"

# Обновляем bot/src/index.ts
if [ ! -f "$BOT_INDEX" ]; then
  echo "❌ Файл $BOT_INDEX не найден"
  exit 1
fi

# Используем sed для замены (работает на macOS и Linux)
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  sed -i '' "s|process.env.MINIAPP_BASE_URL ||\"https://step-one-app.vercel.app\"|process.env.MINIAPP_BASE_URL ||\"$PREVIEW_URL\"|g" "$BOT_INDEX"
  sed -i '' "s|MINIAPP_BASE_URL || \"https://step-one-app.vercel.app\"|MINIAPP_BASE_URL || \"$PREVIEW_URL\"|g" "$BOT_INDEX"
else
  # Linux
  sed -i "s|process.env.MINIAPP_BASE_URL ||\"https://step-one-app.vercel.app\"|process.env.MINIAPP_BASE_URL ||\"$PREVIEW_URL\"|g" "$BOT_INDEX"
  sed -i "s|MINIAPP_BASE_URL || \"https://step-one-app.vercel.app\"|MINIAPP_BASE_URL || \"$PREVIEW_URL\"|g" "$BOT_INDEX"
fi

echo "✅ URL обновлен в $BOT_INDEX"
echo ""
echo "📝 Следующие шаги:"
echo "1. Проверь изменения: git diff bot/src/index.ts"
echo "2. Закоммить: git add bot/src/index.ts && git commit -m 'Обновить MINIAPP_BASE_URL'"
echo "3. Запушить: git push origin dev"
