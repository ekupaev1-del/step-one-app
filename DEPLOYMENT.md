# Полный гайд по деплою

## ЧАСТЬ 1: Локальная настройка

### 1.1. Создание GitHub репозитория

1. Создайте новый репозиторий на GitHub с именем `step-one-app`
2. **Не** инициализируйте с README, .gitignore или лицензией (мы уже создали их)

### 1.2. Инициализация Git в проекте

```bash
cd /Users/eminkupaev/Desktop/step-one-app
git init
git add .
git commit -m "Initial commit: monorepo structure"
```

### 1.3. Подключение к GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/step-one-app.git
git branch -M main
git push -u origin main
```

### 1.4. Создание ветки dev

```bash
git checkout -b dev
git push -u origin dev
```

### 1.5. Первый локальный запуск

#### Бот:
```bash
cd bot
npm install
cp .env.example .env
# Заполните .env своими значениями
npm run dev
```

#### Миниап:
```bash
cd miniapp
npm install
cp .env.example .env.local
# Заполните .env.local своими значениями
npm run dev
```

---

## ЧАСТЬ 2: Настройка сервера для бота

### 2.1. Установка необходимых пакетов на Ubuntu

```bash
# Обновление системы
sudo apt update
sudo apt upgrade -y

# Установка Node.js (через NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Установка PM2 глобально
sudo npm install -g pm2

# Установка Git (если не установлен)
sudo apt install -y git

# Проверка версий
node --version
npm --version
pm2 --version
git --version
```

### 2.2. Клонирование репозитория на сервер

```bash
# Перейдите в папку, где будут проекты (например, /home/username/projects)
cd ~
mkdir -p projects
cd projects

# Клонируйте репозиторий
git clone https://github.com/YOUR_USERNAME/step-one-app.git
cd step-one-app/bot
```

### 2.3. Установка зависимостей и настройка бота

```bash
# Установка зависимостей
npm install

# Создание .env файла
cp .env.example .env
nano .env  # Заполните переменные окружения

# Сборка проекта
npm run build
```

### 2.4. Настройка PM2

```bash
# Отредактируйте ecosystem.config.js
nano ecosystem.config.js
# Укажите правильный путь в cwd: "/home/username/projects/step-one-app/bot"

# Запуск через PM2
pm2 start ecosystem.config.js

# Сохранение конфигурации PM2
pm2 save

# Настройка автозапуска при перезагрузке сервера
pm2 startup
# Выполните команду, которую выведет pm2 startup (она будет содержать sudo)
```

### 2.5. Проверка работы бота

```bash
# Статус процессов
pm2 status

# Просмотр логов
pm2 logs step-one-bot

# Если нужно перезапустить
pm2 restart step-one-bot
```

---

## ЧАСТЬ 3: Настройка Vercel для миниапа

### 3.1. Создание проекта в Vercel

1. Откройте [Vercel Dashboard](https://vercel.com/dashboard)
2. Нажмите "Add New Project"
3. Выберите репозиторий `step-one-app` из GitHub
4. Нажмите "Import"

### 3.2. Настройка проекта

В настройках проекта укажите:

- **Framework Preset**: Next.js
- **Root Directory**: `miniapp` (важно!)
- **Build Command**: `npm run build` (или оставьте по умолчанию)
- **Output Directory**: `.next` (по умолчанию)
- **Install Command**: `npm install` (по умолчанию)

### 3.3. Настройка веток

В Settings → Git:

- **Production Branch**: `main`
- **Preview Branches**: включите для всех веток или только для `dev`

### 3.4. Настройка переменных окружения

В Settings → Environment Variables добавьте:

- `NEXT_PUBLIC_SUPABASE_URL` = ваш Supabase URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = ваш Supabase anon key

**Важно**: Выберите окружения (Production, Preview, Development) для каждой переменной.

### 3.5. Первый деплой

После настройки нажмите "Deploy". Vercel автоматически:
1. Установит зависимости
2. Соберет проект
3. Задеплоит миниап

### 3.6. Получение URL миниапа

После деплоя вы получите URL вида: `https://step-one-app.vercel.app`

Этот URL нужно будет указать в настройках Telegram бота.

