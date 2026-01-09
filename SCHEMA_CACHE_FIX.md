# PostgREST Schema Cache Fix

## Проблема

После выполнения миграции базы данных Supabase может показывать ошибку:
```
Could not find the 'currency' column of 'payments' in the schema cache
```

Это происходит потому, что PostgREST (Supabase API) кеширует схему базы данных и не видит новые колонки сразу после миграции.

## Решение

### Шаг 1: Выполнить миграцию
Выполните миграцию `migrations/create_payments_table.sql` в Supabase SQL Editor.

### Шаг 2: Обновить кеш PostgREST
После миграции выполните в Supabase SQL Editor:

```sql
SELECT pg_notify('pgrst', 'reload schema');
```

Это принудительно обновит кеш схемы PostgREST.

### Шаг 3: Подождать 1-2 минуты
PostgREST обновит кеш в течение 1-2 минут после выполнения `pg_notify`.

### Шаг 4: Проверить схему (опционально)
Если включен debug режим (`?debug=1`), можно проверить схему через:
- UI: Нажать кнопку "Проверить схему БД" в debug панели
- API: `GET /api/payments/debug-schema?debug=1`

## Автоматическое обновление

Миграция `create_payments_table.sql` автоматически выполняет `pg_notify` в конце, но иногда требуется дополнительное время для обновления кеша.

## Если проблема сохраняется

1. Проверьте, что миграция выполнена успешно:
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_schema = 'public' AND table_name = 'payments' 
   AND column_name = 'currency';
   ```
   Должна вернуться строка с `currency`.

2. Выполните обновление кеша еще раз:
   ```sql
   SELECT pg_notify('pgrst', 'reload schema');
   ```

3. Подождите 2-3 минуты и попробуйте снова.

4. Если проблема не решается, возможно потребуется перезапуск Supabase API (требует доступа к настройкам проекта).

## Проверка в коде

Код автоматически определяет ошибки кеша схемы и показывает понятное сообщение:
- "Ошибка схемы базы данных. Кеш PostgREST устарел."
- В debug режиме показывается инструкция по обновлению кеша
