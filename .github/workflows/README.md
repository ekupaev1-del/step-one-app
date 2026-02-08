# GitHub Actions Workflows

Этот репозиторий использует GitHub Actions для автоматического деплоя и CI/CD.

## Workflows

### 1. `ci.yml` - Continuous Integration
- **Триггер**: Pull requests и push в `main`/`dev`
- **Действия**:
  - Линтинг и проверка типов для miniapp
  - Линтинг и проверка типов для bot
  - Сборка обоих приложений для проверки ошибок

### 2. `deploy-miniapp.yml` - Деплой MiniApp на Vercel
- **Триггер**: Push в `main`/`dev` (только изменения в `miniapp/`)
- **Действия**:
  - Установка зависимостей
  - Сборка проекта
  - Деплой на Vercel (production для `main`, preview для `dev`)

### 3. `deploy-bot.yml` - Деплой Bot на сервер
- **Триггер**: Push в `main`/`dev` (только изменения в `bot/`)
- **Действия**:
  - Установка зависимостей
  - Сборка проекта
  - Деплой на сервер через SSH
  - Перезапуск через PM2

## Настройка Secrets

### Для MiniApp (Vercel)
Добавьте в GitHub Settings → Secrets and variables → Actions:

- `VERCEL_TOKEN` - токен Vercel (получить в Vercel Dashboard → Settings → Tokens)
- `VERCEL_ORG_ID` - ID организации Vercel
- `VERCEL_PROJECT_ID` - ID проекта Vercel
- `NEXT_PUBLIC_SUPABASE_URL` - URL Supabase проекта
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Anon ключ Supabase
- `SUPABASE_URL` - URL Supabase (для серверных запросов)
- `SUPABASE_SERVICE_ROLE_KEY` - Service role ключ Supabase
- `EXPECTED_SUPABASE_PROJECT_REF` - Ожидаемый project ref (например, `ipgxnqplwzptxyfjjssrr`)

### Для Bot (Server)
Добавьте в GitHub Settings → Secrets and variables → Actions:

- `BOT_SERVER_HOST` - IP адрес или домен сервера
- `BOT_SERVER_USER` - пользователь для SSH (например, `root` или `ubuntu`)
- `BOT_SERVER_SSH_KEY` - приватный SSH ключ для доступа к серверу
- `BOT_SERVER_PORT` - порт SSH (опционально, по умолчанию 22)
- `BOT_SERVER_PATH` - путь к проекту на сервере (например, `/var/www/step-one-app`)

## Как получить Vercel credentials

1. Зайдите в [Vercel Dashboard](https://vercel.com/dashboard)
2. Settings → Tokens → Create Token
3. Скопируйте токен в `VERCEL_TOKEN`
4. Settings → General → скопируйте:
   - Organization ID → `VERCEL_ORG_ID`
   - Project ID → `VERCEL_PROJECT_ID`

## Как настроить SSH ключ для сервера

1. Сгенерируйте SSH ключ (если нет):
   ```bash
   ssh-keygen -t ed25519 -C "github-actions"
   ```

2. Скопируйте публичный ключ на сервер:
   ```bash
   ssh-copy-id -i ~/.ssh/id_ed25519.pub user@your-server
   ```

3. Скопируйте приватный ключ в GitHub Secrets:
   ```bash
   cat ~/.ssh/id_ed25519
   ```
   Вставьте содержимое в `BOT_SERVER_SSH_KEY`

## Ручной запуск деплоя

Вы можете запустить деплой вручную через GitHub Actions:
1. Перейдите в Actions → выберите workflow
2. Нажмите "Run workflow"
3. Выберите ветку и нажмите "Run"

## Примечания

- Vercel также автоматически деплоит при push в `main` через Git integration
- GitHub Actions workflow дополняет это, добавляя проверки и логирование
- Для bot деплой происходит только через GitHub Actions (SSH на сервер)
