# 🧪 Настройка тестового окружения

## Быстрый старт

### 1. Создать ветку dev (если еще нет)

```bash
cd /Users/eminkupaev/Desktop/step-one-app
git checkout -b dev
git push -u origin dev
```

### 2. Настроить Vercel для тестового миниапа

#### В Vercel Dashboard:

1. **Открой проект** → Settings → Git
2. **Production Branch**: `main` (продакшн)
3. **Preview Branches**: `dev` (тест)

#### Environment Variables для Preview:

В Settings → Environment Variables добавь для **Preview** окружения:

```
NEXT_PUBLIC_SUPABASE_URL=https://ppisnuivnswwpkoxwpef.supabase.co
SUPABASE_SERVICE_ROLE_KEY=твой-сервисный-ключ
TELEGRAM_BOT_TOKEN=8528023493:AAGzAHYtRXW5OP38AjjrItzH-Idndm4hJ3A
```

### 3. Рабочий процесс

**Для тестирования:**
1. Работай в ветке `dev`
2. Делай изменения в коде
3. Пушишь: `git push origin dev`
4. Vercel автоматически создаст preview URL
5. Тестируешь миниап по preview URL

**Для продакшна:**
1. Когда все протестировано → мержишь `dev` в `main`
2. Vercel автоматически обновит продакшн

## Команды

### Переключиться на dev ветку:
```bash
cd /Users/eminkupaev/Desktop/step-one-app
git checkout dev
```

### Запустить миниап локально для теста:
```bash
cd /Users/eminkupaev/Desktop/step-one-app/miniapp
npm run dev
```

### Задеплоить тестовую версию:
```bash
git add .
git commit -m "Тестовая фича"
git push origin dev
```

## Preview URL

После пуша в `dev` ветку, Vercel создаст preview URL вида:
`https://step-one-app-git-dev-твой-username.vercel.app`

Этот URL можно использовать для тестирования в Telegram Mini App!

