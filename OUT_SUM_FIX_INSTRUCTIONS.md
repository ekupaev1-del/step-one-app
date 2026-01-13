# ⚠️ КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ - out_sum NOT NULL

## Проблема

Ошибка при создании платежа:
```
23502: null value in column "out_sum" of relation "payments" violates not-null constraint
```

**Причина:** База данных имеет колонку `out_sum` с NOT NULL, но приложение отправляет только `amount`.

## Решение

### Шаг 1: Применить миграцию

1. Откройте файл: `migrations/20241220_fix_out_sum_column.sql`
2. Скопируйте весь SQL код
3. Откройте Supabase SQL Editor: https://app.supabase.com → Ваш проект → SQL Editor
4. Вставьте SQL и нажмите "Run"
5. После успеха выполните: `SELECT pg_notify('pgrst', 'reload schema');`
6. Подождите 10-30 секунд

### Шаг 2: Проверка

Выполните в SQL Editor:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'payments' 
AND column_name IN ('out_sum', 'amount')
ORDER BY column_name;
```

**Ожидаемый результат:**
- `amount`: `data_type = 'numeric'`, `is_nullable = 'NO'` ✅
- `out_sum`: `data_type = 'numeric'` (если существует), `is_nullable = 'YES'` ✅ (nullable)

## Что делает миграция

- ✅ Убирает NOT NULL constraint с `out_sum` (делает nullable)
- ✅ Убеждается, что `amount` существует и NOT NULL
- ✅ Конвертирует `amount` в NUMERIC если нужно
- ✅ Заполняет `out_sum` из `amount` для существующих строк
- ✅ Перезагружает кеш схемы PostgREST

## Что делает код

- ✅ Включает `out_sum` в insert payload (устанавливает = amount)
- ✅ Конвертирует `amount` из строки в число для БД
- ✅ Обе колонки заполняются для совместимости

## После исправления

- ✅ `/api/payments/start` возвращает `{ ok: true }`
- ✅ Платежи создаются успешно
- ✅ Ошибка 23502 исчезнет
- ✅ Debug overlay показывает наличие `amount` и `out_sum`

---

**Важно:** Миграция безопасна и сохраняет все существующие данные. Код теперь отправляет обе колонки для совместимости.
