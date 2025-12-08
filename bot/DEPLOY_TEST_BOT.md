# Инструкция по обновлению тестового бота

## Проблема
Тестовый бот не показывает новые изменения из мини-приложения, потому что использует старый URL.

## Решение

### 1. Обновить код бота на сервере

Если бот запущен на сервере через PM2, нужно:

```bash
# Подключитесь к серверу
ssh user@your-server

# Перейдите в директорию бота
cd /path/to/step-one-app/bot

# Переключитесь на dev ветку (если еще не там)
git checkout dev

# Обновите код
git pull origin dev

# Пересоберите проект
npm install --production
npm run build

# Перезапустите бота
pm2 restart step-one-bot
```

### 2. Проверить URL мини-приложения

Убедитесь, что в файле `bot/src/index.ts` указан правильный Preview URL:

```typescript
const MINIAPP_BASE_URL =
  process.env.MINIAPP_BASE_URL && !process.env.MINIAPP_BASE_URL.includes("git-dev")
    ? process.env.MINIAPP_BASE_URL
    : "https://nutrition-app4.vercel.app";
```

### 3. Использовать переменную окружения (рекомендуется)

Вместо хардкода URL, лучше использовать переменную окружения:

1. Добавьте в `bot/.env`:
```bash
MINIAPP_BASE_URL=https://nutrition-app4.vercel.app
```

2. Обновите `ecosystem.config.js` чтобы передавать переменные окружения:
```javascript
env: {
  NODE_ENV: "production",
  MINIAPP_BASE_URL: process.env.MINIAPP_BASE_URL,
},
```

3. Перезапустите бота:
```bash
pm2 restart step-one-bot
```

### 4. Проверить логи

После перезапуска проверьте логи:
```bash
pm2 logs step-one-bot
```

Убедитесь, что нет ошибок и бот успешно запустился.

## Важно

⚠️ **Preview URL может меняться** при каждом новом деплое в Vercel. 

Чтобы всегда использовать актуальный Preview URL:
1. Зайдите в Vercel Dashboard
2. Найдите ваш проект
3. Перейдите в раздел "Deployments"
4. Найдите последний Preview deployment из ветки `dev`
5. Скопируйте его URL
6. Обновите `MINIAPP_BASE_URL` в `.env` файле бота
7. Перезапустите бота

Или используйте стабильный домен для Preview deployments (если настроен в Vercel).


