# ⚡ ПРИМЕНИТЬ МИГРАЦИЮ - ПОШАГОВАЯ ИНСТРУКЦИЯ

## Шаг 1: Откройте Supabase SQL Editor

1. Перейдите на https://app.supabase.com
2. Войдите в свой аккаунт
3. Выберите ваш проект
4. В боковом меню слева найдите **"SQL Editor"** и кликните

## Шаг 2: Скопируйте SQL код

Файл миграции: `migrations/20241220_fix_payments_schema_complete.sql`

**Весь SQL код находится в файле выше. Скопируйте его полностью.**

## Шаг 3: Вставьте и выполните

1. В SQL Editor нажмите **"New query"** (если нужно)
2. Вставьте скопированный SQL код (Ctrl+V)
3. Нажмите **"Run"** или **Ctrl+Enter**
4. Дождитесь сообщения **"Success"** внизу экрана

## Шаг 4: Перезагрузите кеш схемы (КРИТИЧЕСКИ ВАЖНО!)

После успешного выполнения миграции, выполните этот SQL:

```sql
SELECT pg_notify('pgrst', 'reload schema');
```

Или альтернативный вариант:

```sql
NOTIFY pgrst, 'reload schema';
```

**Это обязательно!** Без этого PostgREST не увидит новые колонки.

## Шаг 5: Проверка

Выполните этот запрос для проверки:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'payments' 
ORDER BY ordinal_position;
```

**Ожидаемый результат:** Должны быть все колонки:
- id, user_id, telegram_user_id, inv_id, method, plan_code
- amount, currency, status, payment_url, provider
- created_at, updated_at

## Важно

✅ Миграция **идемпотентна** - можно запускать несколько раз  
✅ Безопасна - не удалит существующие данные  
✅ Автоматически добавит недостающие колонки  

## Если возникли ошибки

1. **"column already exists"** - это нормально, миграция идемпотентна
2. **"constraint already exists"** - это нормально, миграция пересоздает constraints
3. **"Could not find column"** после миграции - не забыли перезагрузить кеш схемы!

---

**После выполнения миграции подождите 10-30 секунд перед тестированием API.**
