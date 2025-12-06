# Step One Bot

Telegram бот для отслеживания питания.

## Локальная разработка

### Установка зависимостей
```bash
npm install
```

### Настройка переменных окружения
```bash
cp .env.example .env
# Заполните .env файл своими значениями
```

### Запуск в режиме разработки
```bash
npm run dev
```

Бот будет автоматически перезапускаться при изменении файлов.

### Сборка для продакшна
```bash
npm run build
```

### Запуск продакшн версии
```bash
npm start
```

## Деплой на сервер

### Первоначальная настройка сервера

1. Установите необходимые пакеты:
```bash
sudo apt update
sudo apt install -y git nodejs npm
sudo npm install -g pm2
```

2. Клонируйте репозиторий:
```bash
cd /path/to/your/projects
git clone <your-repo-url> step-one-app
cd step-one-app/bot
```

3. Установите зависимости:
```bash
npm install
```

4. Создайте `.env` файл:
```bash
cp .env.example .env
nano .env  # Заполните переменные
```

5. Соберите проект:
```bash
npm run build
```

6. Обновите `ecosystem.config.js`:
   - Укажите правильный путь в `cwd`

7. Запустите через PM2:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Следуйте инструкциям для автозапуска
```

### Обновление бота на сервере

#### Вариант 1: Через deploy.sh (автоматически)
```bash
# Отредактируйте deploy.sh, указав свои данные
./deploy.sh
```

#### Вариант 2: Вручную (SSH на сервер)
```bash
ssh user@server
cd /path/to/step-one-app/bot
git pull origin main
npm install --production
npm run build
pm2 restart step-one-bot
```

## Структура проекта

```
bot/
├── src/
│   ├── config/       # Конфигурация (env, и т.д.)
│   ├── telegram/     # Обработчики команд и сообщений
│   ├── services/     # Сервисы (Supabase, OpenAI)
│   └── index.ts      # Точка входа
├── dist/             # Скомпилированный код (генерируется)
├── logs/             # Логи PM2
├── .env              # Переменные окружения (не в git)
├── .env.example      # Пример переменных окружения
├── package.json
├── tsconfig.json
├── ecosystem.config.js  # Конфиг PM2
└── deploy.sh         # Скрипт деплоя
```

## Переменные окружения

См. `.env.example` для списка необходимых переменных.

## PM2 команды

```bash
pm2 status              # Статус процессов
pm2 logs step-one-bot   # Просмотр логов
pm2 restart step-one-bot # Перезапуск
pm2 stop step-one-bot   # Остановка
pm2 delete step-one-bot # Удаление из PM2
```

