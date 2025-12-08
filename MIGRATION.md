# Инструкция по миграции существующего кода

Этот документ описывает, как перенести ваш текущий код в новую структуру монорепо.

## Текущая структура (nutrition-app)

```
nutrition-app/
├── bot/
│   └── bot.ts          # Весь код бота в одном файле
├── app/                # Next.js App Router
│   ├── api/           # API routes
│   ├── page.tsx       # Главная страница
│   └── ...
├── lib/               # Общие утилиты
├── public/            # Статические файлы
└── package.json       # Общие зависимости
```

## Новая структура (step-one-app)

```
step-one-app/
├── bot/
│   ├── src/
│   │   ├── config/    # Конфигурация
│   │   ├── telegram/  # Обработчики команд
│   │   ├── services/  # Сервисы (Supabase, OpenAI)
│   │   └── index.ts   # Точка входа
│   └── ...
└── miniapp/
    ├── app/           # Next.js App Router
    ├── public/        # Статические файлы
    └── ...
```

## План миграции

### Шаг 1: Подготовка

1. Убедитесь, что у вас есть резервная копия текущего проекта
2. Создайте новую папку `step-one-app` (уже создана)
3. Инициализируйте git репозиторий в новой папке

### Шаг 2: Миграция бота

#### 2.1. Перенос основного кода

**Откуда**: `nutrition-app/bot/bot.ts`  
**Куда**: `step-one-app/bot/src/index.ts`

**Что делать:**
1. Скопируйте содержимое `bot.ts` в `bot/src/index.ts`
2. Адаптируйте импорты:
   - Замените `import { env } from "./config/env.js"` на использование нового модуля конфигурации
   - Убедитесь, что все пути импортов корректны

#### 2.2. Разделение кода на модули (рекомендуется)

**Создайте структуру:**

1. **`bot/src/services/supabase.ts`** — клиент Supabase
   ```typescript
   import { createClient } from "@supabase/supabase-js";
   import { env } from "../config/env.js";
   
   export const supabase = createClient(
     env.supabaseUrl,
     env.supabaseServiceRoleKey,
     {
       auth: {
         autoRefreshToken: false,
         persistSession: false,
       },
     }
   );
   ```

2. **`bot/src/services/openai.ts`** — клиент OpenAI
   ```typescript
   import OpenAI from "openai";
   import { env } from "../config/env.js";
   
   export const openai = new OpenAI({ apiKey: env.openaiApiKey });
   ```

3. **`bot/src/telegram/handlers.ts`** — обработчики команд
   - Перенесите все обработчики команд (`bot.start`, `bot.on("text")`, и т.д.)
   - Разделите на логические модули, если код большой

4. **`bot/src/telegram/commands.ts`** — команды бота
   - `/start`, `/help`, `/отчет`, и т.д.

#### 2.3. Перенос переменных окружения

**Откуда**: `nutrition-app/bot/.env`  
**Куда**: `step-one-app/bot/.env`

