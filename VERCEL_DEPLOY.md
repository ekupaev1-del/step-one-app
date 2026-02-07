# Деплой на Vercel

## Быстрый деплой

### Вариант 1: Через Vercel Dashboard (Рекомендуется)

1. **Подключите репозиторий к Vercel:**
   - Зайдите на [vercel.com](https://vercel.com)
   - Нажмите "Add New Project"
   - Выберите ваш GitHub/GitLab/Bitbucket репозиторий
   - Выберите проект `step-one-app`

2. **Настройте проект:**
   - **Root Directory**: `miniapp` (или оставьте корень, если используете корневой vercel.json)
   - **Framework Preset**: Next.js (определится автоматически)
   - **Build Command**: `npm run build` (или `cd miniapp && npm run build` если из корня)
   - **Output Directory**: `.next` (или `miniapp/.next` если из корня)
   - **Install Command**: `npm install` (или `cd miniapp && npm install` если из корня)

3. **Добавьте переменные окружения:**
   
   Перейдите в Settings → Environment Variables и добавьте:

   **Обязательные:**
   ```
   NEXT_PUBLIC_SUPABASE_URL = https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_SERVICE_ROLE_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (длинный ключ)
   ```

   **Опциональные:**
   ```
   DEBUG = 1 (для подробных логов)
   TELEGRAM_BOT_TOKEN = ваш_токен_бота
   OPENAI_API_KEY = ваш_ключ_openai
   MINIAPP_BASE_URL = https://your-project.vercel.app (автоматически)
   ```

   ⚠️ **Важно**: 
   - Установите переменные для всех окружений: Production, Preview, Development
   - `SUPABASE_SERVICE_ROLE_KEY` должен быть длинным (200+ символов) и НЕ содержать "anon"

4. **Деплой:**
   - Нажмите "Deploy"
   - Дождитесь завершения сборки
   - Проверьте URL проекта

### Вариант 2: Через Vercel CLI

1. **Установите Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Войдите в Vercel:**
   ```bash
   vercel login
   ```

3. **Деплой из папки miniapp:**
   ```bash
   cd miniapp
   vercel
   ```
   
   Или из корня (если используете корневой vercel.json):
   ```bash
   vercel
   ```

4. **Добавьте переменные окружения через CLI:**
   ```bash
   vercel env add NEXT_PUBLIC_SUPABASE_URL
   vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
   vercel env add SUPABASE_SERVICE_ROLE_KEY
   ```

   Или добавьте все сразу через файл:
   ```bash
   # Создайте .env.production с переменными
   vercel env pull .env.production
   # Отредактируйте файл
   vercel env push .env.production
   ```

5. **Продакшн деплой:**
   ```bash
   vercel --prod
   ```

## Конфигурация проекта

### Если деплоите из корня (монорепо):

Используйте корневой `vercel.json`:
```json
{
  "buildCommand": "cd miniapp && npm install && npm run build",
  "outputDirectory": "miniapp/.next",
  "framework": "nextjs",
  "installCommand": "cd miniapp && npm install",
  "devCommand": "cd miniapp && npm run dev"
}
```

### Если деплоите из папки miniapp:

Используйте `miniapp/vercel.json`:
```json
{
  "buildCommand": "npm install && npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "installCommand": "npm install",
  "devCommand": "npm run dev"
}
```

**Рекомендация**: Деплоить из папки `miniapp` проще и надежнее.

## Настройка переменных окружения

### Через Dashboard:

1. Зайдите в проект на Vercel
2. Settings → Environment Variables
3. Добавьте каждую переменную:
   - **Key**: имя переменной
   - **Value**: значение
   - **Environment**: выберите Production, Preview, Development (или все)

### Через CLI:

```bash
# Добавить переменную для всех окружений
vercel env add NEXT_PUBLIC_SUPABASE_URL production preview development

# Или добавить только для production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

## Проверка деплоя

После деплоя проверьте:

1. **Доступность сайта:**
   - Откройте URL проекта (например, `https://your-project.vercel.app`)
   - Должна загрузиться главная страница

2. **API routes:**
   - Проверьте `/api/health` или `/api/version`
   - Должен вернуться JSON ответ

3. **Логи:**
   - Зайдите в Vercel Dashboard → Deployments → выберите деплой → Logs
   - Проверьте, что нет ошибок сборки

4. **Переменные окружения:**
   - Settings → Environment Variables
   - Убедитесь, что все переменные установлены

## Автоматический деплой

Vercel автоматически деплоит при:
- Push в ветку `main` → Production деплой
- Push в другие ветки → Preview деплой
- Pull Request → Preview деплой

### Настройка веток:

1. Settings → Git
2. Production Branch: `main` (или ваша основная ветка)
3. Preview Branches: все остальные ветки

## Troubleshooting

### Ошибка: "Build failed"

**Причины:**
- Отсутствуют переменные окружения
- Ошибки в коде
- Проблемы с зависимостями

**Решение:**
1. Проверьте логи сборки в Vercel Dashboard
2. Убедитесь, что все переменные окружения установлены
3. Проверьте локально: `npm run build`

### Ошибка: "Environment variable not found"

**Решение:**
1. Проверьте, что переменная добавлена в Vercel
2. Убедитесь, что переменная доступна для нужного окружения (Production/Preview)
3. Пересоберите проект после добавления переменных

### Ошибка: "Module not found"

**Решение:**
1. Проверьте, что все зависимости в `package.json`
2. Убедитесь, что `node_modules` не в `.gitignore` (или что Vercel может установить зависимости)
3. Проверьте пути импортов

### Ошибка: "Supabase connection failed"

**Решение:**
1. Проверьте `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY`
2. Убедитесь, что ключи правильные (не перепутаны anon и service role)
3. Проверьте, что Supabase проект активен

## Полезные команды

```bash
# Локальная разработка с переменными из Vercel
vercel env pull .env.local

# Просмотр переменных окружения
vercel env ls

# Удаление переменной
vercel env rm VARIABLE_NAME

# Просмотр логов
vercel logs

# Открыть проект в браузере
vercel open
```

## Следующие шаги

После успешного деплоя:

1. ✅ Проверьте работу API routes
2. ✅ Протестируйте интеграцию с Supabase
3. ✅ Настройте кастомный домен (опционально)
4. ✅ Настройте мониторинг и алерты
5. ✅ Добавьте webhook для Telegram бота (если нужно)

## Дополнительные ресурсы

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js on Vercel](https://vercel.com/docs/frameworks/nextjs)
- [Environment Variables](https://vercel.com/docs/environment-variables)
