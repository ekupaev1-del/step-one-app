# ⚠️ КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ - Применить немедленно

## Проблема

Ошибка при создании платежа:
```
22P02: invalid input syntax for type integer: "web:253"
```

**Причина:** Колонка `telegram_user_id` в таблице `payments` имеет тип INTEGER, а приложение отправляет строку `"web:253"`.

## Решение

### Быстрое исправление (1 шаг)

1. Откройте файл: `migrations/20241220_fix_telegram_user_id_CRITICAL.sql`
2. Скопируйте весь SQL код
3. Откройте Supabase SQL Editor: https://app.supabase.com → Ваш проект → SQL Editor
4. Вставьте SQL и нажмите "Run"
5. После успеха выполните: `SELECT pg_notify('pgrst', 'reload schema');`
6. Подождите 10-30 секунд

### Что делает миграция

- Конвертирует `telegram_user_id` из INTEGER в TEXT
- Сохраняет все существующие данные (конвертирует числа в строки)
- Пересоздает индексы
- Перезагружает кеш схемы PostgREST

## Проверка после миграции

Выполните в SQL Editor:

```sql
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'payments' 
AND column_name = 'telegram_user_id';
```

**Ожидаемый результат:**
- `data_type` = `text`
- `is_nullable` = `NO`

## После исправления

- ✅ `/api/payments/start` будет возвращать `{ ok: true }`
- ✅ Платежи будут создаваться успешно
- ✅ Ошибка 22P02 исчезнет

---

**Важно:** Эта миграция безопасна и сохраняет все существующие данные.
