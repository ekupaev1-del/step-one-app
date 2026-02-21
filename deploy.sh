#!/bin/bash

# Скрипт для автоматического деплоя в Vercel
# Использование: ./deploy.sh [production|preview]

set -e

ENV=${1:-preview}
BRANCH=$(git branch --show-current)

echo "🚀 Начинаю деплой в Vercel..."
echo "📦 Окружение: $ENV"
echo "🌿 Ветка: $BRANCH"

# Переходим в директорию miniapp
cd miniapp

# Проверяем, установлен ли Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "📦 Устанавливаю Vercel CLI..."
    npm install -g vercel
fi

# Проверяем, авторизованы ли мы в Vercel
if ! vercel whoami &> /dev/null; then
    echo "🔐 Требуется авторизация в Vercel..."
    vercel login
fi

# Деплоим
if [ "$ENV" = "production" ]; then
    echo "🚀 Деплою в production..."
    vercel --prod
else
    echo "🚀 Деплою в preview..."
    vercel
fi

echo "✅ Деплой завершён!"
