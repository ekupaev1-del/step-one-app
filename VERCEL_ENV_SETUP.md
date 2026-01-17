# Vercel Environment Variables Setup

## Критическая проблема

Если вы видите ошибку **"supabaseUrl is required"** в production, это означает, что переменные окружения не настроены в Vercel.

## Необходимые переменные окружения

### Для Production (main branch)

1. Откройте Vercel Dashboard: https://vercel.com/dashboard
2. Выберите проект `step-one-app`
3. Перейдите в **Settings** → **Environment Variables**
4. Добавьте следующие переменные для **Production** окружения:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key (если используется на клиенте)
```

### Для Preview (dev branch)

Добавьте те же переменные для **Preview** окружения.

## Как получить значения

### Supabase

1. Откройте ваш Supabase проект: https://supabase.com/dashboard
2. Перейдите в **Settings** → **API**
3. Скопируйте:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (если используется)
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ секретный ключ!)

## После добавления переменных

1. **Перезапустите деплой**:
   - Vercel Dashboard → Deployments → выберите последний деплой → **Redeploy**
   - ИЛИ сделайте новый коммит в `main` ветку

2. **Проверьте логи**:
   - Vercel Dashboard → Deployments → выберите деплой → **Logs**
   - Убедитесь, что нет ошибок о missing environment variables

3. **Проверьте приложение**:
   - Откройте Mini App через Telegram
   - Ошибка "supabaseUrl is required" должна исчезнуть

## Проверка текущих переменных

Чтобы проверить, какие переменные установлены:

1. Vercel Dashboard → Settings → Environment Variables
2. Убедитесь, что переменные установлены для правильного окружения:
   - ✅ **Production** - для `main` ветки
   - ✅ **Preview** - для `dev` ветки и PR

## Важные замечания

- ⚠️ **NEXT_PUBLIC_*** переменные доступны на клиенте (в браузере)
- 🔒 **SUPABASE_SERVICE_ROLE_KEY** - секретный ключ, НЕ должен быть в `NEXT_PUBLIC_*`
- 🔄 После изменения переменных нужно **перезапустить деплой**
- 📝 Проверьте, что переменные установлены для **Production**, а не только для Preview

