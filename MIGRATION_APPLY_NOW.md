# ⚡ ПРИМЕНИТЬ МИГРАЦИЮ ПРЯМО СЕЙЧАС

## Быстрый способ (3 шага)

### Шаг 1: Откройте файл миграции
Файл: `migrations/20241220_fix_payments_schema_complete.sql`

### Шаг 2: Скопируйте весь SQL код
- Откройте файл в редакторе
- Выделите весь текст (Ctrl+A)
- Скопируйте (Ctrl+C)

### Шаг 3: Выполните в Supabase SQL Editor
1. Откройте https://app.supabase.com
2. Выберите ваш проект
3. Перейдите в **SQL Editor** (в боковом меню)
4. Вставьте SQL код (Ctrl+V)
5. Нажмите **"Run"** или **Ctrl+Enter**
6. Дождитесь сообщения "Success"
7. **ВАЖНО:** Выполните еще раз:
   ```sql
   SELECT pg_notify('pgrst', 'reload schema');
   ```
8. Подождите 10-30 секунд

## Проверка

После выполнения выполните:

```sql
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'payments' 
ORDER BY ordinal_position;
```

Должны быть все колонки: id, user_id, telegram_user_id, inv_id, method, plan_code, amount, currency, status, payment_url, provider, created_at, updated_at

---

**Примечание:** Supabase JS клиент не может выполнять DDL (CREATE TABLE, ALTER TABLE) напрямую. Поэтому миграцию нужно выполнить вручную в SQL Editor. Это стандартная практика для Supabase.
