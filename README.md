# Step One App

Монорепо для Telegram бота по питанию и Telegram Mini App.

## Структура проекта

```
step-one-app/
├── bot/              # Telegram бот (Node.js + TypeScript)
├── miniapp/          # Telegram Mini App (Next.js)
├── README.md         # Этот файл
└── .gitignore        # Игнорируемые файлы
```

## Компоненты

### `bot/` — Telegram бот
- Обрабатывает команды и сообщения от пользователей
- Интегрирован с Supabase для хранения данных
- Использует OpenAI для анализа еды
- Запускается на Ubuntu сервере через PM2

### `miniapp/` — Telegram Mini App
- Веб-приложение на Next.js
- Работает внутри Telegram через WebApp API
- Деплоится на Vercel
- Использует Supabase для работы с данными

## Быстрый старт

### Локальная разработка

#### Бот
```bash
cd bot
npm install
cp .env.example .env
# Заполните .env файл
npm run dev
```

#### Миниап
```bash
cd miniapp
npm install
cp .env.example .env.local
# Заполните .env.local файл
npm run dev
```

## Git workflow

- `main` — стабильная продакшн ветка
- `dev` — ветка для разработки

### Рабочий процесс
1. Работаем в ветке `dev`
2. Тестируем локально
3. Пушим изменения → Vercel создает preview для миниапа
4. Если всё ок → мержим в `main`
5. На сервере обновляем бота: `git pull && pm2 restart step-one-bot`
6. Vercel автоматически обновляет продакшн миниап

## Деплой

### Бот на сервере
См. [bot/README.md](bot/README.md)

### Миниап на Vercel
См. [miniapp/README.md](miniapp/README.md)

## Переменные окружения

### Бот (`bot/.env`)
- `TELEGRAM_BOT_TOKEN` — токен Telegram бота
- `SUPABASE_URL` — URL проекта Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — сервисный ключ Supabase
- `OPENAI_API_KEY` — ключ OpenAI API

### Миниап (`miniapp/.env.local`)
- `NEXT_PUBLIC_SUPABASE_URL` — публичный URL Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — анонимный ключ Supabase

## Лицензия

Private

