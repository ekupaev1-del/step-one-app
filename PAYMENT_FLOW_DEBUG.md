# Payment Flow Debug Guide

## Что было исправлено

### 1. Клиентская часть (`app/profile/page.tsx`)
- ✅ Добавлено логирование клика: `console.log("[profile] PAY_CLICK", { userId })`
- ✅ Использование `Telegram.WebApp.openLink()` для открытия ссылки на оплату в Telegram WebApp
- ✅ Fallback на `window.location.href` для браузера
- ✅ Улучшен UI feedback: spinner при загрузке, явные сообщения об ошибках
- ✅ Обработка параметров `?payment=success` и `?payment=failed` после редиректа

### 2. Серверная часть (`app/api/payments/start/route.ts`)
- ✅ Улучшено логирование с requestId для отслеживания запросов
- ✅ Логирование signature string (masked), signature checks
- ✅ Логирование всех этапов создания платежа

### 3. Robokassa URL генерация (`lib/robokassa.ts`)
- ✅ Добавлены `SuccessURL` и `FailURL` параметры в payment URL
- ✅ Автоматическое определение BASE_URL из VERCEL_URL

### 4. Обработчики редиректов
- ✅ `app/api/robokassa/success/route.ts` - обработка успешной оплаты
- ✅ `app/api/robokassa/fail/route.ts` - обработка неудачной оплаты
- ✅ `app/api/robokassa/result/route.ts` - webhook от Robokassa (уже существовал)

## Чеклист для тестирования после деплоя

### Шаг 1: Проверка клика
- [ ] Открыть Mini App в Telegram
- [ ] Перейти в "Личный кабинет"
- [ ] Нажать кнопку "Оформить подписку — 1 ₽ за 3 дня, затем 199 ₽"
- [ ] Проверить в консоли браузера (DevTools): должно появиться `[profile] PAY_CLICK`
- [ ] Кнопка должна показать спиннер "Обработка..."

### Шаг 2: Проверка запроса к API
- [ ] В DevTools -> Network найти запрос `POST /api/payments/start`
- [ ] Проверить статус ответа: должен быть `200 OK`
- [ ] Проверить body ответа: должен содержать `{ ok: true, paymentUrl: "...", invoiceId: "..." }`
- [ ] Проверить Vercel logs: должны быть логи `[payments/start:...]` с requestId

### Шаг 3: Проверка открытия ссылки
- [ ] После успешного ответа должна открыться страница Robokassa
- [ ] В консоли должно быть: `[profile] PAY_CLICK: opened via Telegram WebApp.openLink` или `using window.location.href fallback`
- [ ] Если ничего не открылось:
  - Проверить консоль на ошибки
  - Проверить, что `paymentUrl` не пустой
  - Проверить, что `window.Telegram?.WebApp?.openLink` доступен

### Шаг 4: Проверка оплаты
- [ ] На странице Robokassa ввести тестовые данные (если тестовый режим)
- [ ] Завершить оплату
- [ ] После оплаты должен произойти редирект на `/api/robokassa/success`
- [ ] Затем редирект на `/profile?id=...&payment=success`
- [ ] На странице профиля должно быть видно, что оплата прошла успешно

### Шаг 5: Проверка webhook
- [ ] Проверить Vercel logs: должен быть запрос `POST /api/robokassa/result`
- [ ] Проверить, что signature верифицирован: `[robokassa/result] Signature verified successfully`
- [ ] Проверить Supabase: в таблице `users` должно обновиться:
  - `last_payment_at` = текущая дата
  - `subscription_status` = "trial" (уже установлено при создании платежа)
  - `trial_end_at` = now() + 3 days

### Шаг 6: Проверка ошибок
- [ ] Если оплата отменена: должен быть редирект на `/api/robokassa/fail`
- [ ] Затем редирект на `/profile?id=...&payment=failed`
- [ ] На странице профиля должно быть сообщение об ошибке

## Диагностика проблем

### Проблема: "Кнопка кликабельна, но ничего не происходит"

**Проверка 1: Логи клика**
```javascript
// В консоли браузера должно быть:
[profile] PAY_CLICK { userId: 123, timestamp: "..." }
```
Если нет - обработчик не привязан или userId отсутствует.

**Проверка 2: Сетевой запрос**
```javascript
// В DevTools -> Network должен быть запрос:
POST /api/payments/start
Status: 200 OK
Response: { ok: true, paymentUrl: "https://..." }
```
Если нет - проверить:
- Endpoint существует: `/api/payments/start/route.ts`
- Метод POST поддерживается
- userId передается в body

**Проверка 3: Открытие ссылки**
```javascript
// В консоли должно быть:
[profile] PAY_CLICK: opening payment URL { hasTelegram: true/false }
[profile] PAY_CLICK: opened via Telegram WebApp.openLink
// или
[profile] PAY_CLICK: using window.location.href fallback
```
Если нет - проверить:
- `paymentUrl` не пустой
- `window.Telegram?.WebApp?.openLink` доступен (в Telegram)
- Нет блокировки popup в браузере

### Проблема: "Ошибка 29: SignatureValue mismatch"

**Причина:** Неправильная подпись в запросе к Robokassa.

**Проверка:**
1. В Vercel logs найти `[payments/start:...] Signature string (masked)`
2. Проверить формат: `MerchantLogin:OutSum:InvId:[PASSWORD1_HIDDEN]:Shp_userId=...`
3. Проверить, что все параметры в правильном порядке
4. Проверить, что `ROBOKASSA_PASSWORD1` установлен в Vercel env vars

### Проблема: "Webhook не вызывается"

**Проверка:**
1. В настройках Robokassa должен быть указан ResultURL: `https://your-domain.com/api/robokassa/result`
2. Проверить Vercel logs на наличие запросов `POST /api/robokassa/result`
3. Проверить, что Robokassa может достучаться до вашего сервера (нет firewall блокировки)

## Environment Variables (Vercel)

Убедитесь, что установлены:
- `ROBOKASSA_MERCHANT_LOGIN` - логин мерчанта
- `ROBOKASSA_PASSWORD1` - пароль #1 для генерации подписи
- `ROBOKASSA_PASSWORD2` - пароль #2 для верификации webhook
- `NEXT_PUBLIC_SUPABASE_URL` - URL Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - ключ Supabase
- `VERCEL_URL` - автоматически устанавливается Vercel

## Настройка Robokassa

В личном кабинете Robokassa должны быть настроены:
1. **Result URL:** `https://your-domain.com/api/robokassa/result`
2. **Success URL:** (опционально, мы используем параметр в URL)
3. **Fail URL:** (опционально, мы используем параметр в URL)

## Логи для отладки

Все логи имеют префиксы:
- `[profile] PAY_CLICK` - клиентские логи
- `[payments/start:...]` - серверные логи создания платежа
- `[robokassa/result]` - логи webhook
- `[robokassa/success]` - логи успешного редиректа
- `[robokassa/fail]` - логи неудачного редиректа

Используйте эти префиксы для фильтрации в Vercel logs.
