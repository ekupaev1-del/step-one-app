# Payment Flow - Phase 3 Implementation

## ✅ Что реализовано

### Backend (`POST /api/robokassa/create-trial`)

**При ошибке:**
- Возвращает HTTP 500
- Формат ответа: `{ ok: false, stage: string, message: string }`
- `stage` указывает этап, на котором произошла ошибка:
  - `validate_input` - ошибка валидации входных данных
  - `check_user` - ошибка проверки пользователя в БД
  - `get_config` - ошибка конфигурации Robokassa
  - `critical_error` - критическая ошибка

**При успехе:**
- Возвращает HTTP 200
- Формат ответа: `{ ok: true, html: string }`
- `html` содержит автоотправляемую HTML форму для Robokassa

### Frontend (Mini App `/subscription`)

**При клике "Start trial for 1 ₽":**

1. Вызывает `create-trial` endpoint
2. Сохраняет полный ответ в Debug JSON панель
3. **Если `ok=true`**: Заменяет весь document с `formHtml` (форма автоматически отправляется в Robokassa)
4. **Если `ok=false`**: Показывает ошибку + Debug JSON панель

## 📋 Структура файлов

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
│       └── SubscriptionClient.tsx      # Client component с UI
```

## 🧪 Как запустить и протестировать

### 1. Локальный запуск

```bash
cd miniapp
npm install
npm run dev
```

### 2. Тестирование в Telegram

1. **Запустите бота** (если еще не запущен):
   ```bash
   cd bot
   npm run dev
   ```

2. **Откройте Mini App в Telegram:**
   - Используйте прямую ссылку: `https://YOUR_DOMAIN.vercel.app/subscription?id=USER_ID`
   - Или через кнопку в боте (если добавлена)

3. **Нажмите "Start trial for 1 ₽"**

4. **Проверьте результат:**
   - **Успех**: Документ заменится на форму Robokassa, форма автоматически отправится
   - **Ошибка**: Покажется сообщение об ошибке + Debug JSON панель

### 3. Что проверять в Debug JSON

**При успехе:**
```json
{
  "responseStatus": 200,
  "responseData": {
    "ok": true,
    "html": "<form>...</form>"
  },
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

**При ошибке:**
```json
{
  "responseStatus": 500,
  "responseData": {
    "ok": false,
    "stage": "check_user",
    "message": "User not found. Please use /start in bot first."
  },
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

### 4. Что проверять в логах сервера

**Успешный запрос:**
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

**Ошибка:**
```
[robokassa/create-trial] ❌ [stage]: [error message]
```

## ⚠️ Важные моменты

1. **При `ok=true`**: Весь document заменяется на HTML форму
2. **При `ok=false`**: Показывается ошибка + Debug JSON (не заменяется document)
3. **Debug JSON всегда сохраняется** в state, даже при успехе
4. **HTTP статус**: 500 при ошибке, 200 при успехе

## 🎯 Цель (STOP POINT)

**Robokassa checkout page должен открыться успешно для 1 RUB.**

После подтверждения, что checkout открывается без ошибок, можно переходить к:
- Callbacks
- Database
- Recurring charges
- Cron
- Subscription state logic

## 📝 Критические требования (все выполнены)

- ✅ OutSum = "1.000000" (ровно 6 знаков)
- ✅ Receipt item sum = OutSum (1.0)
- ✅ InvoiceID уникальный каждый раз
- ✅ Receipt закодирован один раз
- ✅ Signature использует закодированный Receipt
- ✅ Recurring = true
- ✅ Password2 НЕ используется в create-trial
- ✅ При ошибке: HTTP 500 с {ok: false, stage, message}
- ✅ При успехе: document заменяется на formHtml
- ✅ Debug JSON панель показывает полный ответ

