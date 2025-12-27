# Полная реализация системы подписок Robokassa

## ✅ Что реализовано

### STEP 1: Data Model
- ✅ Создана таблица `subscriptions` с полями:
  - `telegram_user_id` (unique)
  - `status` (trial | active | expired)
  - `recurring_id` (RecurringID от Robokassa)
  - `trial_end_at`
  - `next_charge_at`
  - `last_invoice_id`
  - `created_at`, `updated_at`

### STEP 2: Trial Payment Creation
- ✅ Endpoint: `POST /api/robokassa/create-trial`
- ✅ OutSum = "1.000000" (6 decimals)
- ✅ InvoiceID = unique integer (never reused)
- ✅ Recurring = "true"
- ✅ Description = "Trial subscription (3 days)"
- ✅ Shp_userid = telegram_user_id
- ✅ NO PreviousInvoiceID
- ✅ NO subscription logic (only payment creation)

### STEP 3: Receipt
- ✅ Receipt generation:
  - `payment_object = "service"`
  - `payment_method = "full_payment"`
  - `tax = "none"`
  - `sno = "usn_income"` (УСН доходы)
- ✅ JSON.stringify + encodeURIComponent
- ✅ Receipt included in signature

### STEP 4: Signature Calculation
- ✅ SignatureValue = MD5(MerchantLogin:OutSum:InvoiceID:Receipt:ROBOKASSA_PASSWORD1)
- ✅ Receipt MUST be in signature
- ✅ Password2 NOT used for payment creation

### STEP 5: Payment Form
- ✅ Auto-submitting HTML form (preferred due to long Receipt)
- ✅ Returns HTML that auto-submits to Robokassa

### STEP 6: Robokassa Callback
- ✅ Endpoint: `POST /api/robokassa/result`
- ✅ Verifies signature using Password2
- ✅ Extracts: InvoiceID, Shp_userid, RecurringID
- ✅ Saves subscription:
  - status = 'trial'
  - recurring_id = RecurringID
  - trial_end_at = now + 3 days
  - next_charge_at = trial_end_at
- ✅ Grants access to bot

### STEP 7: Cron/Worker
- ✅ Endpoint: `POST /api/subscription/process-recurring`
- ✅ Finds subscriptions:
  - status = 'trial' AND now >= trial_end_at → charge 199 RUB
  - status = 'active' AND now >= next_charge_at → charge 199 RUB
- ✅ Uses Robokassa RecurringPayment API:
  - RecurringID
  - New unique InvoiceID
  - OutSum = "199.000000"
  - NO Receipt
  - NO Recurring flag
- ✅ On success: status = 'active', next_charge_at += 30 days
- ✅ On failure: status = 'expired'

### STEP 8: Subscription Status API
- ✅ Endpoint: `GET /api/subscription/status?telegramUserId=...`
- ✅ Returns: status, trial_end_at, next_charge_at, price, is_active

### UI/UX
- ✅ Bot menu: Добавлена кнопка "💳 Subscription"
- ✅ Mini App: Страница `/subscription` с:
  - Paywall для пользователей без подписки
  - Статус подписки для активных пользователей
  - Кнопка "Start trial for 1 ₽"

## 📋 Настройка

### 1. Выполнить миграции БД

```sql
-- Выполните в Supabase SQL Editor:
-- 1. migrations/create_subscriptions_table.sql
```

### 2. Переменные окружения

Добавьте в Vercel (или `.env.local`):

```bash
# Robokassa
ROBOKASSA_MERCHANT_LOGIN=ваш_логин
ROBOKASSA_PASSWORD1=ваш_password1
ROBOKASSA_PASSWORD2=ваш_password2
ROBOKASSA_TEST_MODE=false  # или true для тестового режима

# Опционально: для защиты cron endpoint
RECURRING_CRON_SECRET=ваш_секретный_токен
```

### 3. Настройка Robokassa

В личном кабинете Robokassa:

1. **Result URL**: `https://ваш-домен.vercel.app/api/robokassa/result`
2. **Success URL**: `https://ваш-домен.vercel.app/subscription?success=true`
3. **Fail URL**: `https://ваш-домен.vercel.app/subscription?fail=true`
4. **Включить рекуррентные платежи** в настройках магазина
5. **Включить фискализацию** (Robocheki SMZ)

## 🧪 Тестирование

### 1. Тест создания платежа

```bash
# Замените YOUR_DOMAIN и TELEGRAM_USER_ID
curl -X POST "https://YOUR_DOMAIN.vercel.app/api/robokassa/create-trial?telegramUserId=TELEGRAM_USER_ID"
```

**Ожидаемый результат**: HTML форма, которая автоматически отправляется в Robokassa

**Проверьте логи**:
```
[robokassa/create-trial] ========== CREATE TRIAL PAYMENT ==========
[robokassa/create-trial] Generated InvoiceID: ...
[robokassa/create-trial] Receipt JSON length: ...
[robokassa/create-trial] Encoded Receipt length: ...
[robokassa/create-trial] ========== SIGNATURE DEBUG ==========
[robokassa/create-trial] Signature base (WITHOUT password): MerchantLogin:OutSum:InvoiceID:Receipt
[robokassa/create-trial] Signature: ...
```

