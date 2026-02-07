#!/bin/bash
# Автоматический деплой на Vercel
# Запустите: cd miniapp && chmod +x auto-deploy.sh && ./auto-deploy.sh

set -e

echo "🚀 Автоматический деплой на Vercel"
echo ""

# Проверка Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI не установлен"
    echo "Установите: npm install -g vercel"
    exit 1
fi

VERCEL_VERSION=$(vercel --version)
echo "✅ Vercel CLI: $VERCEL_VERSION"
echo ""

# Проверка авторизации
echo "🔐 Проверка авторизации..."
if ! vercel whoami &> /dev/null; then
    echo "⚠️  Необходима авторизация"
    echo "Запустите: vercel login"
    vercel login
fi

WHOAMI=$(vercel whoami)
echo "✅ Авторизован как: $WHOAMI"
echo ""

# Проверка переменных окружения
echo "📋 Проверка переменных окружения..."
ENV_VARS=$(vercel env ls 2>&1)

REQUIRED_VARS=("NEXT_PUBLIC_SUPABASE_URL" "NEXT_PUBLIC_SUPABASE_ANON_KEY" "SUPABASE_SERVICE_ROLE_KEY")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if ! echo "$ENV_VARS" | grep -q "$var"; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo "⚠️  Отсутствуют переменные окружения:"
    for var in "${MISSING_VARS[@]}"; do
        echo "   - $var"
    done
    echo ""
    echo "Добавьте их через:"
    for var in "${MISSING_VARS[@]}"; do
        echo "   vercel env add $var"
    done
    echo ""
    read -p "Продолжить деплой без этих переменных? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✅ Все переменные окружения установлены"
fi

echo ""

# Деплой
echo "📦 Начинаю деплой..."
echo ""

if vercel --prod --yes; then
    echo ""
    echo "✅ Деплой успешно завершен!"
    echo ""
    echo "🌐 Проверьте ваш проект на Vercel Dashboard"
    echo "   https://vercel.com/dashboard"
else
    echo ""
    echo "❌ Ошибка при деплое"
    exit 1
fi