**Что делать:**
1. Скопируйте содержимое `.env` файла
2. Убедитесь, что все переменные присутствуют:
   - `TELEGRAM_BOT_TOKEN`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`

### Шаг 3: Миграция миниапа

#### 3.1. Перенос App Router

**Откуда**: `nutrition-app/app/`  
**Куда**: `step-one-app/miniapp/app/`

**Что делать:**
1. Скопируйте все файлы из `app/` в `miniapp/app/`:
   - `app/page.tsx` → `miniapp/app/page.tsx`
   - `app/layout.tsx` → `miniapp/app/layout.tsx` (объедините с новым layout, который включает Telegram WebApp SDK)
   - `app/api/` → `miniapp/app/api/`
   - `app/questionnaire.tsx` → `miniapp/app/questionnaire.tsx`
   - `app/report/` → `miniapp/app/report/`
   - И т.д.

#### 3.2. Перенос статических файлов

**Откуда**: `nutrition-app/public/`  
**Куда**: `step-one-app/miniapp/public/`

**Что делать:**
1. Скопируйте все файлы из `public/` в `miniapp/public/`

#### 3.3. Перенос общих утилит

**Откуда**: `nutrition-app/lib/`  
**Куда**: `step-one-app/miniapp/lib/`

**Что делать:**
1. Скопируйте файлы из `lib/` в `miniapp/lib/`
2. Проверьте импорты в файлах миниапа

#### 3.4. Перенос компонентов

**Откуда**: `nutrition-app/components/`  
**Куда**: `step-one-app/miniapp/components/`

**Что делать:**
1. Скопируйте все компоненты

#### 3.5. Перенос конфигов

**Откуда**: `nutrition-app/`  
**Куда**: `step-one-app/miniapp/`

**Что делать:**
1. `tailwind.config.ts` → `miniapp/tailwind.config.ts`
2. `postcss.config.js` → `miniapp/postcss.config.js`
3. `tsconfig.json` → обновите пути в `miniapp/tsconfig.json` (если нужно)

#### 3.6. Обновление package.json

**Что делать:**
1. Скопируйте зависимости из `nutrition-app/package.json` в `miniapp/package.json`
2. Убедитесь, что все необходимые пакеты присутствуют:
   - `@supabase/supabase-js`
   - `framer-motion`
   - И другие зависимости миниапа

#### 3.7. Перенос переменных окружения

**Откуда**: `nutrition-app/.env.local` (или `.env`)  
**Куда**: `step-one-app/miniapp/.env.local`

**Что делать:**
1. Скопируйте переменные окружения
2. Убедитесь, что переменные имеют префикс `NEXT_PUBLIC_` для тех, что нужны в браузере:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Шаг 4: Обновление импортов

После переноса файлов проверьте и обновите импорты:

1. **В миниапе**: убедитесь, что все импорты указывают на правильные пути
2. **В боте**: обновите импорты для использования новой структуры модулей

### Шаг 5: Тестирование

1. **Локально запустите бота:**
   ```bash
   cd step-one-app/bot
   npm install
   npm run dev
   ```

2. **Локально запустите миниап:**
   ```bash
   cd step-one-app/miniapp
   npm install
   npm run dev
   ```

3. Проверьте, что всё работает корректно

### Шаг 6: SQL скрипты

**Откуда**: `nutrition-app/supabase/`  
**Куда**: `step-one-app/supabase/` (создайте папку в корне)

**Что делать:**
1. Создайте папку `step-one-app/supabase/`
2. Скопируйте все SQL файлы
3. Это будет общая папка для миграций базы данных

## Чеклист миграции

- [ ] Создана резервная копия текущего проекта
- [ ] Скопирован код бота в `bot/src/`
- [ ] Разделен код бота на модули (опционально, но рекомендуется)
- [ ] Скопированы переменные окружения бота
- [ ] Скопированы файлы миниапа (`app/`, `public/`, `lib/`, `components/`)
- [ ] Скопированы конфиги (tailwind, postcss, tsconfig)
- [ ] Обновлены зависимости в `package.json`
- [ ] Скопированы переменные окружения миниапа
- [ ] Обновлены все импорты
- [ ] Протестирован бот локально
- [ ] Протестирован миниап локально
- [ ] Скопированы SQL скрипты в `supabase/`

## Важные замечания

1. **Не удаляйте старый проект** до полной проверки нового
2. **Проверьте все пути** в импортах после переноса
3. **Убедитесь, что .env файлы не попали в git** (они в .gitignore)
4. **Обновите URL бота** в миниапе, если он изменился
5. **Проверьте работу с Supabase** — убедитесь, что ключи правильные

## После миграции

1. Настройте деплой бота на сервере (см. `bot/README.md`)
2. Настройте деплой миниапа на Vercel (см. `miniapp/README.md`)
3. Создайте ветки `main` и `dev` в git
4. Настройте автоматический деплой


