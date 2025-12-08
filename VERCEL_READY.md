# ✅ ВСЁ ГОТОВО ДЛЯ VERCEL!

## Что сделано:
1. ✅ Git репозиторий создан и запушен
2. ✅ Ветки main и dev созданы
3. ✅ vercel.json настроен
4. ✅ .vercelignore создан

## ЧТО ДЕЛАТЬ СЕЙЧАС:

### 1. Подключи проект к Vercel:

**Вариант А: Через веб-интерфейс (проще)**
1. Зайди на https://vercel.com/new
2. Import Git Repository → выбери `ekupaev1-del/step-one-app`
3. В настройках проекта:
   - **Root Directory:** `miniapp`
   - **Framework Preset:** Next.js
   - **Build Command:** `npm run build` (или оставь по умолчанию)
   - **Output Directory:** `.next`
4. Нажми Deploy

**Вариант Б: Через CLI**
```bash
cd /Users/eminkupaev/Desktop/step-one-app/miniapp
npx vercel login
npx vercel --prod
```

### 2. Настрой Preview для ветки dev:

После первого деплоя:
1. Settings → Git → Production Branch: `main`
2. Settings → Git → Preview Branches: включи `dev`

### 3. Добавь переменные окружения для Preview:

Settings → Environment Variables → Add для **Preview**:
- `NEXT_PUBLIC_SUPABASE_URL` = `https://ppisnuivnswwpkoxwpef.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = (твой ключ из Supabase)
- `TELEGRAM_BOT_TOKEN` = `8528023493:AAGzAHYtRXW5OP38AjjrItzH-Idndm4hJ3A`

### 4. Готово!

Теперь когда пушишь в `dev` → Vercel создаст preview URL для тестирования!


