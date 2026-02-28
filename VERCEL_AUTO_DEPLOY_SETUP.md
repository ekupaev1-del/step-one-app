# ✅ Настройка автоматического деплоя на Vercel

## Текущий статус

✅ **Код исправлен:** Все ошибки сборки устранены
✅ **GitHub Actions:** Удалены workflows, которые деплоили в Vercel
✅ **Изменения запушены:** commit `38eb8b8` в ветку `main`
✅ **Vercel Git Integration:** Должен работать автоматически

---

## Проверка настроек Vercel

### 1. Vercel Dashboard → Project → Settings → General

**Откройте:** https://vercel.com/dashboard → выберите проект → Settings → General

**Проверьте:**
- ✅ **Root Directory:** `miniapp` (обязательно для монорепозитория)
- ✅ **Framework Preset:** Next.js
- ✅ **Build Command:** Можно оставить пустым (используется `vercel.json`) или `cd miniapp && npm install && npm run build`
- ✅ **Output Directory:** Можно оставить пустым (используется `vercel.json`) или `miniapp/.next`
- ✅ **Install Command:** Можно оставить пустым (используется `vercel.json`) или `cd miniapp && npm install`

---

### 2. Vercel Dashboard → Project → Settings → Git

**Откройте:** Settings → Git (tab)

**Проверьте:**
- ✅ **Production Branch:** `main` (должно совпадать с вашей веткой)
- ✅ **Connected Repository:** Должно показывать `ekupaev1-del/step-one-app`
- ✅ **Ignored Build Step:** ⚠️ **ДОЛЖНО БЫТЬ ПУСТЫМ** - если там есть команда, удалите её!
- ✅ **Auto-assign Custom Domain:** Опционально
- ✅ **Deployment Protection:** Должно быть отключено для автоматических деплоев

**Если репозиторий НЕ подключен:**
1. Нажмите "Connect Repository"
2. Выберите `ekupaev1-del/step-one-app`
3. Установите Root Directory: `miniapp`
4. Установите Production Branch: `main`
5. Нажмите "Connect"

---

### 3. GitHub → Repository → Settings → Webhooks

**Откройте:** https://github.com/ekupaev1-del/step-one-app/settings/hooks

**Проверьте:**
- ✅ Должен быть webhook с URL, содержащим `vercel.com` или `vercel.app`
- ✅ Статус: **Active** (зеленая галочка)
- ✅ События: Должен включать **push**

**Проверка Recent Deliveries:**
1. Кликните на webhook Vercel
2. Перейдите на вкладку "Recent Deliveries"
3. Должны быть недавние события push
4. Статус должен быть `200` (успех)
5. Если видите `4xx` или `5xx` ошибки → webhook сломан, нужно переподключить в Vercel

---

### 4. GitHub → Repository → Settings → Integrations → GitHub Apps

**Откройте:** https://github.com/ekupaev1-del/step-one-app/settings/installations

**Проверьте:**
- ✅ Должно быть установлено приложение **Vercel**
- ✅ Должен быть доступ к репозиторию `ekupaev1-del/step-one-app`
- ✅ Права должны включать:
  - ✅ Contents: Read
  - ✅ Metadata: Read
  - ✅ Pull requests: Read & Write

**Если приложение Vercel НЕ установлено:**
- Переподключите Git в Vercel (шаг 2 выше)
- Это автоматически установит GitHub App

---

## Переменные окружения в Vercel

**Откройте:** Vercel Dashboard → Project → Settings → Environment Variables

**Убедитесь, что установлены для Production и Preview:**

- `NEXT_PUBLIC_SUPABASE_URL` - URL проекта Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Anon ключ Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Service role ключ Supabase
- `SUPABASE_URL` - (опционально, fallback на NEXT_PUBLIC_SUPABASE_URL)

**Если переменных нет:**
1. Добавьте каждую переменную
2. Выберите окружения: **Production**, **Preview** (и **Development** если нужно)
3. Сохраните

---

## Тестирование автоматического деплоя

### Вариант 1: Проверка текущего push

После последнего push (`38eb8b8`) Vercel должен был автоматически создать деплой.

**Проверьте:**
1. Откройте: https://vercel.com/dashboard → ваш проект → Deployments
2. Должен быть новый деплой с коммитом `38eb8b8`
3. Статус: Building → Ready (или Error, но деплой ДОЛЖЕН появиться)

### Вариант 2: Создать тестовый коммит

Если деплой не появился, создайте тестовый коммит:

```bash
cd step-one-app/step-one-app
echo "# Test auto-deploy $(date)" >> README.md
git add README.md
git commit -m "Test: trigger Vercel auto-deploy"
git push origin main
```

**Ожидаемый результат:**
- В течение 30-60 секунд в Vercel Dashboard → Deployments появится новый деплой
- Источник: GitHub
- Ветка: `main`
- Коммит: ваш тестовый коммит

---

## Если деплой не появляется автоматически

### Проблема 1: Root Directory не установлен

**Симптом:** Деплои не появляются или падают с ошибкой "Cannot find module"

**Решение:**
- Vercel Dashboard → Settings → General → Root Directory: `miniapp`

### Проблема 2: Ignored Build Step блокирует деплои

**Симптом:** Деплои не запускаются

**Решение:**
- Vercel Dashboard → Settings → Git → Ignored Build Step: **ОСТАВЬТЕ ПУСТЫМ**

### Проблема 3: Webhook не работает

**Симптом:** Push в GitHub не создает деплои

**Решение:**
1. Vercel Dashboard → Settings → Git → Disconnect
2. Connect Repository → выберите `ekupaev1-del/step-one-app`
3. Установите Root Directory: `miniapp`
4. Установите Production Branch: `main`
5. Connect

### Проблема 4: Production Branch не совпадает

**Симптом:** Деплои создаются, но не для production

**Решение:**
- Vercel Dashboard → Settings → Git → Production Branch: `main` (должно совпадать с вашей веткой)

---

## Текущая конфигурация проекта

**Repository:** `ekupaev1-del/step-one-app`
**Branch:** `main`
**Root Directory:** `miniapp` (монорепозиторий)
**Build Command:** `cd miniapp && npm install && npm run build` (из vercel.json)
**Output Directory:** `miniapp/.next` (из vercel.json)

**Файл `vercel.json`:**
```json
{
  "buildCommand": "cd miniapp && npm install && npm run build",
  "outputDirectory": "miniapp/.next",
  "framework": "nextjs",
  "installCommand": "cd miniapp && npm install",
  "devCommand": "cd miniapp && npm run dev",
  "rootDirectory": "miniapp"
}
```

---

## Итоговая проверка

✅ **Код:** Все ошибки исправлены, сборка проходит
✅ **Git:** Изменения запушены в `main`
✅ **Vercel Settings:** Root Directory = `miniapp`, Production Branch = `main`
✅ **GitHub Integration:** Webhook активен, GitHub App установлен
✅ **Environment Variables:** Установлены в Vercel

**После проверки всех пунктов выше, автоматический деплой должен работать!**

---

## Следующие шаги

1. Проверьте Vercel Dashboard → Deployments (должен быть деплой из последнего push)
2. Если деплоя нет → проверьте настройки по чеклисту выше
3. Создайте тестовый коммит для проверки автоматического деплоя
4. После успешного деплоя, все последующие push в `main` будут автоматически деплоиться
