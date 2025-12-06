# 🚀 Быстрый старт тестового миниапа

## Шаг 1: Создать ветку dev

```bash
cd /Users/eminkupaev/Desktop/step-one-app
git checkout -b dev
git push -u origin dev
```

## Шаг 2: Настроить Vercel

1. Зайди в Vercel Dashboard
2. Выбери проект `step-one-app` (или как он называется)
3. Settings → Git → Production Branch: `main`
4. Settings → Git → Preview Branches: включи `dev`

## Шаг 3: Добавить переменные окружения для Preview

Settings → Environment Variables → Add New:

**Для Preview окружения добавь:**
- `NEXT_PUBLIC_SUPABASE_URL` = `https://ppisnuivnswwpkoxwpef.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = (твой сервисный ключ)
- `TELEGRAM_BOT_TOKEN` = `8528023493:AAGzAHYtRXW5OP38AjjrItzH-Idndm4hJ3A`

## Шаг 4: Задеплоить тестовую версию

```bash
# Переключись на dev
git checkout dev

# Сделай изменения
# ...

# Запушь
git add .
git commit -m "Тестовая фича"
git push origin dev
```

## Готово! 🎉

После пуша Vercel автоматически создаст preview URL:
`https://твой-проект-git-dev-твой-username.vercel.app`

Используй этот URL для тестирования в Telegram!

---

## Локальный тест

Для локального тестирования:

```bash
cd /Users/eminkupaev/Desktop/step-one-app/miniapp
npm run dev
```

Откроется на `http://localhost:3000`

