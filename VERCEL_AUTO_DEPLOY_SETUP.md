# Настройка автоматического деплоя в Vercel

## Текущий статус

✅ Автоматический деплой уже настроен через GitHub Actions!

Workflow файл: `.github/workflows/vercel-deploy.yml`

## Как это работает

1. При каждом push в `main` → автоматический production деплой
2. При создании PR → автоматический preview деплой
3. Можно запустить вручную через GitHub Actions → Run workflow

## Что нужно настроить (если еще не настроено)

### Шаг 1: Получите Vercel Credentials

1. **VERCEL_TOKEN:**
   - Откройте https://vercel.com/account/tokens
   - Нажмите "Create Token"
   - Скопируйте токен

2. **VERCEL_ORG_ID:**
   - Откройте https://vercel.com/dashboard
   - Settings → General
   - Team ID (Organization ID)

3. **VERCEL_PROJECT_ID:**
   - Откройте ваш проект в Vercel
   - Settings → General
   - Project ID

### Шаг 2: Добавьте Secrets в GitHub

1. Откройте ваш GitHub репозиторий
2. Перейдите в **Settings** → **Secrets and variables** → **Actions**
3. Нажмите **New repository secret**
4. Добавьте каждый secret:

| Secret Name | Значение |
|------------|----------|
| `VERCEL_TOKEN` | Токен из Vercel (шаг 1.1) |
| `VERCEL_ORG_ID` | Team ID из Vercel (шаг 1.2) |
| `VERCEL_PROJECT_ID` | Project ID из Vercel (шаг 1.3) |
| `NEXT_PUBLIC_SUPABASE_URL` | URL вашего Supabase проекта |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key из Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key из Supabase |
| `SUPABASE_URL` | URL вашего Supabase проекта (тот же что NEXT_PUBLIC_SUPABASE_URL) |
| `OPENAI_API_KEY` | Ваш OpenAI API ключ |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram бота |

### Шаг 3: Проверьте деплой

1. Сделайте любой commit и push в `main`:
   ```bash
   git add .
   git commit -m "test: trigger deployment"
   git push origin main
   ```

2. Проверьте GitHub Actions:
   - Откройте GitHub → **Actions** tab
   - Должен запуститься workflow "Deploy to Vercel"
   - Дождитесь завершения (зеленая галочка)

3. Проверьте Vercel:
   - Откройте Vercel Dashboard → **Deployments**
   - Должен появиться новый деплой
   - Статус: "Ready" (зеленый)

## Альтернатива: Vercel Git Integration (проще)

Если не хотите настраивать GitHub Actions, используйте встроенную интеграцию Vercel:

1. Откройте https://vercel.com/dashboard
2. Нажмите **Add New Project**
3. Выберите ваш GitHub репозиторий
4. Настройте:
   - **Framework Preset**: Next.js
   - **Root Directory**: `miniapp`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
5. Добавьте Environment Variables (Settings → Environment Variables)
6. Нажмите **Deploy**

После этого каждый push в `main` будет автоматически деплоиться через Vercel (без GitHub Actions).

## Проверка работы

### После настройки:

1. **GitHub Actions** (если используете):
   - GitHub → Actions → должен быть запущен workflow
   - Статус: ✅ Success

2. **Vercel Dashboard**:
   - Deployments → должен быть новый деплой
   - Статус: ✅ Ready

3. **Приложение**:
   - Откройте URL из Vercel
   - Должно работать без ошибок

## Troubleshooting

### Workflow не запускается

**Проблема**: GitHub Actions не запускается при push

**Решение**:
- Проверьте что файл `.github/workflows/vercel-deploy.yml` существует
- Проверьте что вы пушите в `main` branch
- Проверьте что изменения в `miniapp/` директории (workflow триггерится только при изменениях в miniapp)

### Деплой падает с ошибкой "Missing environment variables"

**Проблема**: Не хватает переменных окружения

**Решение**:
- Проверьте что все secrets добавлены в GitHub (Settings → Secrets and variables → Actions)
- Проверьте что названия secrets точно совпадают (чувствительны к регистру)

### Деплой падает с ошибкой "Invalid Vercel token"

**Проблема**: Неправильный VERCEL_TOKEN

**Решение**:
- Создайте новый токен в Vercel
- Обновите secret `VERCEL_TOKEN` в GitHub

## Итог

✅ Автоматический деплой настроен  
✅ При push в `main` → автоматический production деплой  
✅ При PR → автоматический preview деплой  
✅ Можно запускать вручную через GitHub Actions

Просто добавьте secrets в GitHub (если еще не добавлены) и все будет работать автоматически!
