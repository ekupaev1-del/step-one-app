# 🚀 Автоматический деплой в Vercel

## Быстрая настройка (один раз)

### 1. Подключите GitHub репозиторий к Vercel

1. Откройте [Vercel Dashboard](https://vercel.com/dashboard)
2. Нажмите **"Add New Project"**
3. Выберите ваш GitHub репозиторий `step-one-app`
4. Нажмите **"Import"**

### 2. Настройте проект

**ВАЖНО:** Укажите эти настройки:

- **Root Directory**: `miniapp` ⚠️
- **Framework**: Next.js (определится автоматически)
- **Production Branch**: `main`
- **Build Command**: `cd miniapp && npm install && npm run build` (уже настроено в vercel.json)
- **Output Directory**: `miniapp/.next` (уже настроено в vercel.json)

### 3. Добавьте переменные окружения

В разделе **Settings → Environment Variables** добавьте:

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

## ✅ Автоматический деплой работает!

**Теперь просто делайте push в GitHub:**

```bash
git push origin main    # → автоматический production деплой
git push origin dev     # → автоматический preview деплой
git push origin feature # → автоматический preview деплой
```

**Vercel автоматически:**
- ✅ Определит изменения в Git
- ✅ Запустит сборку проекта
- ✅ Задеплоит новую версию
- ✅ Обновит URL (production или preview)

**Никаких дополнительных действий не нужно!**

---

## 📊 Мониторинг деплоев

- **Vercel Dashboard** → **Deployments** → список всех деплоев
- Каждый push создаёт новый deployment автоматически
- Preview деплои доступны по уникальным URL
- Production деплои обновляют основной домен

---

## 🔧 Настройки в vercel.json

Конфигурация уже настроена в `vercel.json`:

```json
{
  "rootDirectory": "miniapp",
  "buildCommand": "cd miniapp && npm install && npm run build",
  "outputDirectory": "miniapp/.next",
  "framework": "nextjs"
}
```

**Примечание:** Vercel автоматически деплоит при push в Git по умолчанию, когда проект подключен через GitHub/GitLab/Bitbucket.

---

## 🐛 Решение проблем

### Деплой не запускается:
- ✅ Проверьте, что Root Directory = `miniapp` в настройках проекта
- ✅ Проверьте, что репозиторий подключен в Vercel
- ✅ Проверьте, что есть push в Git (Vercel реагирует на push)

### Ошибка сборки:
- ✅ Проверьте логи в **Vercel Dashboard → Deployments → [выберите деплой] → Build Logs**
- ✅ Проверьте, что все переменные окружения установлены
- ✅ Проверьте, что `package.json` содержит правильные скрипты

### Переменные окружения не работают:
- ✅ Убедитесь, что переменные добавлены для всех окружений (Production, Preview, Development)
- ✅ Перезапустите деплой после добавления переменных

---

## 🎉 Готово!

**Просто push в GitHub → автоматический деплой. Больше ничего не нужно!**
