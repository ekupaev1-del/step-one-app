# Исправление ошибки 29 Robokassa: Invalid SignatureValue

## Причины ошибки 29

Согласно документации Robokassa, ошибка 29 "Неверный параметр SignatureValue" возникает из-за:

1. **Неправильный MerchantLogin** - должен быть точно "steopone" (регистр важен)
2. **Неправильный Password1** - не совпадает с паролем в настройках Robokassa
3. **Несоответствие IsTest и Password1** - **КРИТИЧНО!**
   - Если `IsTest=1` (тестовый режим) → **ОБЯЗАТЕЛЬНО** использовать **ТЕСТОВЫЙ** Password1
   - Если production (без IsTest) → **ОБЯЗАТЕЛЬНО** использовать **PRODUCTION** Password1
4. **Неправильная сортировка Shp_* параметров** - должны быть в алфавитном порядке
5. **Shp_* параметры не включены в подпись** - все Shp_* должны быть в формуле подписи

## Что было исправлено в коде

1. ✅ Улучшена сортировка Shp_* параметров (используется `localeCompare` для правильной сортировки)
2. ✅ Добавлена валидация сортировки Shp_* параметров
3. ✅ Добавлено предупреждение о несоответствии Password1 и IsTest
4. ✅ Добавлена очистка значений Shp_* параметров (trim whitespace)

## Что нужно проверить в настройках

### 1. Проверьте переменные окружения в Vercel

Убедитесь, что в Vercel Dashboard → Settings → Environment Variables установлены:

**Для Production (ROBOKASSA_TEST_MODE=false):**
```
ROBOKASSA_MERCHANT_LOGIN=steopone
ROBOKASSA_PASSWORD1=<PRODUCTION Password1 из личного кабинета Robokassa>
ROBOKASSA_PASSWORD2=<PRODUCTION Password2 из личного кабинета Robokassa>
ROBOKASSA_TEST_MODE=false
```

**Для Test (ROBOKASSA_TEST_MODE=true):**
```
ROBOKASSA_MERCHANT_LOGIN=steopone
ROBOKASSA_PASSWORD1=<TEST Password1 из личного кабинета Robokassa>
ROBOKASSA_PASSWORD2=<TEST Password2 из личного кабинета Robokassa>
ROBOKASSA_TEST_MODE=true
```

### 2. Проверьте пароли в личном кабинете Robokassa

1. Зайдите в личный кабинет Robokassa: https://auth.robokassa.ru/
2. Перейдите в **Настройки** → **Технические настройки**
3. Найдите раздел **Пароли для тестирования** и **Пароли для продакшна**
4. **КРИТИЧНО**: Убедитесь, что:
   - Если `ROBOKASSA_TEST_MODE=true` → используете **Пароль #1 для тестирования**
   - Если `ROBOKASSA_TEST_MODE=false` → используете **Пароль #1 для продакшна**

### 3. Проверьте MerchantLogin

Убедитесь, что `ROBOKASSA_MERCHANT_LOGIN` точно равен `"steopone"` (без кавычек, регистр важен).

### 4. Проверьте логи после деплоя

После деплоя проверьте логи Vercel. Вы должны увидеть:

```
[robokassa] ========== ENVIRONMENT CHECK ==========
[robokassa] ROBOKASSA_MERCHANT_LOGIN: steopone
[robokassa] ROBOKASSA_TEST_MODE (parsed): true/false
[robokassa] ========== PASSWORD/TEST MODE VALIDATION ==========
[robokassa] ⚠️ CRITICAL: Ensure Password1 matches test mode!
```

## Типичные ошибки

### ❌ Ошибка: Используется тестовый Password1 в production
**Симптом:** `ROBOKASSA_TEST_MODE=false`, но используется тестовый Password1
**Решение:** Используйте PRODUCTION Password1 из личного кабинета Robokassa

### ❌ Ошибка: Используется production Password1 в тестовом режиме
**Симптом:** `ROBOKASSA_TEST_MODE=true`, но используется production Password1
**Решение:** Используйте TEST Password1 из личного кабинета Robokassa

### ❌ Ошибка: MerchantLogin не "steopone"
**Симптом:** `ROBOKASSA_MERCHANT_LOGIN` не равен "steopone"
**Решение:** Установите `ROBOKASSA_MERCHANT_LOGIN=steopone` (точно, регистр важен)

## После исправления

1. Обновите переменные окружения в Vercel
2. Перезапустите деплой (Redeploy)
3. Попробуйте создать платеж снова
4. Проверьте логи - ошибка 29 должна исчезнуть

## Дополнительная информация

Если ошибка 29 все еще возникает после всех проверок:

1. Проверьте логи Vercel на наличие предупреждений о сортировке Shp_* параметров
2. Убедитесь, что все Shp_* параметры включены в подпись
3. Проверьте, что значения Shp_* параметров не содержат лишних пробелов
4. Обратитесь в поддержку Robokassa с деталями из debug страницы

