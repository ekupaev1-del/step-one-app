# КРИТИЧЕСКАЯ МИГРАЦИЯ: Применение 0005_fix_missing_columns_and_reload_cache.sql

## Проблема

Из логов видно:
- ❌ Таблица `users` существует, но отсутствуют колонки: `calories`, `goal`, `protein`, `fat`, `carbs`, `water_goal_ml`
- ❌ Таблица `water_logs` существует, но отсутствует колонка: `created_at`
- ❌ PostgREST не видит таблицы `reminders`, `app_logs`, `diary` в schema cache (PGRST205)

## Решение

Миграция `0005_fix_missing_columns_and_reload_cache.sql`:
1. ✅ Добавляет все недостающие колонки в `users`
2. ✅ Добавляет `created_at` в `water_logs`
3. ✅ Перезагружает PostgREST schema cache (исправляет PGRST205)
4. ✅ Обновляет RLS policies для всех таблиц

## Как применить

### Шаг 1: Откройте Supabase SQL Editor

1. Откройте https://supabase.com/dashboard
2. Выберите ваш проект
3. Перейдите в **SQL Editor**

### Шаг 2: Скопируйте и выполните миграцию

1. Откройте файл: `supabase/migrations/0005_fix_missing_columns_and_reload_cache.sql`
2. Скопируйте **весь** содержимое файла
3. Вставьте в SQL Editor
4. Нажмите **Run** (или Ctrl+Enter)

### Шаг 3: Проверьте результат

После выполнения вы должны увидеть:
```
NOTICE: Added column "calories" to table "users"
NOTICE: Added column "goal" to table "users"
NOTICE: Added column "protein" to table "users"
NOTICE: Added column "fat" to table "users"
NOTICE: Added column "carbs" to table "users"
NOTICE: Added column "water_goal_ml" to table "users"
NOTICE: Added column "created_at" to table "water_logs"
NOTICE: RLS policies created/updated for all tables
NOTICE: Schema cache reload triggered
NOTICE: Users table: All required columns exist
NOTICE: Water_logs table: created_at column exists
```

### Шаг 4: Перезапустите бота

После применения миграции перезапустите бота. В логах должно быть:

```
[DB_HEALTHCHECK] Schema Health Status: ✅ HEALTHY
[DB_HEALTHCHECK]   ✅ users (exists: true)
[DB_HEALTHCHECK]     Verified columns: id, telegram_id, calories, goal, protein, fat, carbs, water_goal_ml
[DB_HEALTHCHECK]   ✅ reminders (exists: true)
[DB_HEALTHCHECK]   ✅ app_logs (exists: true)
[DB_HEALTHCHECK]   ✅ diary (exists: true)
[DB_HEALTHCHECK]   ✅ water_logs (exists: true)
[DB_HEALTHCHECK]     Verified columns: id, user_id, amount_ml, created_at
```

## Если миграция не помогла

### Проблема: PostgREST все еще не видит таблицы

**Решение**: Вручную перезагрузите schema cache:

```sql
-- В Supabase SQL Editor выполните:
SELECT pg_notify('pgrst', 'reload schema');

-- Или перезапустите PostgREST через Supabase Dashboard:
-- Settings → API → Restart PostgREST (если доступно)
```

### Проблема: Колонки все еще отсутствуют

**Решение**: Проверьте, что миграция выполнилась без ошибок:

```sql
-- Проверьте колонки users:
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

-- Должны быть: calories, goal, protein, fat, carbs, water_goal_ml

-- Проверьте created_at в water_logs:
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'water_logs' AND column_name = 'created_at';
```

## После успешного применения

1. ✅ Бот должен запускаться без ошибок schema healthcheck
2. ✅ Команда `/start` должна работать
3. ✅ Все таблицы должны быть доступны через Supabase API
4. ✅ Логи должны показывать `✅ HEALTHY` статус
