# 🚀 Быстрый деплой на Vercel

## Способ 1: Через Vercel Dashboard (Самый простой)

### Шаг 1: Подключите репозиторий
1. Зайдите на [vercel.com](https://vercel.com) и войдите
2. Нажмите **"Add New Project"**
3. Выберите ваш репозиторий `step-one-app`
4. В настройках проекта:
   - **Root Directory**: выберите `miniapp` (или оставьте корень)
   - **Framework**: Next.js (определится автоматически)

### Шаг 2: Добавьте переменные окружения
В Settings → Environment Variables добавьте:

```
NEXT_PUBLIC_SUPABASE_URL = https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (длинный ключ)
```

⚠️ **Важно**: Установите для всех окружений (Production, Preview, Development)

### Шаг 3: Деплой
Нажмите **"Deploy"** и дождитесь завершения!

---

## Способ 2: Через Vercel CLI

### Шаг 1: Установите Vercel CLI
```bash
npm install -g vercel
```

### Шаг 2: Войдите в Vercel
```bash
vercel login
```

### Шаг 3: Перейдите в папку miniapp
```bash
cd miniapp
```

### Шаг 4: Добавьте переменные окружения
```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
```

Для каждого запроса введите значение переменной.

### Шаг 5: Деплой
```bash
npm run deploy
```

Или напрямую:
```bash
vercel --prod
```

---

## Проверка после деплоя

1. ✅ Откройте URL проекта (например, `https://your-project.vercel.app`)
2. ✅ Проверьте `/api/health` или `/api/version`
3. ✅ Проверьте логи в Vercel Dashboard

---

## Что дальше?

После успешного деплоя:
1. ✅ Настройте кастомный домен (опционально)
2. ✅ Проверьте работу с Supabase
3. ✅ Протестируйте Telegram Mini App

---

## Проблемы?

См. подробную инструкцию: [VERCEL_DEPLOY.md](./VERCEL_DEPLOY.md)
