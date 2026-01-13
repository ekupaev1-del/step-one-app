# Выполнение миграций базы данных

## Быстрый способ

1. Откройте файл: `migrations/run-all-migrations.sql`
2. Скопируйте весь SQL код
3. Откройте Supabase Dashboard → SQL Editor
4. Вставьте SQL код
5. Нажмите "Run"
6. Дождитесь завершения (обычно несколько секунд)
7. Подождите 1-2 минуты для обновления кеша схемы

## Что делает миграция

### Таблица `payments`
- Создает таблицу для хранения платежей
- Поля: id, user_id, telegram_user_id, plan_code, amount, currency, method, provider, inv_id, status, payment_url
- Индексы для быстрого поиска
- Триггеры для автоматического обновления updated_at

### Таблица `subscriptions`
- Создает таблицу для хранения подписок
- Поля: user_id, active_until, next_charge_at, status, provider, plan_code, recurring_token
- Индексы для быстрого поиска
- Триггеры для автоматического обновления updated_at

## Проверка после миграции

Выполните в SQL Editor:

```sql
-- Проверить структуру таблицы payments
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'payments' 
ORDER BY ordinal_position;

-- Проверить структуру таблицы subscriptions
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'subscriptions' 
ORDER BY ordinal_position;

-- Проверить индексы
SELECT indexname FROM pg_indexes 
WHERE tablename IN ('payments', 'subscriptions') 
AND schemaname = 'public';
```

## Важно

- Миграция идемпотентна - можно запускать несколько раз
- Если таблицы уже существуют, они будут обновлены (добавлены недостающие колонки)
- Таблица `subscriptions` будет пересоздана (DROP TABLE IF EXISTS)
- Таблица `payments` будет обновлена без удаления данных (если существует)

## Автоматическое выполнение (альтернатива)

Если у вас настроен Supabase CLI:

```bash
supabase db push
```

Или используйте скрипт:

```bash
node execute-migrations.js
```

(Требует NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env)
