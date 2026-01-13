# ⚡ ПРИМЕНИТЬ МИГРАЦИЮ СЕЙЧАС

## Быстрый способ (3 шага)

### Шаг 1: Откройте файл миграции
Файл: `migrations/fix_payments_table_schema.sql`

### Шаг 2: Скопируйте весь SQL код
- Откройте файл в редакторе
- Выделите весь текст (Ctrl+A)
- Скопируйте (Ctrl+C)

### Шаг 3: Выполните в Supabase SQL Editor
1. Откройте https://app.supabase.com
2. Выберите ваш проект
3. Перейдите в **SQL Editor** (в боковом меню)
4. Вставьте скопированный SQL (Ctrl+V)
5. Нажмите **"Run"** или **Ctrl+Enter**
6. Дождитесь сообщения "Success"
7. Подождите 1-2 минуты для обновления кеша схемы

## Проверка после миграции

Выполните в SQL Editor:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'payments' 
ORDER BY ordinal_position;
```

**Ожидаемый результат:** Должны быть все колонки:
- id, user_id, telegram_user_id, plan_code, amount, currency
- method, provider, inv_id, status, payment_url
- created_at, updated_at

## Важно

✅ Миграция **идемпотентна** - можно запускать несколько раз  
✅ Безопасна - не удалит существующие данные  
✅ Автоматически добавит недостающие колонки  

## Альтернатива: Через скрипт

Если хотите увидеть SQL в консоли:

```bash
node apply-migration-simple.js
```

Скопируйте выведенный SQL и выполните в Supabase SQL Editor.
