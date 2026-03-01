# Step One MiniApp

Telegram Mini App на Next.js для отслеживания питания.

## Локальная разработка

### Установка зависимостей
```bash
npm install
```

### Настройка переменных окружения
```bash
cp .env.example .env.local
# Заполните .env.local файл своими значениями
```

### Запуск в режиме разработки
```bash
npm run dev
```

Приложение будет доступно по адресу http://localhost:3000

### Сборка для продакшна
```bash
npm run build
```

### Запуск продакшн версии
```bash
npm start
```

## 🚀 Деплой на Vercel

**Просто push в GitHub → автоматический деплой!**

### Быстрая настройка (3 минуты):

1. **Vercel Dashboard** → Add New Project → выберите `step-one-app`
2. **Root Directory**: `miniapp` ⚠️ **ВАЖНО!**
3. **Production Branch**: `main`
4. **Добавьте переменные окружения:**
   ```
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<key>
   EXPECTED_SUPABASE_PROJECT_REF=<project-ref>
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
   ```
5. **Deploy** → готово!

### ✅ Готово! Теперь работает автоматически:

```bash
git push origin main  # → автоматический production деплой
git push origin dev   # → автоматический preview деплой
```

**Подробная инструкция:** `../VERCEL_AUTO_DEPLOY.md`

## Структура проекта

```
miniapp/
├── app/              # Next.js App Router
│   ├── layout.tsx    # Корневой layout с Telegram WebApp SDK
│   ├── page.tsx      # Главная страница
│   └── ...
├── public/           # Статические файлы
├── .env.local        # Локальные переменные окружения (не в git)
├── .env.example      # Пример переменных окружения
├── next.config.ts    # Конфигурация Next.js
├── vercel.json       # Конфигурация Vercel
└── package.json
```

## Telegram WebApp

Приложение использует Telegram WebApp SDK для:
- Получения данных пользователя
- Работы с кнопками и UI Telegram
- Отправки данных обратно в бот

SDK автоматически загружается через `<Script>` в `layout.tsx`.

## Переменные окружения

См. `.env.example` для списка необходимых переменных.

**Важно**: Переменные с префиксом `NEXT_PUBLIC_` доступны в браузере.

## Debug Mode

Для отладки React ошибок и доступа к приложению через обычный браузер (не только через Telegram):

### Настройка

1. Установите переменную окружения в Vercel:
   - Перейдите в Vercel Dashboard → Settings → Environment Variables
   - Добавьте `NEXT_PUBLIC_DEBUG_KEY` (или `DEBUG_KEY`) со значением вашего секретного ключа
   - Пример: `NEXT_PUBLIC_DEBUG_KEY=your-secret-debug-key-here`

2. Используйте debug bypass в URL:
   ```
   https://your-app.vercel.app/?debug=1&debugKey=your-secret-debug-key-here&id=USER_ID
   ```

### Возможности Debug Mode

- **Доступ через браузер**: Приложение можно открыть в обычном браузере (не только в Telegram)
- **Debug Overlay**: Автоматически показывает детальную информацию об ошибках
- **Error Reports**: Кнопка "Copy Error Report (JSON)" для копирования полного отчета об ошибке
- **Diagnostics**: При `?debug=1` показывается информация об окружении, Telegram WebApp, и т.д.

### Примеры использования

1. **Отладка ошибки на странице профиля:**
   ```
   https://your-app.vercel.app/profile?debug=1&debugKey=your-key&id=123
   ```

2. **Просмотр диагностики без ошибки:**
   ```
   https://your-app.vercel.app/?debug=1&debugKey=your-key
   ```

3. **Доступ к регистрации через браузер:**
   ```
   https://your-app.vercel.app/registration?debug=1&debugKey=your-key&id=123
   ```

### Безопасность

- Debug bypass работает **только** при наличии правильного `debugKey`
- Без `debugKey` или с неправильным ключом приложение работает как обычно (только через Telegram)
- **Не коммитьте** `DEBUG_KEY` в репозиторий - используйте только переменные окружения Vercel

## Тестирование онбординга и меню

### Как протестировать flow онбординга → меню:

1. **Подготовка:**
   - Откройте Supabase Dashboard → Table Editor → `users`
   - Найдите и удалите строку пользователя по `telegram_id` (или используйте новый Telegram аккаунт)

2. **Тест нового пользователя:**
   - Откройте Telegram бота
   - Отправьте команду `/start`
   - **Ожидаемо:** Бот отправляет приветствие + кнопку "Заполнить анкету"

3. **Заполнение анкеты:**
   - Нажмите "Заполнить анкету" → откроется Mini App
   - Примите согласие на обработку данных
   - Заполните все поля формы (имя, телефон, email, пол, возраст, вес, рост, активность, цель)
   - Нажмите "Сохранить"

4. **Проверка результата:**
   - **Ожидаемо:** Mini App закрывается
   - **Ожидаемо:** Бот **немедленно** отправляет в чат:
     - Сообщение "Выберите действие:"
     - REPLY keyboard с 4 кнопками:
       - 👤 Личный кабинет
       - 📊 Получить отчёт
       - 💎 Подписка
       - ⏰ Напомнить о приёме пищи

5. **Диагностика (если не работает):**
   - Проверьте логи в консоли браузера (Mini App):
     - Должны быть: `ONBOARDING_SAVE_START`, `ONBOARDING_SAVE_SUCCESS`, `ONBOARDING_SENDDATA_SENT`, `ONBOARDING_CLOSE`
   - Проверьте логи бота:
     - Должны быть: `ПОЛУЧЕНЫ ДАННЫЕ ИЗ WEBAPP`, `Parsed payload`, `MAIN_MENU_SENT`
   - Проверьте таблицу `app_logs` в Supabase:
     - Должна быть запись: `level='info'`, `message='onboarding_saved -> sent main menu'`

### Тест существующего пользователя:

1. Отправьте `/start` боту (пользователь уже в БД)
2. **Ожидаемо:** Бот сразу отправляет "Выберите действие:" + 4 кнопки меню (без онбординга)
