#!/bin/bash
# Скрипт для деплоя на Vercel

set -e

echo "🚀 Деплой на Vercel..."

# Проверка наличия Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI не установлен"
    echo "Установите: npm install -g vercel"
    exit 1
fi

# Проверка переменных окружения
echo "📋 Проверка переменных окружения..."

required_vars=(
    "NEXT_PUBLIC_SUPABASE_URL"
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    "SUPABASE_SERVICE_ROLE_KEY"
)

missing_vars=()

for var in "${required_vars[@]}"; do
    if ! vercel env ls | grep -q "$var"; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    echo "⚠️  Отсутствуют переменные окружения:"
    for var in "${missing_vars[@]}"; do
        echo "   - $var"
    done
    echo ""
    echo "Добавьте их через: vercel env add $var"
    read -p "Продолжить деплой? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Деплой
echo "📦 Деплой проекта..."
vercel --prod

echo "✅ Деплой завершен!"
echo "🌐 Проверьте ваш проект на Vercel Dashboard"
