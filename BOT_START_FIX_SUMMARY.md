# Bot /start DB Insert Fix Summary

## Проблема

После успешного деплоя бот отвечает "Ошибка создания записи в базе. Попробуйте позже." при команде `/start`. Это означает, что операция INSERT в базу данных не выполняется в production.

## Реализованные исправления

### 1. Улучшенное логирование в `/start` handler

**Файл:** `bot/src/index.ts`

**Изменения:**
- ✅ Добавлен `requestId` для всех операций (формат: `start-<timestamp>-<random>`)
- ✅ Логирование статуса окружения: `isProduction`, `hasSupabaseUrl`, `hasSupabaseKey` (boolean only, no secrets)
- ✅ Детальное логирование Postgres ошибок: `message`, `code`, `details`, `hint`, `stack`
- ✅ Логирование названия операции: `createUserOnStart`
- ✅ Логирование санитизированных ключей payload: `["telegram_id"]` (без секретов)
- ✅ Обернута DB insert операция в try/catch для обработки неожиданных ошибок

**Пример логов:**
```
[bot:start-1234567890-abc123] Operation: createUserOnStart
[bot:start-1234567890-abc123] Environment: isProduction=true, hasSupabaseUrl=true, hasSupabaseKey=true
[bot:start-1234567890-abc123] Insert payload keys: ["telegram_id"]
[bot:start-1234567890-abc123] Ошибка upsert (createUserOnStart): {
  operation: "createUserOnStart",
  telegram_id: 123456,
  payloadKeys: ["telegram_id"],
  dbError: {
    message: "...",
    code: "23502",
    details: "...",
    hint: "...",
    stack: "..."
  }
}
```

### 2. Обновленные сообщения об ошибках

**Изменения:**
- ✅ Все ошибки теперь включают `requestId` для пользователя: `"Ошибка создания записи в базе. Попробуйте позже. Код: start-1234567890-abc123"`
- ✅ Сообщения на русском языке
- ✅ Никакие секреты (URLs, ключи, токены) не попадают в ответы пользователю

### 3. Новый Health Check Endpoint

**Файл:** `miniapp/app/api/health/db/route.ts` (новый)

**Функционал:**
- ✅ GET `/api/health/db` - проверка подключения к БД
- ✅ Возвращает `{ ok: true, requestId, timestamp }` если БД доступна
- ✅ Возвращает `{ ok: false, requestId, error, dbErrorCode }` если БД недоступна
- ✅ Логирует статус окружения и детали ошибок БД
- ✅ Никакие секреты не попадают в ответ

**Использование:**
```bash
curl https://your-app.vercel.app/api/health/db
```

## Переменные окружения

### Обязательные для работы

**Bot (Vercel):**
- `TELEGRAM_BOT_TOKEN` - токен Telegram бота
- `SUPABASE_URL` - URL Supabase проекта (или `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` - service role ключ Supabase

**MiniApp (Vercel):**
- `NEXT_PUBLIC_SUPABASE_URL` - URL Supabase проекта
- `SUPABASE_SERVICE_ROLE_KEY` - service role ключ Supabase

### Проверка переменных окружения

Логи автоматически показывают наличие переменных:
- `hasSupabaseUrl=true/false`
- `hasSupabaseKey=true/false`

Никакие значения секретов не логируются.

## Схема базы данных

### Таблица `users`

Ожидаемые колонки:
- `id` - PRIMARY KEY (integer/bigint)
- `telegram_id` - уникальный Telegram ID (integer/bigint, NOT NULL, UNIQUE)

### Проверка схемы

Если возникает ошибка при INSERT:
1. Проверьте, что таблица `users` существует
2. Проверьте, что колонка `telegram_id` существует и имеет правильный тип (integer/bigint)
3. Проверьте, что на колонке `telegram_id` есть UNIQUE constraint
4. Проверьте RLS (Row Level Security) политики - они не должны блокировать INSERT для service role key

## Диагностика проблем

### Шаг 1: Проверка Health Check

```bash
curl https://your-app.vercel.app/api/health/db
```

Если `ok: false`, проверьте:
- Переменные окружения в Vercel
- Подключение к Supabase
- RLS политики

### Шаг 2: Проверка логов в Vercel

1. Откройте Vercel Dashboard → Deployments
2. Выберите последний деплой → Logs
3. Найдите логи с `[bot:start-...]` и проверьте:
   - `Environment: isProduction=...`
   - `hasSupabaseUrl=...`, `hasSupabaseKey=...`
   - `dbError` объект с деталями Postgres ошибки

### Шаг 3: Поиск по requestId

Если пользователь сообщил код ошибки (например, `start-1234567890-abc123`):
```bash
# В логах Vercel ищите:
[bot:start-1234567890-abc123]
```

Это позволит найти все логи связанные с этим запросом.

## Тест план

### Локальное тестирование

1. Настройте `.env` в папке `bot/`:
   ```
   TELEGRAM_BOT_TOKEN=your-token
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-key
   ```

2. Запустите бота:
   ```bash
   cd bot
   npm run dev
   ```

3. Отправьте `/start` в боте и проверьте:
   - ✅ Пользователь создается в БД
   - ✅ Логи показывают `requestId`
   - ✅ Нет ошибок в консоли

### Preview тестирование

1. Создайте PR и дождитесь деплоя preview
2. Проверьте health check:
   ```bash
   curl https://your-app-git-branch-vercel.vercel.app/api/health/db
   ```
3. Проверьте логи в Vercel для preview деплоя

### Production тестирование

1. После деплоя в `main`, проверьте health check:
   ```bash
   curl https://your-app.vercel.app/api/health/db
   ```

2. Отправьте `/start` в боте и проверьте:
   - ✅ Пользователь создается успешно
   - ✅ Логи в Vercel показывают `requestId` и детали операций
   - ✅ Нет ошибок "Ошибка создания записи в базе"

3. Если ошибка все еще возникает:
   - Найдите `requestId` в сообщении пользователю
   - Найдите этот `requestId` в логах Vercel
   - Проверьте `dbError` объект для диагностики проблемы

## Измененные файлы

1. `bot/src/index.ts` - Улучшенное логирование в `/start` handler
2. `miniapp/app/api/health/db/route.ts` - Новый health check endpoint

## Дополнительные замечания

- ✅ Все логи санитизированы - секреты не логируются
- ✅ Все сообщения на русском языке
- ✅ `requestId` включен во все ответы пользователю для поддержки
- ✅ Подробные Postgres ошибки логируются для диагностики
- ✅ Health check endpoint можно использовать для мониторинга
