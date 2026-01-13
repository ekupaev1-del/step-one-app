#!/bin/bash
# Скрипт для автоматического мержа dev в main и деплоя в production

set -e

echo "🔄 Мержим dev в main..."

# Переключаемся на main
git checkout main

# Мержим dev в main
git merge dev --no-edit

# Пушим в main (это запустит production деплой в Vercel)
git push origin main

echo "✅ Изменения из dev успешно запушены в main"
echo "🚀 Vercel автоматически обновит production"
echo ""
echo "📋 Production URL: https://step-one-app.vercel.app"
echo ""
echo "⚠️  Возвращаемся в dev для дальнейшей работы..."

# Возвращаемся в dev
git checkout dev

echo "✅ Готово! Вы в ветке dev, production обновлен."
