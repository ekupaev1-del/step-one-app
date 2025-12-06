# Структура проекта step-one-app

## Финальная структура монорепо

```
step-one-app/
├── bot/                          # Telegram бот
│   ├── src/
│   │   ├── config/
│   │   │   └── env.ts           # Конфигурация и валидация переменных окружения
│   │   ├── telegram/            # Обработчики команд и сообщений Telegram
│   │   ├── services/            # Сервисы (Supabase, OpenAI)
│   │   └── index.ts             # Точка входа бота
│   ├── dist/                    # Скомпилированный код (генерируется)
│   ├── logs/                    # Логи PM2
│   ├── .env                     # Переменные окружения (не в git)
│   ├── .env.example             # Пример переменных окружения
│   ├── package.json             # Зависимости и скрипты бота
│   ├── tsconfig.json            # Конфигурация TypeScript
│   ├── ecosystem.config.js      # Конфигурация PM2
│   ├── deploy.sh                # Скрипт автоматического деплоя
│   └── README.md                # Документация бота
│
├── miniapp/                     # Telegram Mini App
│   ├── app/                     # Next.js App Router
│   │   ├── api/                 # API routes
│   │   ├── layout.tsx           # Корневой layout с Telegram WebApp SDK
│   │   ├── page.tsx             # Главная страница
│   │   └── ...                  # Другие страницы и компоненты
│   ├── public/                  # Статические файлы
│   ├── lib/                     # Утилиты и хелперы
│   ├── components/              # React компоненты
│   ├── .env.local               # Локальные переменные окружения (не в git)
│   ├── .env.example             # Пример переменных окружения
│   ├── package.json             # Зависимости и скрипты миниапа
│   ├── next.config.ts           # Конфигурация Next.js
│   ├── tsconfig.json            # Конфигурация TypeScript
│   ├── tailwind.config.ts       # Конфигурация Tailwind CSS
│   ├── postcss.config.js        # Конфигурация PostCSS
│   ├── vercel.json              # Конфигурация Vercel
│   └── README.md                # Документация миниапа
│
├── supabase/                    # SQL скрипты для миграций (опционально)
│   └── *.sql                    # SQL файлы
│
├── .gitignore                   # Игнорируемые файлы Git
├── README.md                    # Главная документация проекта
├── MIGRATION.md                 # Инструкция по миграции существующего кода
├── DEPLOYMENT.md                # Полный гайд по деплою
└── STRUCTURE.md                 # Этот файл
```

## Описание компонентов

### `bot/` — Telegram бот

**Роль**: Обрабатывает команды и сообщения от пользователей Telegram, интегрирован с Supabase и OpenAI.

**Ключевые файлы:**
- `src/index.ts` — точка входа, инициализация бота
- `src/config/env.ts` — загрузка и валидация переменных окружения
- `src/telegram/` — обработчики команд (`/start`, `/help`, и т.д.)
- `src/services/` — сервисы для работы с Supabase и OpenAI
- `ecosystem.config.js` — конфигурация PM2 для запуска на сервере
- `deploy.sh` — скрипт автоматического деплоя на сервер

**Технологии**: Node.js, TypeScript, Telegraf, Supabase, OpenAI

**Деплой**: Ubuntu сервер через PM2

### `miniapp/` — Telegram Mini App

**Роль**: Веб-приложение, работающее внутри Telegram через WebApp API, для взаимодействия с пользователями.

**Ключевые файлы:**
- `app/layout.tsx` — корневой layout с подключением Telegram WebApp SDK
- `app/page.tsx` — главная страница
- `app/api/` — API routes для работы с данными
- `vercel.json` — конфигурация для деплоя на Vercel

**Технологии**: Next.js, React, TypeScript, Tailwind CSS, Supabase

**Деплой**: Vercel (автоматический из GitHub)

### Корневые файлы

**`README.md`** — главная документация проекта с описанием структуры, быстрого старта и workflow.

**`.gitignore`** — игнорирует:
- `node_modules/` — зависимости
- `.env`, `.env.local` — переменные окружения
- `.next/`, `dist/`, `build/` — скомпилированные файлы
- `logs/` — логи
- `.DS_Store`, `.vscode/` — системные и IDE файлы

**`MIGRATION.md`** — пошаговая инструкция по переносу существующего кода в новую структуру.

**`DEPLOYMENT.md`** — полный гайд по настройке деплоя бота на сервер и миниапа на Vercel.

## Git workflow

### Ветки

- **`main`** — стабильная продакшн ветка
  - Бот на сервере запускается из этой ветки
  - Миниап на Vercel деплоится в production из этой ветки

- **`dev`** — ветка разработки
  - Для разработки новых фич
  - Миниап на Vercel создает preview deployments из этой ветки

### Рабочий процесс

1. Работаем в `dev` (или создаем feature-ветки от `dev`)
2. Тестируем локально
3. Пушим изменения → Vercel создает preview
4. Если всё ок → мержим в `main`
5. На сервере обновляем бота: `git pull && pm2 restart step-one-bot`
6. Vercel автоматически обновляет продакшн миниап

## Переменные окружения

### Бот (`bot/.env`)

```
TELEGRAM_BOT_TOKEN=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
```

### Миниап (`miniapp/.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

**Важно**: Все `.env` файлы в `.gitignore` и не попадают в репозиторий.

## Конфигурационные файлы

### TypeScript

- `bot/tsconfig.json` — настройки компиляции для бота
- `miniapp/tsconfig.json` — настройки для Next.js

### PM2

- `bot/ecosystem.config.js` — конфигурация процесса бота на сервере

### Vercel

- `miniapp/vercel.json` — настройки деплоя миниапа

### Next.js

- `miniapp/next.config.ts` — конфигурация Next.js

### Tailwind CSS

- `miniapp/tailwind.config.ts` — настройки стилей

## Скрипты

### Бот

```bash
npm run dev      # Запуск в режиме разработки с автоперезагрузкой
npm run build    # Сборка TypeScript в JavaScript
npm start        # Запуск продакшн версии
npm run lint     # Проверка кода линтером
```

### Миниап

```bash
npm run dev      # Запуск dev сервера
npm run build    # Сборка для продакшна
npm start        # Запуск продакшн сервера
npm run lint     # Проверка кода
```

## Следующие шаги

1. Прочитайте `MIGRATION.md` для переноса существующего кода
2. Прочитайте `DEPLOYMENT.md` для настройки деплоя
3. Следуйте инструкциям в `README.md` для быстрого старта

