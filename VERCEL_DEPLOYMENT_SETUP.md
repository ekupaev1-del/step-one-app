# Настройка автоматического деплоя в Vercel

## Вариант 1: Vercel Git Integration (Рекомендуется) ⭐

Это самый простой и надежный способ. Vercel автоматически деплоит при каждом push в GitHub.

### Шаги настройки:

1. **Подключите репозиторий в Vercel Dashboard:**
   - Откройте [Vercel Dashboard](https://vercel.com/dashboard)
   - Нажмите "Add New Project"
   - Выберите ваш GitHub репозиторий
   - Настройте проект:
     - **Framework Preset**: Next.js
     - **Root Directory**: `miniapp`
     - **Build Command**: `npm run build`
     - **Output Directory**: `.next`
     - **Install Command**: `npm install`

2. **Настройте Environment Variables:**
   В Vercel Dashboard → Settings → Environment Variables добавьте:
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   SUPABASE_URL
   OPENAI_API_KEY
   TELEGRAM_BOT_TOKEN
   ```
   
   Установите для каждого переменной:
   - ✅ Production
   - ✅ Preview
   - ✅ Development (опционально)

3. **Готово!**
   - При каждом push в `main`/`master` → автоматический production деплой
   - При каждом PR → автоматический preview деплой
   - При каждом push в другие ветки → автоматический preview деплой

---

## Вариант 2: GitHub Actions (Альтернатива)

Если вы хотите больше контроля над процессом деплоя, используйте GitHub Actions.

### Требуемые GitHub Secrets:

Добавьте в GitHub → Settings → Secrets and variables → Actions:

1. `VERCEL_TOKEN` - Personal Access Token из Vercel
   - Получить: Vercel Dashboard → Settings → Tokens → Create Token
   
2. `VERCEL_ORG_ID` - Organization ID
   - Получить: Vercel Dashboard → Settings → General → Team ID
   
3. `VERCEL_PROJECT_ID` - Project ID
   - Получить: Vercel Dashboard → Project Settings → General → Project ID

4. Environment Variables (для build):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_URL`
   - `OPENAI_API_KEY`
   - `TELEGRAM_BOT_TOKEN`

### Использование:

1. **Выберите workflow:**
   - `vercel-deploy-simple.yml` - упрощенный вариант (рекомендуется)
   - `vercel-deploy.yml` - расширенный вариант с комментариями в PR

2. **Workflow автоматически запустится при:**
   - Push в `main`/`master` → Production деплой
   - Pull Request → Preview деплой
   - Manual trigger через GitHub Actions UI

---

## Проверка деплоя

### После настройки Git Integration:

1. Сделайте тестовый commit:
   ```bash
   git add .
   git commit -m "test: verify deployment"
   git push origin main
   ```

2. Проверьте Vercel Dashboard:
   - Должен появиться новый деплой
   - Статус должен быть "Building" → "Ready"

3. Проверьте GitHub Actions (если используете):
   - Откройте Actions tab в GitHub
   - Убедитесь, что workflow запустился и завершился успешно

---

## Troubleshooting

### Деплой не запускается

**Проблема:** Изменения не триггерят деплой

**Решение:**
- Убедитесь, что изменения в `miniapp/` директории
- Проверьте, что ветка называется `main` или `master`
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

**Проблема:** Переменные окружения не доступны в runtime

**Решение:**
- `NEXT_PUBLIC_*` переменные должны быть установлены для всех окружений
- Перезапустите деплой после добавления переменных
- Убедитесь, что переменные не содержат лишних пробелов

---

## Структура деплоя

```
Repository Root
├── miniapp/              ← Next.js приложение (деплоится)
│   ├── app/
│   ├── lib/
│   ├── package.json
│   └── vercel.json
├── bot/                  ← Telegram бот (НЕ деплоится через Vercel)
├── supabase/
│   └── migrations/       ← Миграции БД (не деплоятся, но отслеживаются)
└── .github/
    └── workflows/        ← GitHub Actions workflows
```

---

## Рекомендации

1. **Используйте Vercel Git Integration** - это проще и надежнее
2. **Настройте Preview Deployments** - для тестирования перед merge
3. **Используйте Environment Variables** - не коммитьте секреты
4. **Мониторьте деплои** - проверяйте логи после каждого деплоя
5. **Используйте Vercel Analytics** - для мониторинга производительности

---

## Полезные ссылки

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
