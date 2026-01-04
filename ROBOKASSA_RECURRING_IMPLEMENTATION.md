# Robokassa Recurring Payments Implementation

## Реализовано

### 1. Parent Payment (Trial - 1 RUB)
- **Endpoint**: `POST /api/robokassa/create-trial?telegramUserId=...`
- **Режим**: Всегда `recurring` (для привязки карты)
- **URL**: `https://auth.robokassa.ru/Merchant/Index.aspx`
- **Поля формы**:
  - `MerchantLogin`, `OutSum` (1.00), `InvoiceID`, `Description`
  - `Receipt` (encoded), `Recurring=true`
  - `SignatureValue` (MD5)
  - `Shp_userId` (если передан)
- **Подпись**: `MD5(MerchantLogin:OutSum:InvoiceID:ReceiptEncoded:Password1[:Shp_*])`
- **Хранение**: Сохраняется в `payments` с `parent_invoice_id=NULL`

### 2. Child Payment (Monthly - 199 RUB)
- **Endpoint**: `POST /api/robokassa/create-monthly?telegramUserId=...`
- **URL**: `https://auth.robokassa.ru/Merchant/Recurring`
- **Поля формы**:
  - `MerchantLogin`, `InvoiceID` (child), `PreviousInvoiceID` (parent)
  - `OutSum` (199.00), `Description`, `SignatureValue`
  - **НЕ включает**: `Recurring`, `IncCurrLabel`, `ExpirationDate`
- **Подпись**: `MD5(MerchantLogin:OutSum:InvoiceID:Password1)` 
  - **КРИТИЧНО**: `PreviousInvoiceID` НЕ включается в подпись!
- **Хранение**: Сохраняется в `payments` с `parent_invoice_id=parent_inv_id`

### 3. Версионирование
- **Endpoint**: `GET /api/version`
- **Возвращает**: `{ gitSha, gitShaFull, deployedAt, env, timestamp }`
- **Использование**: BuildStamp компонент показывает версию в UI

### 4. Триггер Monthly Payment
- **Endpoint**: `POST /api/subscription/trigger-monthly?telegramUserId=...`
- **Логика**: Проверяет, что trial закончился, затем вызывает `create-monthly`
- **Использование**: Можно вызывать вручную или через cron после окончания trial

## Файлы изменены/созданы

### Новые файлы:
1. `miniapp/app/api/robokassa/create-monthly/route.ts` - Child payment endpoint
2. `miniapp/app/api/subscription/trigger-monthly/route.ts` - Manual trigger для monthly
3. `miniapp/app/api/version/route.ts` - Version endpoint
4. `miniapp/app/components/BuildStamp.tsx` - Client component для версии
5. `migrations/add_parent_invoice_id_to_payments.sql` - Миграция для parent_invoice_id

### Обновленные файлы:
1. `miniapp/lib/robokassa.ts`:
   - Добавлены `signRecurring()` и `generateRecurringForm()`
   - Улучшена сортировка Shp_* параметров
   - Добавлена валидация Password1/IsTest

2. `miniapp/app/api/robokassa/create-trial/route.ts`:
   - Всегда использует `recurring` режим для parent payment
   - Улучшена обработка ошибок (400 вместо 500)

3. `miniapp/app/api/robokassa/result/route.ts`:
   - Добавлено логирование типа платежа (parent/child)

4. `miniapp/app/subscription/SubscriptionClient.tsx`:
   - Убрана опция выбора режима (всегда recurring)
   - Улучшена обработка JSON/HTML ответов
   - Форма заменяет документ для правильной отправки в Telegram WebView

5. `miniapp/app/layout.tsx`:
   - Использует BuildStamp компонент из отдельного файла

## Миграция БД

Выполните в Supabase SQL Editor:
```sql
-- migrations/add_parent_invoice_id_to_payments.sql
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS parent_invoice_id BIGINT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_parent_invoice_id ON public.payments(parent_invoice_id);
```

## Использование

### 1. Создание Parent Payment (Trial)
```typescript
// Клиент вызывает:
POST /api/robokassa/create-trial?telegramUserId=123456789

// Ответ:
{
  ok: true,
  html: "<form>...</form>", // Авто-сабмит форма
  debug: { ... }
}

// Клиент заменяет документ HTML формой
document.open();
document.write(data.html);
document.close();
```

### 2. Создание Child Payment (Monthly)
```typescript
// После успешного parent payment и окончания trial:
POST /api/robokassa/create-monthly?telegramUserId=123456789

// Ответ:
{
  ok: true,
  html: "<form>...</form>", // Форма для Recurring endpoint
  invoiceId: 1234567890,
  previousInvoiceId: 9876543210
}
```

### 3. Проверка версии
```typescript
GET /api/version

// Ответ:
{
  gitSha: "9b06ac3",
  gitShaFull: "9b06ac3...",
  deployedAt: "2026-01-16T...",
  env: "production",
  timestamp: "2026-01-16T..."
}
```

## Важные замечания

1. **Parent payment всегда recurring**: Для привязки карты используется `Recurring=true`
2. **PreviousInvoiceID НЕ в подписи**: Для child payment PreviousInvoiceID передается в форме, но НЕ включается в SignatureValue
3. **InvoiceID генерируется нами**: Для child payment мы генерируем InvoiceID (не пустой, не 0)
4. **Авто-сабмит форм**: HTML формы автоматически отправляются через JavaScript
5. **Обработка результатов**: `/api/robokassa/result` обрабатывает как parent, так и child payments

## Следующие шаги

1. Выполнить миграцию `add_parent_invoice_id_to_payments.sql`
2. Настроить cron/планировщик для вызова `trigger-monthly` после окончания trial
3. Протестировать parent payment (1 RUB trial)
4. Протестировать child payment (199 RUB monthly) после успешного parent

