# ⚡ Быстрая настройка автоматического деплоя

## 🎯 Что нужно сделать (5 минут)

### 1. Добавить Secrets в GitHub

**GitHub → Settings → Secrets and variables → Actions → New repository secret**

#### Минимум для работы:

**Vercel (для MiniApp):**
- `VERCEL_TOKEN` - получить в Vercel Dashboard → Settings → Tokens
- `VERCEL_ORG_ID` - в Vercel Dashboard → Settings → General
- `VERCEL_PROJECT_ID` - в Vercel Dashboard → Settings → General

**Supabase (для обоих):**
- `SUPABASE_URL` - ваш Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY` - service role ключ
- `EXPECTED_SUPABASE_PROJECT_REF` - project ref (например, `ipgxnqplwzptxyfjjssrr`)
- `NEXT_PUBLIC_SUPABASE_URL` - тот же URL (для miniapp)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - anon ключ

**Сервер (для Bot):**
- `BOT_SERVER_HOST` - IP или домен сервера
- `BOT_SERVER_USER` - SSH пользователь (например, `root`)
- `BOT_SERVER_SSH_KEY` - приватный SSH ключ (см. ниже)
- `BOT_SERVER_PATH` - путь к проекту (например, `/var/www/step-one-app`)

### 2. Создать SSH ключ для сервера

```bash
# Сгенерировать ключ
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github-actions

# Скопировать на сервер
ssh-copy-id -i ~/.ssh/github-actions.pub user@your-server

# Скопировать приватный ключ в GitHub Secrets
cat ~/.ssh/github-actions
# Скопируйте ВСЁ (включая BEGIN/END) в BOT_SERVER_SSH_KEY
```

### 3. Готово! 🎉

Теперь при каждом push в `main` или `dev`:
- ✅ MiniApp автоматически деплоится на Vercel
- ✅ Bot автоматически деплоится на сервер

## 📋 Проверка

1. Сделайте тестовый push в `dev` ветку
2. Проверьте GitHub → Actions → должны увидеть запущенные workflows
3. Проверьте Vercel Dashboard → должен быть новый деплой
4. Проверьте сервер: `pm2 status step-one-bot`

## ❓ Проблемы?

Смотрите подробную инструкцию: `AUTO_DEPLOY_SETUP.md`
