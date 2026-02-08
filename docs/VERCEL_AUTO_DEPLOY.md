# Автоматический деплой в Vercel - Быстрая настройка

## ⚡ Быстрый старт (5 минут)

### Вариант 1: Vercel Git Integration (Рекомендуется) ⭐

**Самый простой способ - автоматический деплой при каждом push.**

1. **Откройте Vercel Dashboard:**
   - https://vercel.com/dashboard
   - Нажмите **"Add New Project"**

2. **Подключите GitHub репозиторий:**
   - Выберите репозиторий `ekupaev1-del/step-one-app`
   - Нажмите **"Import"**

3. **Настройте проект:**
   - **Framework Preset:** Next.js
   - **Root Directory:** `miniapp` ⚠️ ВАЖНО!
   - **Build Command:** `npm run build` (автоматически)
   - **Output Directory:** `.next` (автоматически)
   - **Install Command:** `npm install` (автоматически)

4. **Добавьте Environment Variables:**
   - Нажмите **"Environment Variables"**
   - Добавьте каждую переменную для **Production**, **Preview**, **Development**:
   
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (service_role)
   SUPABASE_URL=https://xxxxx.supabase.co
   OPENAI_API_KEY=sk-...
   TELEGRAM_BOT_TOKEN=1234567890:ABC...
   ```

5. **Deploy!**
   - Нажмите **"Deploy"**
   - Готово! Теперь каждый push в `main` → автоматический деплой

---

### Вариант 2: GitHub Actions (Если нужен больший контроль)

**Требуется настройка GitHub Secrets.**

#### Шаг 1: Получите Vercel Credentials

1. **VERCEL_TOKEN:**
   - Vercel Dashboard → Settings → Tokens
   - Create Token → скопируйте

2. **VERCEL_ORG_ID:**
   - Vercel Dashboard → Settings → General
   - Team ID (Organization ID)

3. **VERCEL_PROJECT_ID:**
   - Vercel Dashboard → Project Settings → General
   - Project ID

#### Шаг 2: Добавьте Secrets в GitHub

GitHub Repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

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

#### Шаг 3: Workflow запустится автоматически

При каждом push в `main` → автоматический production деплой

---

## Проверка деплоя

### После настройки Git Integration:

1. Сделайте тестовый commit:
   ```bash
   git add .
   git commit -m "test: verify auto deployment"
   git push origin main
   ```

2. Проверьте Vercel Dashboard:
   - Должен появиться новый деплой
   - Статус: "Building" → "Ready"

3. Проверьте GitHub Actions (если используете):
   - GitHub → Actions tab
   - Workflow должен запуститься и завершиться успешно

---

## Структура деплоя

```
Repository
├── miniapp/              ← Деплоится на Vercel (Next.js)
│   ├── app/
│   ├── lib/
│   └── package.json
├── bot/                  ← НЕ деплоится (отдельный сервис)
├── supabase/
│   └── migrations/       ← Отслеживаются, но не деплоятся
└── .github/
    └── workflows/        ← GitHub Actions workflows
```

---

## Troubleshooting

### Деплой не запускается

**Проблема:** Изменения не триггерят деплой

**Решение:**
- Убедитесь, что Root Directory = `miniapp` в Vercel
- Проверьте, что изменения в `miniapp/` директории
- Проверьте настройки в Vercel Dashboard → Settings → Git

### Build fails

**Проблема:** Ошибка при сборке

**Решение:**
1. Проверьте логи в Vercel Dashboard
2. Убедитесь, что все Environment Variables установлены
3. Проверьте локальную сборку:
   ```bash
   cd miniapp
   npm install
   npm run build
   ```

### Environment Variables не работают

**Проблема:** Переменные окружения не доступны

**Решение:**
- `NEXT_PUBLIC_*` переменные должны быть установлены для всех окружений
- Перезапустите деплой после добавления переменных
- Убедитесь, что переменные не содержат лишних пробелов

---

## Рекомендации

1. ✅ **Используйте Vercel Git Integration** - проще и надежнее
2. ✅ **Настройте Preview Deployments** - для тестирования перед merge
3. ✅ **Используйте Environment Variables** - не коммитьте секреты
4. ✅ **Мониторьте деплои** - проверяйте логи после каждого деплоя
