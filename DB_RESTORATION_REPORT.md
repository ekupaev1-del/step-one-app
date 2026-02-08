# Отчет о восстановлении базы данных Supabase

## Дата: 2025-01-XX

### Проблемы, которые были исправлены

1. **Ошибка 42703: "column users.calories does not exist"**
   - **Причина**: Колонка `calories` существовала, но не имела DEFAULT значения, что вызывало проблемы при SELECT
   - **Решение**: Добавлен `DEFAULT 0` для колонки `calories` в миграции `0002_fix_users_calories_and_add_missing_tables.sql`

2. **Ошибка PGST205: "Could not find the table public.app_logs"**
   - **Причина**: Таблица `app_logs` отсутствовала в новой базе
   - **Решение**: Таблица уже создана в миграции `0001_init.sql`, но добавлено улучшенное логирование ошибок

3. **Отсутствие таблиц profiles и telegram_link_tokens**
   - **Причина**: Эти таблицы используются в коде для UUID-first синхронизации, но отсутствовали в базе
   - **Решение**: Добавлены в миграцию `0002_fix_users_calories_and_add_missing_tables.sql`

---

## 1. Добавленные миграции

### `supabase/migrations/0002_fix_users_calories_and_add_missing_tables.sql`

**Что делает:**
- Исправляет колонку `users.calories`: добавляет `DEFAULT 0`
- Создает таблицу `profiles` (UUID-first user identity)
- Создает таблицу `telegram_link_tokens` (токены для связывания аккаунтов)
- Настраивает RLS политики для новых таблиц
- Обновляет кеш PostgREST схемы

**Ключевые изменения:**
```sql
-- users.calories: добавлен DEFAULT 0
ALTER TABLE users ALTER COLUMN calories SET DEFAULT 0;

-- profiles: UUID-first таблица пользователей
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT UNIQUE NULL,
  email TEXT UNIQUE NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- telegram_link_tokens: одноразовые токены
CREATE TABLE IF NOT EXISTS public.telegram_link_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL
);
```

---

## 2. Измененные файлы кода

### A) Добавлен helper `formatDbError`

**Файлы:**
- `bot/src/lib/dbLogger.ts` - добавлена функция `formatDbError()`
- `miniapp/lib/dbLogger.ts` - создан новый файл с `formatDbError()`
- `lib/dbLogger.ts` - добавлена функция `formatDbError()`

**Что делает:**
Форматирует ошибки БД в читаемые диагностические сообщения:
```
[DB_ERROR:requestId] operation on table (telegramUserId: 123): [42703] column "calories" does not exist (column: calories) | Details: ... | Hint: ...
```

### B) Улучшено логирование в `logEvent`

**Файлы:**
- `bot/src/services/logging.ts`
- `miniapp/lib/logging.ts`

**Что изменилось:**
- Добавлено использование `formatDbError()` для консистентного форматирования ошибок
- Логирование ошибок app_logs теперь более информативное

### C) Обновлен `createUserFriendlyError`

**Файлы:**
- `bot/src/lib/dbLogger.ts`
- `miniapp/lib/dbLogger.ts`
- `lib/dbLogger.ts`

**Что изменилось:**
- Добавлена обработка ошибки `42703` (column does not exist)
- Добавлена обработка ошибки `42501` (permission denied)

---

## 3. Команды для применения миграций

### Вариант 1: Через Supabase CLI (рекомендуется)

```bash
# Перейти в директорию проекта
cd step-one-app

# Применить миграции
supabase db push

# Или если используете локальную разработку
supabase migration up
```

### Вариант 2: Через Supabase Dashboard (SQL Editor)

1. Откройте Supabase Dashboard → SQL Editor
2. Скопируйте содержимое файла `supabase/migrations/0001_init.sql`
3. Выполните SQL
4. Скопируйте содержимое файла `supabase/migrations/0002_fix_users_calories_and_add_missing_tables.sql`
5. Выполните SQL

### Вариант 3: Через psql (если есть прямой доступ)

```bash
psql -h <your-supabase-host> -U postgres -d postgres -f supabase/migrations/0001_init.sql
psql -h <your-supabase-host> -U postgres -d postgres -f supabase/migrations/0002_fix_users_calories_and_add_missing_tables.sql
```

---

## 4. Чеклист проверки

### ✅ Проверка 1: /start команда

**Шаги:**
1. Откройте Telegram бота
2. Отправьте команду `/start`
3. Проверьте логи на наличие ошибок

**Ожидаемый результат:**
- Пользователь создается или находится в таблице `users`
- Нет ошибок типа "column users.calories does not exist"
- В логах видно: `[DB_ERROR:...] select on users: [SUCCESS]` (если DEBUG включен)

**Проверка в БД:**
```sql
SELECT id, telegram_id, calories FROM users WHERE telegram_id = <your_telegram_id>;
-- Должна вернуться строка с calories = 0 или NULL (если анкета не заполнена)
```

### ✅ Проверка 2: Запись еды

