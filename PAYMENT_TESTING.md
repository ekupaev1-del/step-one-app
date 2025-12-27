# Payment Testing Guide - Phase 3

## ✅ Что реализовано

### Backend
- `POST /api/robokassa/create-trial` - создание платежа 1 RUB
- Полная обработка ошибок с debug информацией
- Автоматическая отправка HTML формы в Robokassa

### Frontend
- Mini App страница `/subscription` с UI
- Debug JSON панель для отображения ответа
- Toast уведомления об ошибках

### Критические требования (все выполнены)
- ✅ OutSum = "1.000000" (ровно 6 знаков)
- ✅ Receipt item sum = OutSum (1.0)
- ✅ InvoiceID уникальный каждый раз
- ✅ Receipt закодирован один раз (encodeURIComponent)
- ✅ Signature использует закодированный Receipt
- ✅ Recurring = true
- ✅ Password2 НЕ используется в create-trial

## 📋 Настройка

### 1. Переменные окружения

Добавьте в Vercel (или `.env.local`):

```bash
ROBOKASSA_MERCHANT_LOGIN=ваш_логин
ROBOKASSA_PASSWORD1=ваш_password1
ROBOKASSA_PASSWORD2=ваш_password2
ROBOKASSA_TEST_MODE=false  # или true для тестового режима
```

### 2. Локальный запуск

```bash
cd miniapp
npm install
npm run dev
```

## 🧪 Тестирование

### Шаг 1: Открыть Mini App в Telegram

1. Запустите бота
2. Нажмите на кнопку, которая открывает Mini App (или используйте прямую ссылку)
3. Перейдите на `/subscription?id=USER_ID` (замените USER_ID на реальный ID из БД)

### Шаг 2: Создать платеж

1. На странице `/subscription` нажмите "Start trial for 1 ₽"
2. Должно произойти одно из двух:
   - **Успех**: Откроется окно/iframe с формой Robokassa
   - **Ошибка**: Покажется сообщение "Payment creation failed" и Debug JSON панель

### Шаг 3: Проверить Debug JSON

**Если платеж создан успешно**, Debug JSON должен показать:

```json
{
  "timestamp": "2024-01-15T12:00:00.000Z",
  "step": "success",
  "telegramUserId": 123456789,
  "userId": 1,
  "configLoaded": true,
  "merchantLogin": "stepone",
  "isTest": false,
  "invoiceId": "1705123456789123456",
  "invoiceIdGenerated": true,
  "outSum": "1.000000",
  "description": "Trial subscription (3 days)",
  "receipt": {
    "sno": "usn_income",
    "items": [
      {
        "name": "Trial subscription (3 days)",
        "quantity": 1,
        "sum": 1,
        "payment_method": "full_payment",
        "payment_object": "service",
        "tax": "none"
      }
    ]
  },
  "receiptItemSum": 1,
  "receiptMatchesOutSum": true,
  "formGeneration": {
    "receiptJson": "...",
    "receiptJsonLength": 123,
    "encodedReceipt": "...",
    "encodedReceiptLength": 456,
    "signatureBase": "MerchantLogin:1.000000:InvoiceID:EncodedReceipt",
    "signature": "abc123...",
    "formParams": {
      "MerchantLogin": "stepone",
      "OutSum": "1.000000",
      "InvoiceID": "1705123456789123456",
      "Description": "Trial subscription (3 days)",
      "SignatureValue": "abc123...",
      "Receipt": "[encoded, length: 456]",
      "Recurring": "true",
      "Shp_userId": 123456789
    }
  }
}
```

**Если произошла ошибка**, Debug JSON покажет:

```json
{
  "timestamp": "2024-01-15T12:00:00.000Z",
  "step": "error_step",
  "error": "Error message",
  ...
}
```

## 🔍 Что проверять в логах

### Успешный запрос

