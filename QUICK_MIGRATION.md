# Быстрое выполнение миграций

## Способ 1: Через Supabase SQL Editor (Рекомендуется)

1. Откройте файл: `migrations/run-all-migrations.sql`
2. Скопируйте **весь** SQL код из файла
3. Откройте [Supabase Dashboard](https://app.supabase.com) → Ваш проект → SQL Editor
4. Вставьте скопированный SQL код
5. Нажмите **"Run"** или **Ctrl+Enter**
6. Дождитесь сообщения "Success"
7. Подождите 1-2 минуты для обновления кеша схемы

## Способ 2: Через API Endpoint (Если настроен MIGRATION_SECRET)

```bash
curl -X POST https://your-domain.vercel.app/api/migrations/run \
  -H "Authorization: Bearer YOUR_MIGRATION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"migration": "run-all-migrations.sql"}'
```

## Что будет создано

✅ Таблица `payments` с полями:
- id, user_id, telegram_user_id, plan_code, amount, currency
- method (sbp/card), provider, inv_id, status, payment_url
- created_at, updated_at

✅ Таблица `subscriptions` с полями:
- user_id (PK), active_until, next_charge_at
- status, provider, plan_code, recurring_token
- created_at, updated_at

✅ Индексы для быстрого поиска
✅ Триггеры для автоматического обновления updated_at

## Проверка

После выполнения миграции выполните в SQL Editor:

```sql
-- Проверить таблицы
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('payments', 'subscriptions');

-- Должно вернуть:
-- payments
-- subscriptions
```

## Важно

- Миграция безопасна - можно запускать несколько раз
- Если таблицы существуют, они будут обновлены
- Таблица `subscriptions` будет пересоздана (данные удалятся)
- Таблица `payments` сохранит существующие данные
