# 🚀 Настройка автоматического деплоя

Автоматический деплой настроен через GitHub Actions. При каждом push в `main` или `dev` ветки автоматически деплоятся оба приложения.

## 📋 Что настроено

### ✅ MiniApp → Vercel
- Автоматический деплой при push в `main` (production) или `dev` (preview)
- Сборка и проверка перед деплоем
- Использует Vercel CLI для деплоя

### ✅ Bot → Server
- Автоматический деплой при push в `main` или `dev`
- Подключение к серверу через SSH
- Автоматический перезапуск через PM2

### ✅ CI/CD
- Автоматическая проверка кода (lint, type-check, build)
- Запускается на каждом PR и push

## 🔧 Настройка (один раз)

### 1. Настройка GitHub Secrets

Перейдите в **GitHub Repository → Settings → Secrets and variables → Actions** и добавьте:

#### Для MiniApp (Vercel):
```
VERCEL_TOKEN=<ваш-vercel-token>
VERCEL_ORG_ID=<ваш-org-id>
VERCEL_PROJECT_ID=<ваш-project-id>
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
EXPECTED_SUPABASE_PROJECT_REF=<project-ref>
```

#### Для Bot (Server):
```
BOT_SERVER_HOST=<ip-или-домен-сервера>
BOT_SERVER_USER=<ssh-пользователь>
BOT_SERVER_SSH_KEY=<приватный-ssh-ключ>
BOT_SERVER_PORT=22  # опционально
BOT_SERVER_PATH=/path/to/step-one-app
```

### 2. Как получить Vercel credentials

1. Зайдите в [Vercel Dashboard](https://vercel.com/dashboard)
2. **Settings → Tokens** → Create Token → скопируйте в `VERCEL_TOKEN`
3. **Settings → General**:
   - Organization ID → `VERCEL_ORG_ID`
   - Project ID → `VERCEL_PROJECT_ID`

### 3. Как настроить SSH ключ для сервера

1. Сгенерируйте SSH ключ (если нет):
   ```bash
   ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github-actions
   ```

2. Скопируйте публичный ключ на сервер:
   ```bash
   ssh-copy-id -i ~/.ssh/github-actions.pub user@your-server
   ```

3. Скопируйте приватный ключ в GitHub Secrets:
   ```bash
   cat ~/.ssh/github-actions
   ```
   Вставьте **весь вывод** (включая `-----BEGIN OPENSSH PRIVATE KEY-----` и `-----END OPENSSH PRIVATE KEY-----`) в `BOT_SERVER_SSH_KEY`

### 4. Настройка сервера для Bot

На сервере должен быть установлен:
- Node.js 20+
- PM2 (`npm install -g pm2`)
- Git
- Проект должен быть клонирован в `BOT_SERVER_PATH`

Создайте `.env` файл в `bot/` на сервере с необходимыми переменными.

## 🎯 Как это работает

### При push в `main`:
1. ✅ Запускается CI (проверка кода)
2. ✅ MiniApp деплоится на Vercel (production)
3. ✅ Bot деплоится на сервер и перезапускается через PM2

### При push в `dev`:
1. ✅ Запускается CI (проверка кода)
2. ✅ MiniApp деплоится на Vercel (preview)
3. ✅ Bot деплоится на сервер и перезапускается через PM2

### При создании PR:
1. ✅ Запускается только CI (проверка кода без деплоя)

## 📊 Мониторинг деплоев

1. Перейдите в **GitHub → Actions**
2. Выберите нужный workflow
3. Посмотрите логи выполнения

## 🔍 Проверка статуса

### MiniApp:
- Vercel Dashboard → Deployments
- Должен быть последний деплой из ветки `main` или `dev`

### Bot:
- Подключитесь к серверу: `ssh user@server`
- Проверьте статус: `pm2 status step-one-bot`
- Посмотрите логи: `pm2 logs step-one-bot --lines 50`

## 🛠 Ручной запуск деплоя

Если нужно запустить деплой вручную:

1. GitHub → **Actions**
2. Выберите workflow (`Deploy MiniApp` или `Deploy Bot`)
3. Нажмите **Run workflow**
4. Выберите ветку и нажмите **Run**

## ⚠️ Важные замечания

1. **Vercel также деплоит автоматически** через Git integration - GitHub Actions дополняет это
2. **Bot деплоится только через GitHub Actions** (SSH на сервер)
3. **Secrets должны быть настроены** перед первым деплоем
4. **SSH ключ должен иметь доступ** к серверу без пароля

## 🐛 Troubleshooting

### Деплой MiniApp не работает:
- Проверьте Vercel credentials в Secrets
- Проверьте логи в GitHub Actions
- Убедитесь, что Vercel проект подключен к репозиторию

### Деплой Bot не работает:
- Проверьте SSH ключ и доступ к серверу
- Проверьте, что путь `BOT_SERVER_PATH` правильный
- Проверьте, что PM2 установлен на сервере
- Проверьте логи в GitHub Actions

### CI падает:
- Проверьте, что все зависимости установлены
- Проверьте, что TypeScript компилируется без ошибок
- Проверьте логи в GitHub Actions

## 📝 Дополнительная информация

- Подробности о workflows: `.github/workflows/README.md`
- Настройка Vercel: `miniapp/README.md`
- Настройка Bot: `bot/README.md`
