# 🔄 Простое обновление URL бота

## Как использовать

После каждого деплоя на Vercel (ветка `dev`):

1. Скопируй preview URL из Vercel (например: `https://step-one-app-git-dev-xxxxxx.vercel.app`)

2. Запусти скрипт:
```bash
./scripts/sync-bot-url.sh https://step-one-app-git-dev-xxxxxx.vercel.app
```

3. Закоммить и запушить:
```bash
git add bot/src/index.ts
git commit -m "Обновить MINIAPP_BASE_URL"
git push origin dev
```

Всё! Больше ничего не нужно.

## Альтернатива: обновить вручную

Если скрипт не работает, просто открой `bot/src/index.ts` и замени:

```typescript
const MINIAPP_BASE_URL =
  process.env.MINIAPP_BASE_URL ||
  "https://step-one-app.vercel.app";  // ← замени на preview URL
```

И в функции `getMainMenuKeyboard`:

```typescript
const baseUrl = (MINIAPP_BASE_URL || "https://step-one-app.vercel.app").trim().replace(/\/$/, '');  // ← замени на preview URL
```

Всё просто, без сложностей! 🎉