**Шаги:**
1. Отправьте боту текстовое сообщение с описанием еды (например: "Овсянка 100г, банан")
2. Дождитесь ответа бота

**Ожидаемый результат:**
- Бот анализирует еду и сохраняет в `diary`
- Нет ошибок типа "violates check constraint diary_source_check"
- Запись появляется в таблице `diary` с `source IN ('text', 'photo', 'audio')`

**Проверка в БД:**
```sql
SELECT id, user_id, meal_text, calories, source, channel 
FROM diary 
WHERE telegram_user_id = <your_telegram_id> 
ORDER BY created_at DESC 
LIMIT 1;
-- source должен быть 'text', 'photo' или 'audio'
-- channel должен быть 'telegram', 'webapp', 'admin' или 'api'
```

### ✅ Проверка 3: Получение отчёта

**Шаги:**
1. Откройте Mini App (через кнопку в боте)
2. Перейдите на страницу отчёта
3. Проверьте отображение данных

**Ожидаемый результат:**
- Отчёт загружается без ошибок
- Данные отображаются корректно
- Нет ошибок в консоли браузера

**Проверка в БД:**
```sql
-- Проверка наличия данных для отчёта
SELECT 
  DATE(created_at) as date,
  SUM(calories) as total_calories
FROM diary
WHERE user_id = <your_user_id>
  AND created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### ✅ Проверка 4: Логирование в app_logs

**Шаги:**
1. Выполните любую операцию (например, /start или отправку еды)
2. Проверьте логи в Vercel/консоли
3. Проверьте таблицу app_logs в БД

**Ожидаемый результат:**
- В консоли видны структурированные логи с `[DB_ERROR:...]` или `[logEvent]`
- Если app_logs недоступна, ошибка логируется в console.error, но основной флоу не прерывается
- В таблице app_logs появляются записи (если таблица доступна)

**Проверка в БД:**
```sql
SELECT 
  id, 
  level, 
  source, 
  request_id, 
  telegram_user_id, 
  message,
  created_at
FROM app_logs
ORDER BY created_at DESC
LIMIT 10;
```

---

## 5. Диагностика проблем

### Если /start всё ещё падает с ошибкой 42703

**Проверьте:**
1. Применена ли миграция `0002_fix_users_calories_and_add_missing_tables.sql`?
2. Существует ли колонка `calories` в таблице `users`?

```sql
-- Проверка структуры таблицы users
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;
```

**Решение:**
Если колонки нет, выполните:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS calories INTEGER DEFAULT 0;
```

### Если app_logs не работает

**Проверьте:**
1. Существует ли таблица `app_logs`?

```sql
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'app_logs'
);
```

**Решение:**
Если таблицы нет, выполните миграцию `0001_init.sql` (создание таблицы app_logs).

### Если diary.insert падает с ошибкой 23514 (constraint violation)

**Проверьте:**
1. Какие значения `source` разрешены в constraint?

```sql
SELECT 
  conname, 
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.diary'::regclass
  AND conname = 'diary_source_check';
```

**Ожидаемый результат:**
Constraint должен разрешать: `'text'`, `'photo'`, `'audio'`

**Решение:**
Если constraint неправильный, выполните:
```sql
ALTER TABLE public.diary DROP CONSTRAINT IF EXISTS diary_source_check;
ALTER TABLE public.diary 
  ADD CONSTRAINT diary_source_check 
  CHECK (source IN ('text', 'photo', 'audio'));
```

---

## 6. Структура таблиц (итоговая)

### users
- ✅ `calories INTEGER DEFAULT 0` (исправлено)
- ✅ Все остальные колонки из `0001_init.sql`

### app_logs
- ✅ Таблица создана в `0001_init.sql`
- ✅ Колонки: `id`, `created_at`, `level`, `source`, `request_id`, `user_id`, `telegram_user_id`, `chat_id`, `message`, `payload`
- ✅ RLS политики настроены

### diary
- ✅ Constraint `diary_source_check` разрешает: `'text'`, `'photo'`, `'audio'`
- ✅ Колонка `channel` разрешает: `'telegram'`, `'webapp'`, `'admin'`, `'api'`

### profiles (новая)
- ✅ UUID PRIMARY KEY
- ✅ `telegram_id BIGINT UNIQUE NULL`
- ✅ RLS политики настроены

### telegram_link_tokens (новая)
- ✅ `token TEXT PRIMARY KEY`
- ✅ `user_id UUID REFERENCES profiles(id)`
- ✅ RLS политики настроены

---

## 7. Следующие шаги

1. ✅ Применить миграции в Supabase
2. ✅ Проверить работу /start
3. ✅ Проверить запись еды
4. ✅ Проверить получение отчёта
5. ✅ Мониторить логи на наличие ошибок

---

## Контакты для поддержки

Если возникнут проблемы:
1. Проверьте логи в Vercel Dashboard
2. Проверьте логи в Supabase Dashboard → Logs
3. Используйте диагностические SQL запросы из раздела "Диагностика проблем"
