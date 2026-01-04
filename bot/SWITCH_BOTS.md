# Инструкция: Переключение между тестовым и production ботом

## Текущая настройка:
- **Тестовый бот**: `.env.dev` (токен: 8528023493:..., URL: dev preview)
- **Production бот**: `.env` (токен: 8405125963:..., URL: production)

## Как переключиться на сервере:

### Остановить тестовый бот и запустить production:

```bash
# 1. Подключитесь к серверу
ssh user@your-server

# 2. Перейдите в папку бота
cd /path/to/step-one-app/bot

# 3. Остановите тестовый бот (если запущен)
pm2 stop step-one-bot
# или
pm2 delete step-one-bot

# 4. Убедитесь, что .env содержит production настройки
# (уже сделано: .env.production скопирован в .env)

# 5. Пересоберите проект
npm run build

# 6. Запустите production бота
pm2 start ecosystem.config.js
# или если используете production конфиг:
pm2 start ecosystem.production.config.js

# 7. Проверьте статус
pm2 list
pm2 logs step-one-bot --lines 50
```

### Вернуться к тестовому боту:

```bash
# 1. Остановите production бота
pm2 stop step-one-bot

# 2. Восстановите тестовый .env
cp .env.dev .env

# 3. Пересоберите
npm run build

# 4. Запустите тестовый бот
pm2 start ecosystem.config.js
```

## Быстрое переключение (скрипт):

Можно создать скрипт для быстрого переключения:

```bash
# switch-to-production.sh
#!/bin/bash
cd /path/to/step-one-app/bot
pm2 stop step-one-bot
cp .env.production .env
npm run build
pm2 start ecosystem.config.js
echo "✅ Переключено на production бота"

# switch-to-dev.sh
#!/bin/bash
cd /path/to/step-one-app/bot
pm2 stop step-one-bot
cp .env.dev .env
npm run build
pm2 start ecosystem.config.js
echo "✅ Переключено на тестовый бот"
```

