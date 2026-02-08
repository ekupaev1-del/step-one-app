# Применение миграции 0006: RPC функция для проверки колонок

## Проблема

Healthcheck показывает, что колонки отсутствуют, хотя они есть в таблице (видно в Supabase UI). Это происходит потому что:
- PostgREST schema cache устарел
- Healthcheck проверяет колонки через SELECT, который зависит от cache

## Решение

Миграция `0006_add_column_check_function.sql` создает RPC функции, которые:
- Прямо запрашивают `information_schema` (обходит PostgREST cache)
- Всегда возвращают актуальную информацию о колонках
- Healthcheck теперь использует эти функции вместо SELECT

## Как применить

1. Откройте **Supabase Dashboard** → **SQL Editor**
2. Откройте файл: `supabase/migrations/0006_add_column_check_function.sql`
3. Скопируйте **весь** содержимое
4. Вставьте в SQL Editor и нажмите **Run**

## После применения

1. Перезапустите бота
2. Healthcheck должен показывать правильные результаты
3. Колонки, которые видны в UI, должны быть отмечены как существующие

## Проверка

После применения миграции и перезапуска бота, в логах должно быть:

```
[DB_HEALTHCHECK] Schema Health Status: ✅ HEALTHY
[DB_HEALTHCHECK]   ✅ users (exists: true)
[DB_HEALTHCHECK]     Verified columns: id, telegram_id, calories, goal, protein, fat, carbs, water_goal_ml
```

Если все еще показывает ошибки - проверьте что миграция 0006 применилась успешно.
