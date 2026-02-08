# Финальные инструкции по восстановлению базы данных

## Проблема

Healthcheck показывает, что колонки отсутствуют, хотя они есть в Supabase UI. Это происходит из-за устаревшего PostgREST schema cache.

## Решение

Создана RPC функция, которая проверяет колонки напрямую через `information_schema`, обходя PostgREST cache.

## Что нужно сделать СЕЙЧАС

### Шаг 1: Применить миграцию 0006

1. Откройте **Supabase Dashboard** → **SQL Editor**
2. Откройте файл: `supabase/migrations/0006_add_column_check_function.sql`
3. Скопируйте **весь** содержимое файла
4. Вставьте в SQL Editor и нажмите **Run**

Эта миграция создаст RPC функции:
- `check_column_exists(table_name, column_name)` - проверяет наличие колонки
- `get_table_columns(table_name)` - возвращает все колонки таблицы

### Шаг 2: Перезапустите бота

После применения миграции перезапустите бота.

### Шаг 3: Проверьте логи

В логах должно быть:

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

## Если все еще показывает ошибки

### Вариант 1: RPC функция не создалась

Проверьте что миграция выполнилась:

```sql
-- В Supabase SQL Editor выполните:
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN ('check_column_exists', 'get_table_columns');
```

Должно вернуть 2 строки. Если нет - примените миграцию 0006 еще раз.

### Вариант 2: PostgREST все еще не видит таблицы

Перезагрузите schema cache вручную:

```sql
-- В Supabase SQL Editor выполните:
SELECT pg_notify('pgrst', 'reload schema');
```

Подождите 10-15 секунд и перезапустите бота.

### Вариант 3: Проверьте колонки вручную

```sql
-- Проверьте колонки users:
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'users'
  AND column_name IN ('calories', 'goal', 'protein', 'fat', 'carbs', 'water_goal_ml')
ORDER BY column_name;

-- Должно вернуть 6 строк

-- Проверьте created_at в water_logs:
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'water_logs' 
  AND column_name = 'created_at';

-- Должно вернуть 1 строку
```

## Миграции в порядке применения

Если вы применяете миграции с нуля, порядок такой:

1. `0001_init.sql` - базовая схема (если база пустая)
2. `0003_restore_complete_schema.sql` - полное восстановление схемы
3. `0004_fix_users_calories_constraint.sql` - исправление constraint
4. `0005_fix_missing_columns_and_reload_cache.sql` - добавление недостающих колонок
5. `0006_add_column_check_function.sql` - RPC функции для проверки колонок ⭐ **ПРИМЕНИТЕ ЭТУ**

## После успешного применения

1. ✅ Healthcheck показывает `✅ HEALTHY`
2. ✅ Все колонки отмечены как существующие
3. ✅ Команда `/start` работает без ошибок
4. ✅ Нет ошибок "column does not exist"
5. ✅ Нет ошибок "table not found in schema cache"

## Автоматический деплой

Автоматический деплой уже настроен и запустится автоматически после push в `main`.

Проверьте статус:
- GitHub → Actions → должен быть запущен workflow
- Vercel Dashboard → Deployments → должен появиться новый деплой

## Итог

После применения миграции 0006 healthcheck будет использовать RPC функцию, которая напрямую проверяет `information_schema`, обходя проблемы с PostgREST cache. Это гарантирует точные результаты проверки колонок.
