# 🚀 Автоматический деплой через Git Push

**Просто push в Git → Vercel автоматически деплоит. Без CLI, без лишних действий.**

## ⚡ Как это работает

1. Подключите репозиторий к Vercel (один раз)
2. Push в `main` → автоматический production деплой
3. Push в `dev` → автоматический preview деплой

**Всё! Больше ничего делать не нужно.**

---

## 🎯 Настройка (один раз, 5 минут)

### Шаг 1: Подключите репозиторий

1. Откройте [Vercel Dashboard](https://vercel.com/dashboard)
2. Нажмите **"Add New Project"**
3. Выберите ваш GitHub репозиторий `step-one-app`
4. Нажмите **"Import"**

### Шаг 2: Настройте проект

**ВАЖНО:** Укажите эти настройки:

- ✅ **Root Directory**: `miniapp` (обязательно!)
- ✅ **Framework Preset**: `Next.js` (определится автоматически)
- ✅ **Production Branch**: `main`
- ✅ **Preview Branches**: `dev` (или все ветки)

### Шаг 3: Добавьте переменные окружения

В разделе **Environment Variables** добавьте:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
EXPECTED_SUPABASE_PROJECT_REF=<project-ref>
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

**Важно:** Выберите окружения для каждой переменной:
- ✅ Production
- ✅ Preview
- ✅ Development

### Шаг 4: Запустите первый деплой

Нажмите **"Deploy"** → готово!

---

## ✅ Готово! Теперь просто push в Git

```bash
# Production деплой
git checkout main
git add .
git commit -m "Update app"
git push origin main
# → Vercel автоматически деплоит в production

# Preview деплой
git checkout dev
git add .
git commit -m "Update app"
git push origin dev
# → Vercel автоматически деплоит preview
```

**Всё! Больше ничего делать не нужно.**

---

## 🔍 Как проверить

1. Сделайте push в `dev`:
   ```bash
   git checkout dev
   echo "# Test" >> README.md
   git commit -m "Test deployment"
   git push origin dev
   ```

2. Проверьте Vercel Dashboard:
   - Через 1-2 минуты появится новый deployment
   - Статус будет "Ready"
   - Откройте preview URL

---

## 📊 Мониторинг

- **Vercel Dashboard → Deployments** - все деплои
- **Vercel Dashboard → Logs** - логи приложения
- **GitHub → Commits** - каждый commit автоматически деплоится

---

## 🐛 Если не работает

### Деплой не запускается:
- ✅ Проверьте, что Root Directory = `miniapp`
- ✅ Проверьте, что Production Branch = `main`
- ✅ Проверьте, что репозиторий подключен в Vercel
- ✅ Проверьте, что у Vercel есть доступ к GitHub репозиторию

### Ошибка сборки:
- ✅ Проверьте логи в Vercel Dashboard → Deployments
- ✅ Проверьте, что все переменные окружения установлены
- ✅ Проверьте, что `EXPECTED_SUPABASE_PROJECT_REF` установлен

---

## 🎉 Всё!

**Просто push в Git → Vercel автоматически деплоит. Никаких CLI, никаких лишних действий.**
