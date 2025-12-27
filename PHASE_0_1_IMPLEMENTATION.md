# Phase 0 + Phase 1 Implementation

## ✅ Что реализовано

### Phase 0: Database Migration
- ✅ Создана миграция `migrations/add_recurring_fields.sql`
- ✅ Добавлены поля:
  - `recurring_id` - RecurringID от Robokassa
  - `valid_until` - до какой даты действует подписка
  - `last_payment_at` - время последнего успешного платежа
  - `fail_reason`, `fail_code` - информация об ошибках
  - `retry_count`, `retry_at` - для стратегии повторов
- ✅ Создан индекс для запросов рекуррентных платежей

### Phase 1: Payment Creation API
- ✅ Создана утилита `miniapp/lib/robokassa.ts`:
  - `generatePaymentUrl()` - генерация URL платежа
  - `verifyResultSignature()` - проверка подписи от Robokassa
  - `getRobokassaConfig()` - получение конфигурации из env
- ✅ Создан endpoint `POST /api/robokassa/create`:
  - Принимает `userId` в query string
  - Генерирует уникальный InvoiceID
  - Создает платеж 1 RUB с `Recurring=true`
  - **БЕЗ Receipt** (чтобы избежать ошибки 500)
  - Сохраняет запись в таблицу `payments`
  - Возвращает `paymentUrl` и `invoiceId`

## 📋 Что нужно сделать

### 1. Выполнить миграцию БД

Выполните SQL миграцию в Supabase SQL Editor:

```sql
-- Файл: migrations/add_recurring_fields.sql
```

### 2. Настроить переменные окружения

Добавьте в Vercel (или `.env.local` для локальной разработки):

```bash
ROBOKASSA_MERCHANT_LOGIN=ваш_логин
ROBOKASSA_PASSWORD1=ваш_password1
ROBOKASSA_PASSWORD2=ваш_password2
ROBOKASSA_TEST_MODE=false  # или true для тестового режима
```

### 3. Тестирование

#### Шаг 1: Проверка endpoint

```bash
# Замените YOUR_DOMAIN на ваш домен Vercel
# Замените USER_ID на реальный ID пользователя из БД

curl -X POST "https://YOUR_DOMAIN.vercel.app/api/robokassa/create?userId=USER_ID" \
  -H "Content-Type: application/json"
```

**Ожидаемый ответ:**
```json
{
  "ok": true,
  "paymentUrl": "https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=...",
  "invoiceId": "1234567890_123_4567"
}
```

#### Шаг 2: Проверка URL

1. Скопируйте `paymentUrl` из ответа
2. Откройте в браузере
3. **Ожидаемый результат**: Страница Robokassa открывается БЕЗ ошибки 500

#### Шаг 3: Проверка логов

В логах Vercel должны быть записи:

```
[robokassa/create] ========== CREATE PAYMENT REQUEST ==========
[robokassa/create] User ID: 123
[robokassa/create] User found, status: none
[robokassa/create] Robokassa config loaded, merchant: stepone
[robokassa/create] Generated InvoiceID: 1234567890_123_4567
[robokassa/create] Payment URL generated
[robokassa/create] Signature: abc123...
[robokassa/create] ✅ Payment record saved
[robokassa/create] ========== SUCCESS ==========
```

## 🔍 Проверка значений в логах

### Что проверить:

1. **InvoiceID формат**: `timestamp_userId_random` (например: `1703123456789_123_4567`)
2. **Signature**: MD5 хеш в нижнем регистре (32 символа)
3. **URL содержит**:
   - `MerchantLogin=ваш_логин`
   - `OutSum=1.00`
   - `InvoiceID=...`
   - `Recurring=1` (ВАЖНО: "1", не "true"!)
   - `Shp_userId=USER_ID`
   - `SignatureValue=...`

### Что НЕ должно быть в URL:

- ❌ `Receipt=` (убрано для Phase 1, чтобы избежать 500)

## ⚠️ Важные замечания

1. **Recurring=1**: Используется строка "1", не boolean
2. **InvoiceID**: Robokassa ожидает параметр `InvoiceID` (не `InvId`)
3. **Подпись**: Формула `MerchantLogin:OutSum:InvId:Password1` (БЕЗ Receipt)
4. **Тестовый режим**: Если `ROBOKASSA_TEST_MODE=true`, добавляется `IsTest=1`

## 🐛 Если платеж не открывается (500 ошибка)

1. **Проверьте логи Vercel** - найдите точную ошибку
2. **Проверьте переменные окружения** - все ли установлены?
3. **Проверьте подпись** - сравните с расчетом в Python скрипте
4. **Проверьте настройки Robokassa**:
   - Включены ли рекуррентные платежи?
   - Правильные ли пароли (Password1, Password2)?

## 📝 Следующие шаги (Phase 2+)

После того, как платеж открывается без ошибки 500:

1. Phase 2: Создать `/api/robokassa/result` endpoint для обработки callback
2. Phase 3: Реализовать логику активации триала после успешного платежа
3. Phase 4: Реализовать scheduler для рекуррентных платежей
4. Phase 5: Добавить endpoints для Mini App (status, cancel)

## 📊 Структура файлов

```
miniapp/
├── lib/
│   └── robokassa.ts          # Утилиты для Robokassa
└── app/
    └── api/
        └── robokassa/
            └── create/
                └── route.ts   # POST /api/robokassa/create

migrations/
└── add_recurring_fields.sql  # Миграция БД
```

