# 🚀 Автоматический деплой через GitHub Actions

Я создал GitHub Actions workflow для автоматического деплоя на Vercel при каждом push в репозиторий.

## ✅ Что уже сделано

1. ✅ Создан workflow файл: `.github/workflows/deploy-vercel.yml`
2. ✅ Настроен автоматический деплой при push в `main`/`master`
3. ✅ Настроен ручной запуск через GitHub Actions

## 🔧 Что нужно настроить (один раз)

### Шаг 1: Получите токены из Vercel

1. Зайдите на https://vercel.com/account/tokens
2. Создайте новый токен (Token Name: `github-actions`)
3. Скопируйте токен

### Шаг 2: Получите ID проекта и организации

**Вариант A: Через Vercel CLI (если работает)**
```bash
cd miniapp
vercel link
# После связывания проверьте файл .vercel/project.json
```

**Вариант B: Через Vercel Dashboard**
1. Зайдите в ваш проект на Vercel
2. Settings → General
3. Скопируйте:
   - **Project ID** (в разделе Project ID)
   - **Team ID** или **Org ID** (в URL или в настройках команды)

### Шаг 3: Добавьте Secrets в GitHub

1. Зайдите в ваш GitHub репозиторий
2. Settings → Secrets and variables → Actions
3. Добавьте следующие secrets:

| Secret Name | Значение | Где взять |
|------------|----------|-----------|
| `VERCEL_TOKEN` | Токен из шага 1 | Vercel → Account → Tokens |
| `VERCEL_ORG_ID` | ID организации | Vercel Dashboard → Settings |
| `VERCEL_PROJECT_ID` | ID проекта | Vercel Dashboard → Project Settings |
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase | Supabase Dashboard |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon ключ | Supabase Dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role ключ | Supabase Dashboard |

### Шаг 4: Push в репозиторий

```bash
git add .github/workflows/deploy-vercel.yml
git commit -m "Add automatic Vercel deployment"
git push
```

После push GitHub Actions автоматически запустит деплой!

## 🎯 Как это работает

1. При каждом push в ветку `main`/`master` запускается workflow
2. GitHub Actions устанавливает зависимости
3. Собирает проект
4. Деплоит на Vercel production

## ✅ Проверка

После push:
1. Зайдите в GitHub → Actions
2. Увидите запущенный workflow "Deploy to Vercel"
3. Дождитесь завершения (обычно 2-3 минуты)
4. Проверьте ваш проект на Vercel

## 🔄 Ручной запуск

Можно запустить вручную:
1. GitHub → Actions
2. Выберите "Deploy to Vercel"
3. Нажмите "Run workflow"

## 🐛 Troubleshooting

### Ошибка: "VERCEL_TOKEN not found"
- Проверьте, что добавили все secrets в GitHub

### Ошибка: "Project not found"
- Проверьте VERCEL_PROJECT_ID и VERCEL_ORG_ID

### Ошибка: "Build failed"
- Проверьте логи в GitHub Actions
- Убедитесь, что все переменные окружения добавлены

## 📝 Альтернатива: Простой способ

Если GitHub Actions не подходит, используйте встроенную интеграцию Vercel:

1. Зайдите на https://vercel.com/new
2. Подключите GitHub репозиторий
3. Настройте:
   - Root Directory: `miniapp`
   - Добавьте переменные окружения
4. Deploy

После этого Vercel будет автоматически деплоить при каждом push!
