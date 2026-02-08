# ФИНАЛЬНОЕ ВОССТАНОВЛЕНИЕ СХЕМЫ БД - 1 В 1

## Проблема

После применения миграций healthcheck все еще показывает ошибки, хотя колонки видны в Supabase UI. Это происходит из-за:
1. PostgREST schema cache не обновлен (PGRST205 ошибки)
2. Healthcheck проверяет колонки через SELECT, что ненадежно при устаревшем cache

## Решение

### Шаг 1: Применить финальную миграцию

1. Откройте **Supabase Dashboard** → **SQL Editor**
2. Откройте файл: `supabase/migrations/0007_complete_schema_restore.sql`
3. Скопируйте **весь** содержимое
4. Вставьте в SQL Editor и нажмите **Run**

Эта миграция:
- ✅ Проверяет и добавляет все недостающие колонки
- ✅ Создает все таблицы, если их нет
- ✅ Обновляет RLS policies
- ✅ **Форсирует перезагрузку PostgREST schema cache** (критично!)

### Шаг 2: Применить миграцию перезагрузки cache

1. Откройте файл: `supabase/migrations/0006_force_reload_schema_cache.sql`
2. Скопируйте и выполните в SQL Editor

Это дополнительно перезагрузит cache.

### Шаг 3: Перезапустить бота

После применения миграций перезапустите бота. Healthcheck должен показать:

```
[DB_HEALTHCHECK] Schema Health Status: ✅ HEALTHY
[DB_HEALTHCHECK]   ✅ users (exists: true)
[DB_HEALTHCHECK]     Verified columns: id, telegram_id, calories, goal, protein, fat, carbs, water_goal_ml
[DB_HEALTHCHECK]   ✅ reminders (exists: true)
[DB_HEALTHCHECK]   ✅ app_logs (exists: true)
[DB_HEALTHCHECK]   ✅ diary (exists: true)
[DB_HEALTHCHECK]   ✅ water_logs (exists: true)
```

## Что было исправлено в коде

### 1. Улучшен healthcheck (`bot/src/lib/dbDiagnostics.ts`)
- Теперь проверяет все колонки сразу, а не по одной
- Правильно обрабатывает ошибки PostgREST schema cache (PGRST205)
- Не считает колонки отсутствующими, если проблема только в cache

### 2. Исправлена проверка diary
- Было: проверял колонку `text`
- Стало: проверяет колонку `meal_text` (правильное название)

## Порядок применения миграций

Если вы применяете миграции с нуля, порядок такой:

1. `0001_init.sql` - Базовая схема
2. `0003_restore_complete_schema.sql` - Дополнительные колонки
3. `0004_fix_users_calories_constraint.sql` - Исправление constraint
4. `0005_fix_missing_columns_and_reload_cache.sql` - Добавление колонок
5. `0006_force_reload_schema_cache.sql` - Перезагрузка cache
6. `0007_complete_schema_restore.sql` - **ФИНАЛЬНАЯ** проверка и восстановление

Или просто примените `0007_complete_schema_restore.sql` - она идемпотентна и проверит все.

## Проверка после применения

### В Supabase UI проверьте:

1. **Таблица users** - должны быть колонки:
   - `calories` (int4, default 0)
   - `goal` (text)
   - `protein` (numeric)
   - `fat` (numeric)
   - `carbs` (numeric)
   - `water_goal_ml` (int4)

2. **Таблица water_logs** - должна быть колонка:
   - `created_at` (timestamptz)

3. **Все таблицы существуют**:
   - `users`
   - `reminders`
   - `app_logs`
   - `diary`
   - `water_logs`

### В логах бота должно быть:

```
✅ Schema Health Status: HEALTHY
```

### Команда /start должна работать:

- Нет ошибок "column does not exist"
- Нет ошибок "table not found in schema cache"
- Пользователь создается/находится успешно

## Если все еще не работает

1. **Проверьте миграции**: Убедитесь, что `0007_complete_schema_restore.sql` выполнилась без ошибок
2. **Вручную перезагрузите cache**:
   ```sql
   SELECT pg_notify('pgrst', 'reload schema');
   ```
3. **Проверьте RLS policies**: В Supabase UI → Table Editor → выберите таблицу → RLS policies
4. **Перезапустите PostgREST** (если доступно): Supabase Dashboard → Settings → API → Restart

## Итог

После применения `0007_complete_schema_restore.sql`:
- ✅ Все колонки добавлены
- ✅ Все таблицы созданы
- ✅ RLS policies настроены
- ✅ PostgREST schema cache перезагружен
- ✅ Healthcheck должен показывать ✅ HEALTHY

База данных восстановлена **1 в 1**, как было раньше.