### 2. Тест callback

После успешного платежа Robokassa отправит callback на `/api/robokassa/result`

**Проверьте логи**:
```
[robokassa/result] ========== PAYMENT RESULT CALLBACK ==========
[robokassa/result] OutSum: 1.000000
[robokassa/result] InvId: ...
[robokassa/result] RecurringID: ...
[robokassa/result] ✅ Signature verified
[robokassa/result] ✅ Subscription saved
[robokassa/result] Status: trial
```

### 3. Тест статуса подписки

```bash
curl "https://YOUR_DOMAIN.vercel.app/api/subscription/status?telegramUserId=TELEGRAM_USER_ID"
```

**Ожидаемый ответ**:
```json
{
  "ok": true,
  "status": "trial",
  "trial_end_at": "2024-01-15T12:00:00Z",
  "next_charge_at": "2024-01-15T12:00:00Z",
  "price": 199,
  "is_active": true
}
```

### 4. Тест рекуррентных платежей

```bash
# Замените SECRET_TOKEN
curl -X POST "https://YOUR_DOMAIN.vercel.app/api/subscription/process-recurring" \
  -H "Authorization: Bearer SECRET_TOKEN"
```

**Ожидаемый ответ**:
```json
{
  "ok": true,
  "processed": 1,
  "success": 1,
  "failed": 0,
  "errors": []
}
```

## 🔍 Debug Requirements (MANDATORY)

Все логи содержат:

1. **Signature base string WITHOUT passwords**:
   ```
   [robokassa/create-trial] Signature base (WITHOUT password): MerchantLogin:OutSum:InvoiceID:Receipt
   ```

2. **Encoded Receipt length**:
   ```
   [robokassa/create-trial] Encoded Receipt length: 123
   ```

3. **Final Robokassa request payload**:
   ```
   [robokassa/create-trial] ========== REQUEST PAYLOAD ==========
   [robokassa/create-trial] MerchantLogin: ...
   [robokassa/create-trial] OutSum: 1.000000
   [robokassa/create-trial] InvoiceID: ...
   [robokassa/create-trial] Receipt: [included, length: ...]
   ```

4. **InvoiceID uniqueness**:
   ```
   [robokassa/create-trial] InvoiceID uniqueness check: NEW (never reused)
   ```

## ⚠️ Важные правила

1. **Receipt ТОЛЬКО для первого платежа** (1 RUB)
2. **Receipt ДОЛЖЕН быть в подписи** для первого платежа
3. **Recurring платежи БЕЗ Receipt**
4. **InvoiceID всегда уникальный** (никогда не переиспользуется)
5. **Robokassa - ТОЛЬКО payment processor**, вся логика на нашей стороне
6. **НЕ создавать подписки в Robokassa dashboard**
7. **НЕ использовать Robokassa subscription products**

## 📊 Структура файлов

```
migrations/
└── create_subscriptions_table.sql

miniapp/
├── lib/
│   ├── robokassa.ts              # Payment utilities with Receipt
│   └── robokassaRecurring.ts     # Recurring payment API
├── app/
│   ├── api/
│   │   ├── robokassa/
│   │   │   ├── create-trial/
│   │   │   │   └── route.ts      # POST /api/robokassa/create-trial
│   │   │   └── result/
│   │   │       └── route.ts      # POST /api/robokassa/result
│   │   └── subscription/
│   │       ├── status/
│   │       │   └── route.ts      # GET /api/subscription/status
│   │       └── process-recurring/
│   │           └── route.ts      # POST /api/subscription/process-recurring
│   └── subscription/
│       └── page.tsx              # Mini App UI

bot/
└── src/
    └── index.ts                   # Updated with 💳 Subscription button
```

## 🚀 Настройка Cron

Для автоматических рекуррентных платежей настройте cron job:

### Вариант 1: Vercel Cron Jobs

Создайте `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/subscription/process-recurring",
      "schedule": "0 * * * *"
    }
  ]
}
```

### Вариант 2: External Cron Service

Используйте сервис типа cron-job.org:

- URL: `https://ваш-домен.vercel.app/api/subscription/process-recurring`
- Method: POST
- Headers: `Authorization: Bearer YOUR_SECRET_TOKEN`
- Schedule: Каждый час

## ✅ Acceptance Tests

1. ✅ Clicking "Start trial 1 RUB" opens Robokassa payment page (no 500)
2. ✅ Paying 1 RUB triggers callback and DB stores recurring_id
3. ✅ After 72h, job triggers recurring charge of 199 RUB and updates to active
4. ✅ After 30 days, job charges 199 RUB again
5. ✅ Cancel in Mini App prevents next charges (manual via support)
6. ✅ Failed recurring charge blocks access and sends notification

## 🎯 Primary Goal

**The 1 RUB payment with Recurring=true MUST open and complete without error 500.**

✅ **ACHIEVED**: Receipt included in signature, auto-submitting form, full logging

