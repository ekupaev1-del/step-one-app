# Настройка переменных окружения Robokassa в Vercel

## Пошаговая инструкция

### Шаг 1: Откройте Vercel Dashboard
1. Перейдите на https://vercel.com
2. Войдите в свой аккаунт
3. Выберите проект `step-one-app` (или ваш проект)

### Шаг 2: Откройте Settings → Environment Variables
1. В меню проекта нажмите **Settings**
2. В левом меню выберите **Environment Variables**

### Шаг 3: Добавьте переменные окружения

Добавьте следующие переменные **для Production** (и при необходимости для Preview/Development):

#### Обязательные переменные:

1. **ROBOKASSA_MERCHANT_LOGIN**
   - **Value**: `steopone`
   - **Environment**: ✅ Production, ✅ Preview, ✅ Development

2. **ROBOKASSA_PASSWORD1**
   - **Value**: `B2Bnpr5rjF948tbTZXSg`
   - **Environment**: ✅ Production, ✅ Preview, ✅ Development
   - ⚠️ **ВАЖНО**: Используйте **продакшн пароль** для Production, **тестовый пароль** для Preview/Development

3. **ROBOKASSA_PASSWORD2**
   - **Value**: `FCxKxmU1VgdE4V0S4Q1f`
   - **Environment**: ✅ Production, ✅ Preview, ✅ Development
   - ⚠️ **ВАЖНО**: Используйте **продакшн пароль** для Production, **тестовый пароль** для Preview/Development

4. **ROBOKASSA_TEST_MODE**
   - **Value**: `false` (для Production) или `true` (для Preview/Development)
   - **Environment**: ✅ Production (`false`), ✅ Preview (`true`), ✅ Development (`true`)

#### Опциональные переменные:

5. **ROBOKASSA_INCLUDE_RECEIPT_IN_SIGNATURE**
   - **Value**: НЕ УСТАНАВЛИВАЙТЕ (или `false`)
   - **Environment**: Не устанавливайте для Production
   - ⚠️ По умолчанию `false` - это правильно

### Шаг 4: Как добавить переменную

Для каждой переменной:

1. Нажмите кнопку **"Add New"** или **"Add"**
2. В поле **"Key"** введите название переменной (например, `ROBOKASSA_MERCHANT_LOGIN`)
3. В поле **"Value"** введите значение (например, `steopone`)
4. Выберите окружения:
   - ✅ **Production** - для продакшн деплоев
   - ✅ **Preview** - для preview деплоев (опционально)
   - ✅ **Development** - для локальной разработки (опционально)
5. Нажмите **"Save"**

### Шаг 5: Применить изменения

После добавления всех переменных:

1. Перейдите в раздел **Deployments**
2. Найдите последний деплой
3. Нажмите на **три точки (⋯)** справа от деплоя
4. Выберите **"Redeploy"**
5. Или создайте новый деплой через Git push

⚠️ **ВАЖНО**: После изменения переменных окружения нужно **перезапустить деплой**, чтобы изменения вступили в силу!

## Проверка переменных

После добавления переменных проверьте:

1. Все переменные должны быть видны в списке
2. Значения должны быть правильными (без лишних пробелов)
3. Окружения (Production/Preview/Development) должны быть выбраны правильно

## Пример заполнения

```
Key: ROBOKASSA_MERCHANT_LOGIN
Value: steopone
Environments: ✅ Production ✅ Preview ✅ Development

Key: ROBOKASSA_PASSWORD1
Value: B2Bnpr5rjF948tbTZXSg
Environments: ✅ Production ✅ Preview ✅ Development

Key: ROBOKASSA_PASSWORD2
Value: FCxKxmU1VgdE4V0S4Q1f
Environments: ✅ Production ✅ Preview ✅ Development

Key: ROBOKASSA_TEST_MODE
Value: false
Environments: ✅ Production

Key: ROBOKASSA_TEST_MODE
Value: true
Environments: ✅ Preview ✅ Development
```

## Безопасность

⚠️ **ВАЖНО**: 
- Никогда не коммитьте пароли в Git
- Не делитесь паролями в чатах/сообщениях
- Используйте разные пароли для Production и Test окружений
- Регулярно обновляйте пароли в Robokassa кабинете

## Проверка после настройки

После настройки переменных проверьте через API:

```bash
curl https://ваш-домен.vercel.app/api/robokassa/debug-signature
```

Должен вернуть:
```json
{
  "ok": true,
  "variant": "without-receipt",
  "merchantLogin": "steopone",
  "isTest": false
}
```

