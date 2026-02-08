#!/bin/bash

# Скрипт для проверки настроек Vercel

echo "🔍 Проверка настроек Vercel..."
echo ""

# Проверка vercel.json
if [ -f "vercel.json" ]; then
  echo "✅ vercel.json найден"
  
  # Проверка rootDirectory
  if grep -q '"rootDirectory": "miniapp"' vercel.json; then
    echo "✅ rootDirectory установлен в 'miniapp'"
  else
    echo "⚠️  rootDirectory не установлен в 'miniapp'"
  fi
else
  echo "❌ vercel.json не найден"
fi

# Проверка miniapp/vercel.json
if [ -f "miniapp/vercel.json" ]; then
  echo "✅ miniapp/vercel.json найден"
else
  echo "⚠️  miniapp/vercel.json не найден (необязательно)"
fi

# Проверка package.json в miniapp
if [ -f "miniapp/package.json" ]; then
  echo "✅ miniapp/package.json найден"
else
  echo "❌ miniapp/package.json не найден"
fi

# Проверка next.config.ts
if [ -f "miniapp/next.config.ts" ] || [ -f "miniapp/next.config.js" ]; then
  echo "✅ next.config найден"
else
  echo "⚠️  next.config не найден"
fi

echo ""
echo "📋 Что нужно проверить в Vercel Dashboard:"
echo "   1. Root Directory = 'miniapp'"
echo "   2. Production Branch = 'main'"
echo "   3. Все переменные окружения установлены"
echo "   4. Git Integration подключен"
echo ""
echo "📖 Подробная инструкция: VERCEL_AUTO_DEPLOY.md"
