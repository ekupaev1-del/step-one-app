# 🚀 Команды для запуска

## Запуск бота

```bash
cd /Users/eminkupaev/Desktop/step-one-app/bot
npm run dev
```

**Что должно появиться:**
- `[dotenv] injecting env (4) from .env`
- `🤖 Бот запущен`

Бот готов к работе в Telegram!

---

## Запуск миниапа

```bash
cd /Users/eminkupaev/Desktop/step-one-app/miniapp
npm run dev
```

**Что должно появиться:**
- `▲ Next.js 16.0.7`
- `- Local: http://localhost:3000`

Открой `http://localhost:3000` в браузере.

---

## Если миниап не запускается

После исправления Tailwind нужно переустановить зависимости:

```bash
cd /Users/eminkupaev/Desktop/step-one-app/miniapp
rm -rf node_modules package-lock.json
npm install
npm run dev
```

---

**Готово!** Теперь всё должно работать. 🎉
