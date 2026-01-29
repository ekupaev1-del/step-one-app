# Настройка автоматического деплоя через GitHub Actions

## ✅ Что сделано

1. ✅ Создан GitHub Actions workflow (`.github/workflows/deploy-vercel.yml`)
2. ✅ Workflow автоматически запускается при push в ветку `main`
3. ✅ Workflow деплоит в Vercel production

## 🔧 Что нужно настроить

### 1. Получить Vercel токены и ID

1. **VERCEL_TOKEN:**
   - Зайди на https://vercel.com/account/tokens
   - Нажми "Create Token"
   - Название: `GitHub Actions Deploy`
   - Scope: Full Account
   - Скопируй токен

2. **VERCEL_ORG_ID и VERCEL_PROJECT_ID:**
   - Зайди в Vercel Dashboard → Settings → General
   - Скопируй **Team ID** (это VERCEL_ORG_ID)
   - Зайди в Settings проекта → General
   - Скопируй **Project ID** (это VERCEL_PROJECT_ID)

### 2. Добавить Secrets в GitHub

1. Зайди в репозиторий: https://github.com/ekupaev1-del/step-one-app
2. Settings → Secrets and variables → Actions
3. Нажми "New repository secret"
4. Добавь следующие secrets:

   - **Name:** `VERCEL_TOKEN`
     **Value:** (токен из шага 1.1)

   - **Name:** `VERCEL_ORG_ID`
     **Value:** (Team ID из шага 1.2)

   - **Name:** `VERCEL_PROJECT_ID`
     **Value:** (Project ID из шага 1.2)

   - **Name:** `NEXT_PUBLIC_SUPABASE_URL` (опционально, для билда)
     **Value:** (твой Supabase URL)

   - **Name:** `SUPABASE_SERVICE_ROLE_KEY` (опционально, для билда)
     **Value:** (твой Supabase service role key)

### 3. Проверить, что проект подключен к Vercel

1. Зайди в Vercel Dashboard
2. Убедись, что проект `step-one-app` подключен к GitHub репозиторию
3. Если нет - подключи через Settings → Git → Connect Git Repository

## 🚀 Как это работает

1. **При push в `main`:**
   - GitHub Actions автоматически запускается
   - Устанавливает зависимости
   - Собирает проект
   - Деплоит в Vercel production

2. **Проверка деплоя:**
   - Зайди в GitHub → Actions
   - Посмотри статус последнего workflow
   - Зайди в Vercel Dashboard → Deployments
   - Убедись, что появился новый деплой

## 📝 Ручной запуск деплоя

Если нужно запустить деплой вручную:

1. GitHub → Actions → "Deploy to Vercel"
2. Нажми "Run workflow"
3. Выбери ветку `main`
4. Нажми "Run workflow"

## ⚠️ Важно

- Workflow использует secrets из GitHub, поэтому они должны быть настроены
- Если secrets не настроены, workflow упадет с ошибкой
- После настройки secrets, workflow будет работать автоматически при каждом push в `main`
