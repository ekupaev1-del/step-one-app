# 🚀 Автоматический деплой в Vercel через Git Push

**Просто push в GitHub → автоматический деплой в Vercel. Всё!**

## ⚡ Быстрая настройка (3 минуты)

### 1. Подключите репозиторий к Vercel

1. Зайдите в [Vercel Dashboard](https://vercel.com/dashboard)
2. Нажмите **"Add New Project"**
3. Выберите ваш GitHub репозиторий `step-one-app`
4. Нажмите **"Import"**

### 2. Настройте проект

**ВАЖНО:** Укажите эти настройки:

- **Root Directory**: `miniapp` ⚠️
- **Framework**: Next.js (определится автоматически)
- **Production Branch**: `main`
- Остальное оставьте по умолчанию

### 3. Добавьте переменные окружения

В разделе **Environment Variables** добавьте:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
EXPECTED_SUPABASE_PROJECT_REF=<project-ref>
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

**Выберите окружения:** ✅ Production, ✅ Preview, ✅ Development

### 4. Нажмите "Deploy"

Готово! 🎉

---

## ✅ Всё! Теперь работает автоматически

**Просто делайте push в GitHub:**

```bash
git push origin main    # → автоматический production деплой
git push origin dev     # → автоматический preview деплой
```

**Vercel автоматически:**
- ✅ Определит изменения
- ✅ Соберёт проект
- ✅ Задеплоит новую версию
- ✅ Обновит URL

**Никаких дополнительных действий не нужно!**

---

## 🔍 Проверка

1. Сделайте тестовый push:
   ```bash
   git checkout dev
   echo "# Test" >> README.md
   git commit -m "Test auto deploy"
   git push origin dev
   ```

2. Проверьте Vercel Dashboard:
   - Должен появиться новый deployment
   - Статус "Ready" через 1-2 минуты

---

## 📊 Где смотреть деплои

- **Vercel Dashboard** → Deployments → список всех деплоев
- Каждый push создаёт новый deployment автоматически

---

## 🐛 Если не работает

### Деплой не запускается:
- ✅ Проверьте, что Root Directory = `miniapp`
- ✅ Проверьте, что Production Branch = `main`
- ✅ Проверьте, что репозиторий подключен в Vercel

### Ошибка сборки:
- ✅ Проверьте логи в Vercel Dashboard → Deployments
- ✅ Проверьте, что все переменные окружения установлены

---

## 🎉 Готово!

**Просто push в GitHub → автоматический деплой. Больше ничего не нужно!**
