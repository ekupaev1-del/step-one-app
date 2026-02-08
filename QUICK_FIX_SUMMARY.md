# Быстрое исправление проблем из логов

## Что было исправлено

### 1. Недостающие колонки в `users`
- ✅ Добавлены: `calories`, `goal`, `protein`, `fat`, `carbs`, `water_goal_ml`
- Миграция: `0005_fix_missing_columns_and_reload_cache.sql`

### 2. Недостающая колонка в `water_logs`
- ✅ Добавлена: `created_at`
- Миграция: `0005_fix_missing_columns_and_reload_cache.sql`

### 3. PostgREST schema cache (PGRST205)
- ✅ Перезагрузка schema cache через `pg_notify('pgrst', 'reload schema')`
- ✅ Обновлены RLS policies для всех таблиц
- Миграция: `0005_fix_missing_columns_and_reload_cache.sql`

## Что нужно сделать СЕЙЧАС

### 1. Применить миграцию в Supabase

1. Откройте **Supabase Dashboard** → **SQL Editor**
2. Откройте файл: `supabase/migrations/0005_fix_missing_columns_and_reload_cache.sql`
3. Скопируйте **весь** содержимое
4. Вставьте в SQL Editor и нажмите **Run**

### 2. Перезапустить бота

После применения миграции перезапустите бота. Должно быть:

```
[DB_HEALTHCHECK] Schema Health Status: ✅ HEALTHY
```

## Автоматический деплой

Автоматический деплой уже настроен через GitHub Actions:
- Workflow: `.github/workflows/vercel-auto-deploy.yml`
- Триггер: Push в `main` branch
- Деплоится: `miniapp` на Vercel

После push в `main`:
1. GitHub Actions автоматически запустится
2. Соберет `miniapp`
3. Задеплоит на Vercel Production

Проверьте статус: GitHub → Actions tab

## Проверка после применения

### В логах бота должно быть:
```
✅ Schema Health Status: HEALTHY
✅ users (exists: true)
  Verified columns: id, telegram_id, calories, goal, protein, fat, carbs, water_goal_ml
✅ reminders (exists: true)
✅ app_logs (exists: true)
✅ diary (exists: true)
✅ water_logs (exists: true)
  Verified columns: id, user_id, amount_ml, created_at
```

### Команда /start должна работать:
- Нет ошибок "column does not exist"
- Нет ошибок "table not found in schema cache"
- Пользователь создается/находится успешно

## Если что-то не работает

1. **Проверьте миграцию**: Убедитесь, что она выполнилась без ошибок
2. **Проверьте колонки**: Выполните SQL из `APPLY_MIGRATION_0005.md`
3. **Перезагрузите schema cache вручную**: `SELECT pg_notify('pgrst', 'reload schema');`
4. **Проверьте логи бота**: Должны быть диагностические сообщения

## Файлы

- **Миграция**: `supabase/migrations/0005_fix_missing_columns_and_reload_cache.sql`
- **Инструкция**: `APPLY_MIGRATION_0005.md`
- **Автодеплой**: `.github/workflows/vercel-auto-deploy.yml`
