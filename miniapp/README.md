# Step One MiniApp

Telegram Mini App на Next.js для отслеживания питания.

## Локальная разработка

### Установка зависимостей
```bash
npm install
```

### Настройка переменных окружения
```bash
cp .env.example .env.local
# Заполните .env.local файл своими значениями
```

### Запуск в режиме разработки
```bash
npm run dev
```

Приложение будет доступно по адресу http://localhost:3000

### Сборка для продакшна
```bash
npm run build
```

### Запуск продакшн версии
```bash
npm start
```

## Деплой на Vercel

### Первоначальная настройка

1. Подключите репозиторий к Vercel:
   - Откройте Vercel Dashboard
   - Нажмите "Add New Project"
   - Выберите ваш GitHub репозиторий `step-one-app`

2. Настройте проект:
   - **Root Directory**: `miniapp`
   - **Framework Preset**: Next.js
   - **Build Command**: `npm run build` (или оставьте по умолчанию)
   - **Output Directory**: `.next` (по умолчанию)
   - **Install Command**: `npm install` (по умолчанию)

3. Настройте переменные окружения:
   - В Vercel Dashboard → Settings → Environment Variables
   - Добавьте:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

4. Настройте ветки:
   - **Production Branch**: `main`
   - **Preview Branches**: `dev` (или все ветки кроме main)

### Автоматический деплой

- **main** ветка → автоматически деплоится в production
- **dev** ветка → автоматически создает preview deployment

### Ручной деплой

Если нужно задеплоить вручную:
```bash
npx vercel --prod
```

## Структура проекта

```
miniapp/
├── app/              # Next.js App Router
│   ├── layout.tsx    # Корневой layout с Telegram WebApp SDK
│   ├── page.tsx      # Главная страница
│   └── ...
├── public/           # Статические файлы
├── .env.local        # Локальные переменные окружения (не в git)
├── .env.example      # Пример переменных окружения
├── next.config.ts    # Конфигурация Next.js
├── vercel.json       # Конфигурация Vercel
└── package.json
```

## Telegram WebApp

Приложение использует Telegram WebApp SDK для:
- Получения данных пользователя
- Работы с кнопками и UI Telegram
- Отправки данных обратно в бот

SDK автоматически загружается через `<Script>` в `layout.tsx`.

## Переменные окружения

См. `.env.example` для списка необходимых переменных.

**Важно**: Переменные с префиксом `NEXT_PUBLIC_` доступны в браузере.
