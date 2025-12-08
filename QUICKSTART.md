# Быстрый старт

## Что было создано

✅ Монорепо `step-one-app` с четкой структурой  
✅ Бот в папке `bot/` с TypeScript и модульной архитектурой  
✅ Миниап в папке `miniapp/` с Next.js и Telegram WebApp SDK  
✅ Конфиги для PM2, Vercel, TypeScript  
✅ Скрипты деплоя и документация  

## Что нужно сделать сейчас

### 1. Перенести существующий код

Следуйте инструкциям в **[MIGRATION.md](MIGRATION.md)**:

- Скопируйте код бота из `nutrition-app/bot/bot.ts` в `step-one-app/bot/src/index.ts`
- Скопируйте файлы миниапа из `nutrition-app/app/` в `step-one-app/miniapp/app/`
- Скопируйте переменные окружения
- Обновите импорты

### 2. Настроить Git

```bash
cd /Users/eminkupaev/Desktop/step-one-app
git init
git add .
git commit -m "Initial commit: monorepo structure"

# Создайте репозиторий на GitHub, затем:
git remote add origin https://github.com/YOUR_USERNAME/step-one-app.git
git branch -M main
git push -u origin main
git checkout -b dev
git push -u origin dev
```

### 3. Протестировать локально

#### Бот:
```bash
cd bot
npm install
cp .env.example .env
# Заполните .env
npm run dev
```

#### Миниап:
```bash
cd miniapp
npm install
cp .env.example .env.local
# Заполните .env.local
npm run dev
```

### 4. Настроить деплой

Следуйте инструкциям в **[DEPLOYMENT.md](DEPLOYMENT.md)**:

- Настройте сервер для бота (Ubuntu + PM2)
- Настройте Vercel для миниапа
- Настройте автоматический деплой

## Структура документации

- **[README.md](README.md)** — общее описание проекта
- **[STRUCTURE.md](STRUCTURE.md)** — детальная структура монорепо
- **[MIGRATION.md](MIGRATION.md)** — как перенести существующий код
- **[DEPLOYMENT.md](DEPLOYMENT.md)** — полный гайд по деплою
- **[bot/README.md](bot/README.md)** — документация бота
- **[miniapp/README.md](miniapp/README.md)** — документация миниапа

## Важные моменты

⚠️ **Не удаляйте старый проект** до полной проверки нового  
⚠️ **Проверьте все пути** в импортах после переноса  
⚠️ **Убедитесь, что .env файлы не в git** (они в .gitignore)  
⚠️ **Обновите URL миниапа** в настройках Telegram бота после деплоя  

## Следующие шаги

1. ✅ Прочитайте `MIGRATION.md` и перенесите код
2. ✅ Настройте Git и создайте репозиторий
3. ✅ Протестируйте локально
4. ✅ Настройте деплой по `DEPLOYMENT.md`
5. ✅ Начните разработку в ветке `dev`

---

**Готово!** У вас теперь аккуратный монорепо с понятной структурой и workflow.


