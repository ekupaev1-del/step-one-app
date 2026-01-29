#!/bin/bash

# Конфигурация (замените на свои значения)
SERVER_USER="your-user"
SERVER_HOST="your-server-ip-or-domain"
SERVER_PATH="/path/to/step-one-app"
# Для тестового бота используйте dev, для продакшена - main
BRANCH="dev"

echo "🚀 Деплой бота на сервер..."
echo ""

# Проверяем, что мы в правильной директории
if [ ! -f "package.json" ]; then
  echo "❌ Ошибка: запустите скрипт из папки bot/"
  exit 1
fi

echo "📦 Подключение к серверу..."
echo ""

# SSH команды для деплоя
ssh ${SERVER_USER}@${SERVER_HOST} << EOF
  set -e
  echo "📂 Переход в директорию проекта..."
  cd ${SERVER_PATH}/bot
  
  echo "🔄 Обновление кода из Git..."
  git pull origin ${BRANCH}
  
  echo "📥 Установка зависимостей..."
  npm install --production
  
  echo "🔨 Сборка проекта..."
  npm run build
  
  echo "🔄 Перезапуск бота через PM2..."
  pm2 restart step-one-bot || pm2 start ecosystem.config.js
  
  echo "✅ Деплой завершен!"
  pm2 status
EOF

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Деплой успешно завершен!"
else
  echo ""
  echo "❌ Ошибка при деплое"
  exit 1
fi


