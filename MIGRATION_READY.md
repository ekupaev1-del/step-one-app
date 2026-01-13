# ✅ Миграция готова к применению

## SQL код для выполнения

Файл миграции: `migrations/fix_payments_table_schema.sql`

**Весь SQL код уже готов и выведен выше в консоли.**

## Инструкция

1. **Скопируйте SQL код** из файла `migrations/fix_payments_table_schema.sql`
2. **Откройте Supabase Dashboard**: https://app.supabase.com
3. **Выберите ваш проект**
4. **Перейдите в SQL Editor** (в боковом меню слева)
5. **Вставьте SQL код** в редактор
6. **Нажмите "Run"** или **Ctrl+Enter**
7. **Дождитесь сообщения "Success"**
8. **Подождите 1-2 минуты** для обновления кеша схемы

## Проверка

После выполнения миграции выполните в SQL Editor:

```sql
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'payments' 
ORDER BY ordinal_position;
```

Должны быть все колонки: id, user_id, telegram_user_id, plan_code, amount, currency, method, provider, inv_id, status, payment_url, created_at, updated_at

## Важно

- ✅ Миграция **идемпотентна** - можно запускать несколько раз
- ✅ Безопасна - не удалит существующие данные
- ✅ Автоматически добавит недостающие колонки

---

**Примечание:** Supabase JS клиент не может выполнять DDL (CREATE TABLE, ALTER TABLE) напрямую. Поэтому миграцию нужно выполнить вручную в SQL Editor. Это стандартная практика для Supabase.