---

## ЧАСТЬ 4: Обычный workflow после настройки

### 4.1. Разработка новой фичи

```bash
# Переключитесь на ветку dev
git checkout dev

# Создайте новую ветку для фичи (опционально)
git checkout -b feature/my-feature

# Внесите изменения
# ...

# Закоммитьте изменения
git add .
git commit -m "Add new feature"

# Запушьте в dev
git push origin dev
```

**Что происходит:**
- Vercel автоматически создаст preview deployment для ветки `dev`
- Вы получите ссылку на preview в Vercel Dashboard
- Можете протестировать изменения

### 4.2. Мерж в main (продакшн)

```bash
# Переключитесь на main
git checkout main

# Обновите main
git pull origin main

# Смержите dev в main
git merge dev

# Запушьте в main
git push origin main
```

**Что происходит:**
- Vercel автоматически задеплоит в production
- Миниап обновится на продакшн URL

### 4.3. Обновление бота на сервере

```bash
# Вариант 1: Через deploy.sh (отредактируйте скрипт перед использованием)
cd /Users/eminkupaev/Desktop/step-one-app/bot
./deploy.sh

# Вариант 2: Вручную через SSH
ssh user@your-server
cd /path/to/step-one-app/bot
git pull origin main
npm install --production
npm run build
pm2 restart step-one-bot
```

---

## ЧАСТЬ 5: Полезные команды

### Git

```bash
# Создать новую ветку
git checkout -b feature/name

# Переключиться на ветку
git checkout branch-name

# Посмотреть статус
git status

# Посмотреть историю
git log --oneline

# Отменить локальные изменения
git checkout -- .
```

### PM2 (на сервере)

```bash
# Статус
pm2 status

# Логи
pm2 logs step-one-bot
pm2 logs step-one-bot --lines 100  # Последние 100 строк

# Перезапуск
pm2 restart step-one-bot

# Остановка
pm2 stop step-one-bot

# Удаление из PM2
pm2 delete step-one-bot

# Мониторинг
pm2 monit
```

### Vercel

```bash
# Установка Vercel CLI
npm i -g vercel

# Логин
vercel login

# Деплой в preview
vercel

# Деплой в production
vercel --prod

# Просмотр логов
vercel logs
```

---

## ЧАСТЬ 6: Troubleshooting

### Бот не запускается

1. Проверьте логи: `pm2 logs step-one-bot`
2. Проверьте переменные окружения в `.env`
3. Проверьте, что порт не занят
4. Проверьте права доступа к файлам

### Миниап не деплоится на Vercel

1. Проверьте, что Root Directory указан как `miniapp`
2. Проверьте логи билда в Vercel Dashboard
3. Убедитесь, что все зависимости в `package.json`
4. Проверьте переменные окружения

### Проблемы с импортами

1. Проверьте пути импортов после миграции
2. Убедитесь, что `tsconfig.json` настроен правильно
3. Проверьте, что все файлы скопированы

---

## Финальный чеклист

### Локально
- [ ] Git репозиторий создан и подключен к GitHub
- [ ] Ветки `main` и `dev` созданы
- [ ] Бот запускается локально (`npm run dev`)
- [ ] Миниап запускается локально (`npm run dev`)
- [ ] Все переменные окружения настроены

### На сервере
- [ ] Node.js и PM2 установлены
- [ ] Репозиторий склонирован
- [ ] Зависимости установлены
- [ ] `.env` файл создан и заполнен
- [ ] Бот собран (`npm run build`)
- [ ] PM2 запущен и сохранен
- [ ] Автозапуск настроен (`pm2 startup`)

### Vercel
- [ ] Проект создан и подключен к GitHub
- [ ] Root Directory указан как `miniapp`
- [ ] Ветки настроены (main → production, dev → preview)
- [ ] Переменные окружения добавлены
- [ ] Первый деплой успешен
- [ ] URL миниапа получен

### После первого деплоя
- [ ] URL миниапа указан в настройках Telegram бота
- [ ] Бот открывает миниап корректно
- [ ] Все функции работают

---

Готово! Теперь у вас настроен полноценный workflow для разработки и деплоя.

