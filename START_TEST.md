# 🚀 БЫСТРЫЙ СТАРТ ТЕСТОВОГО МИНИАПА

## 1. Инициализируй Git (если еще не сделано):

```bash
cd /Users/eminkupaev/Desktop/step-one-app
git init
git add .
git commit -m "Initial commit"
```

## 2. Создай репозиторий на GitHub и подключи:

```bash
git remote add origin https://github.com/ТВОЙ_USERNAME/step-one-app.git
git branch -M main
git push -u origin main
```

## 3. Создай ветку dev:

```bash
git checkout -b dev
git push -u origin dev
```

## 4. В Vercel Dashboard:

1. Settings → Git → Production Branch: `main`
2. Settings → Git → Preview Branches: включи `dev`
3. Settings → Environment Variables → Add для **Preview**:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://ppisnuivnswwpkoxwpef.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = (твой ключ)
   - `TELEGRAM_BOT_TOKEN` = `8528023493:AAGzAHYtRXW5OP38AjjrItzH-Idndm4hJ3A`

## 5. Задеплой тестовую версию:

```bash
git checkout dev
# сделай изменения
git add .
git commit -m "Тест"
git push origin dev
```

## 6. Получи Preview URL из Vercel и используй для тестирования!

Подробнее: см. SETUP_TEST.md
