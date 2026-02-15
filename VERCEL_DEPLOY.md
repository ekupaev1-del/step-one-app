# Автоматический деплой в Vercel

## ✅ Изменения запушены в GitHub

Коммит: `1811c49` - "Fix MiniApp auth/onboarding flow..."

## 🔧 Настройка автоматического деплоя

### 1. Подключение проекта к Vercel (если еще не подключен)

1. Откройте [Vercel Dashboard](https://vercel.com/dashboard)
2. Нажмите **"Add New Project"**
3. Выберите репозиторий `ekupaev1-del/step-one-app`
4. Vercel автоматически определит Next.js проект

### 2. Настройка проекта в Vercel

**Root Directory:** `miniapp` (уже указано в `vercel.json`)

**Build Settings:**
- Framework Preset: `Next.js`
- Root Directory: `miniapp`
- Build Command: `cd miniapp && npm install && npm run build` (уже в `vercel.json`)
- Output Directory: `miniapp/.next` (уже в `vercel.json`)

### 3. Переменные окружения в Vercel

Убедитесь, что в Vercel Dashboard → Settings → Environment Variables настроены:

**Для Production:**
- `NEXT_PUBLIC_SUPABASE_URL` = `https://ipgxnqplwzptxyfjjsrr.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- `SUPABASE_URL` = `https://ipgxnqplwzptxyfjjsrr.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- `TELEGRAM_BOT_TOKEN` = (ваш токен бота)

**Для Preview/Development:**
- Те же переменные (или используйте другие ключи для тестирования)

### 4. Автоматический деплой

После подключения проекта:
- ✅ **Push в `main` ветку** → автоматический деплой в Production
- ✅ **Push в другие ветки** → автоматический Preview деплой
- ✅ **Pull Request** → автоматический Preview деплой

### 5. Проверка деплоя

1. Откройте Vercel Dashboard → Deployments
2. Найдите последний деплой (должен быть автоматически создан после push)
3. Проверьте логи сборки
4. После успешного деплоя получите URL приложения

### 6. Cron Jobs

В `vercel.json` настроен cron job:
```json
{
  "crons": [
    {
      "path": "/api/cron/subscription/charge",
      "schedule": "0 2 * * *"
    }
  ]
}
```

Это автоматически создаст cron job в Vercel для ежедневной проверки подписок в 02:00 UTC.

## 📝 Текущий статус

- ✅ Изменения закоммичены и запушены в `main`
- ✅ `vercel.json` настроен для монорепо
- ⏳ Ожидается автоматический деплой (если проект подключен)

## 🔍 Проверка

Если деплой не начался автоматически:
1. Проверьте, подключен ли проект к Vercel
2. Проверьте логи в Vercel Dashboard
3. Убедитесь, что все переменные окружения настроены