```
[robokassa/create-trial] ========== CREATE TRIAL PAYMENT ==========
[robokassa/create-trial] Telegram User ID: 123456789
[robokassa/create-trial] User found, id: 1
[robokassa/create-trial] Robokassa config loaded, merchant: stepone
[robokassa/create-trial] Generated InvoiceID: 1705123456789123456
[robokassa/create-trial] ========== SUCCESS ==========
[robokassa/create-trial] InvoiceID: 1705123456789123456
[robokassa/create-trial] OutSum: 1.000000
[robokassa/create-trial] Receipt encoded length: 456
```

### Проверка критических значений

1. **OutSum**: Должно быть точно `"1.000000"` (6 знаков после точки)
2. **InvoiceID**: Должен быть уникальным каждый раз (timestamp + random)
3. **Receipt item sum**: Должен быть равен `1.0` (совпадает с OutSum)
4. **Receipt encoding**: Должен быть закодирован один раз (проверить `encodedReceiptLength`)
5. **Signature base**: Должен содержать `MerchantLogin:OutSum:InvoiceID:EncodedReceipt` (БЕЗ Password1 в логах)
6. **Recurring**: Должен быть `"true"` в formParams

## ⚠️ Важные моменты

1. **Password2 НЕ используется** в create-trial (только Password1 для подписи)
2. **Receipt кодируется один раз** - сначала JSON.stringify, потом encodeURIComponent
3. **Signature использует закодированный Receipt** - тот же самый строковый объект, что отправляется в форме
4. **InvoiceID уникальный** - формат: `timestamp + random` (никогда не переиспользуется)

## 🐛 Troubleshooting

### Ошибка: "Payment creation failed"

1. Откройте Debug JSON панель
2. Проверьте поле `step` - оно покажет, на каком этапе произошла ошибка
3. Проверьте поле `error` - там будет описание ошибки
4. Проверьте логи сервера для деталей

### Ошибка: "Robokassa configuration error"

- Проверьте переменные окружения: `ROBOKASSA_MERCHANT_LOGIN`, `ROBOKASSA_PASSWORD1`, `ROBOKASSA_PASSWORD2`
- Убедитесь, что все три переменные установлены

### Ошибка: "User not found"

- Убедитесь, что пользователь существует в БД
- Проверьте, что `telegram_id` совпадает с переданным `telegramUserId`

### Форма не открывается

- Проверьте Debug JSON - поле `html` должно содержать HTML форму
- Проверьте консоль браузера на ошибки JavaScript
- Попробуйте открыть форму вручную (скопировать HTML и открыть в новом окне)

## 📊 Структура файлов

```
miniapp/
├── lib/
│   └── robokassa.ts                    # Утилиты для Robokassa
├── app/
│   ├── api/
│   │   └── robokassa/
│   │       └── create-trial/
│   │           └── route.ts            # POST /api/robokassa/create-trial
│   └── subscription/
│       ├── page.tsx                    # Server component с Suspense
│       └── SubscriptionClient.tsx      # Client component с UI и Debug JSON
```

## ✅ Acceptance Criteria

- [x] OutSum = "1.000000" (ровно 6 знаков)
- [x] Receipt item sum = OutSum (1.0)
- [x] InvoiceID уникальный каждый раз
- [x] Receipt закодирован один раз
- [x] Signature использует закодированный Receipt
- [x] Recurring = true
- [x] Password2 НЕ используется
- [x] Ошибки показываются с Debug JSON
- [x] Успешный платеж открывает форму Robokassa

## 🎯 Следующие шаги (после проверки)

После того, как подтвердите, что checkout страница открывается и платеж 1 RUB начинается без ошибок:

1. Реализовать callback endpoint `/api/robokassa/result`
2. Реализовать сохранение подписки в БД
3. Реализовать рекуррентные платежи
4. Добавить проверку статуса подписки

**НО СНАЧАЛА**: Убедитесь, что текущий flow работает полностью!

