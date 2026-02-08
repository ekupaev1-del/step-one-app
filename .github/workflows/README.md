# GitHub Actions Workflows

## Доступные Workflows

### 1. `vercel-deploy-simple.yml` ⭐ (Рекомендуется)

**Упрощенный workflow для деплоя в Vercel**

- ✅ Автоматический деплой при push в `main`/`master`
- ✅ Preview деплои для Pull Requests
- ✅ Использует официальный Vercel Action
- ✅ Простая настройка

**Требуемые Secrets:**
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- Environment variables для build

### 2. `vercel-deploy.yml`

**Расширенный workflow с дополнительными возможностями**

- ✅ Все возможности простого workflow
- ✅ Комментарии в PR с preview URL
- ✅ Более детальное логирование

### 3. `deploy-vercel.yml` (Legacy)

**Устаревший workflow - используйте `vercel-deploy-simple.yml`**

---

## Настройка

### Шаг 1: Получите Vercel Credentials

1. **VERCEL_TOKEN:**
   - Vercel Dashboard → Settings → Tokens
   - Create Token → скопируйте токен

2. **VERCEL_ORG_ID:**
   - Vercel Dashboard → Settings → General
   - Team ID (Organization ID)

3. **VERCEL_PROJECT_ID:**
   - Vercel Dashboard → Project Settings → General
   - Project ID

### Шаг 2: Добавьте Secrets в GitHub

GitHub Repository → Settings → Secrets and variables → Actions → New repository secret

Добавьте:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`
- `OPENAI_API_KEY`
- `TELEGRAM_BOT_TOKEN`

### Шаг 3: Активируйте Workflow

Workflow автоматически активируется при:
- Push в `main`/`master` (production деплой)
- Pull Request (preview деплой)
- Manual trigger через GitHub Actions UI

---

## Альтернатива: Vercel Git Integration

**Рекомендуется использовать Vercel Git Integration вместо GitHub Actions:**

1. Vercel Dashboard → Add New Project
2. Подключите GitHub репозиторий
3. Настройте Root Directory: `miniapp`
4. Добавьте Environment Variables
5. Готово! Автоматический деплой при каждом push

Подробнее: см. `VERCEL_DEPLOYMENT_SETUP.md`
