# ✅ Автоматический деплой на Vercel - Статус

## Что было сделано

✅ **Тестовый коммит создан и запушен в `main`**
- Коммит: `Test: trigger Vercel auto-deploy via Git integration`
- Ветка: `main`
- Время: Сейчас

---

## Что должно произойти автоматически

В течение **30-60 секунд** после push:

1. **Vercel получит webhook от GitHub** о новом push в `main`
2. **Vercel автоматически запустит деплой:**
   - Установит зависимости: `cd miniapp && npm install`
   - Соберет проект: `cd miniapp && npm run build`
   - Задеплоит в production

3. **В Vercel Dashboard появится новый деплой:**
   - Откройте: https://vercel.com/dashboard → ваш проект → Deployments
   - Должен быть новый деплой с вашим тестовым коммитом
   - Статус: Building → Ready (или Error, но деплой ДОЛЖЕН появиться)

---

## Как проверить

### 1. Проверьте Vercel Dashboard

**Откройте:** https://vercel.com/dashboard → ваш проект → Deployments

**Что искать:**
- ✅ Новый деплой с коммитом "Test: trigger Vercel auto-deploy via Git integration"
- ✅ Источник: **GitHub**
- ✅ Ветка: **main**
- ✅ Статус: Building или Ready

**Если деплоя НЕТ через 1-2 минуты:**
→ См. раздел "Если деплой не появился" ниже

---

### 2. Проверьте GitHub Webhook

**Откройте:** https://github.com/ekupaev1-del/step-one-app/settings/hooks

**Что проверить:**
1. Найдите webhook с URL `vercel.com` или `vercel.app`
2. Кликните на него
3. Перейдите на вкладку "Recent Deliveries"
4. Должно быть недавнее событие "push" с статусом `200`

**Если статус НЕ 200:**
→ Webhook сломан, нужно переподключить Git в Vercel

---

## Если деплой не появился автоматически

### Проблема 1: Root Directory не установлен

**Симптом:** Деплои не появляются или падают с ошибкой

**Решение:**
1. Vercel Dashboard → Settings → General
2. **Root Directory:** `miniapp` ⚠️ **ОБЯЗАТЕЛЬНО**
3. Сохраните

---

### Проблема 2: Репозиторий не подключен

**Симптом:** Нет деплоев вообще

**Решение:**
1. Vercel Dashboard → Settings → Git
2. Если репозиторий НЕ подключен:
   - Нажмите "Connect Repository"
   - Выберите `ekupaev1-del/step-one-app`
   - Установите Root Directory: `miniapp`
   - Установите Production Branch: `main`
   - Нажмите "Connect"

---

### Проблема 3: Production Branch не совпадает

**Симптом:** Деплои создаются, но не для production

**Решение:**
1. Vercel Dashboard → Settings → Git
2. **Production Branch:** `main` (должно совпадать с вашей веткой)
3. Сохраните

---

### Проблема 4: Ignored Build Step блокирует деплои

**Симптом:** Деплои не запускаются

**Решение:**
1. Vercel Dashboard → Settings → Git
2. **Ignored Build Step:** ⚠️ **ОСТАВЬТЕ ПУСТЫМ**
3. Если там есть команда - удалите её!

---

### Проблема 5: Webhook не работает

**Симптом:** Push в GitHub не создает деплои

**Решение:**
1. Vercel Dashboard → Settings → Git → Disconnect
2. Connect Repository → выберите `ekupaev1-del/step-one-app`
3. Установите Root Directory: `miniapp`
4. Установите Production Branch: `main`
5. Connect

---

## Текущая конфигурация

**Repository:** `ekupaev1-del/step-one-app`
**Branch:** `main`
**Root Directory:** `miniapp` (из vercel.json)
**Build Command:** `cd miniapp && npm install && npm run build` (из vercel.json)
**Output Directory:** `miniapp/.next` (из vercel.json)

**Последний коммит:** `Test: trigger Vercel auto-deploy via Git integration`

---

## Следующие шаги

1. **Проверьте Vercel Dashboard → Deployments** (через 1-2 минуты после push)
2. **Если деплой появился:** ✅ Автоматический деплой работает!
3. **Если деплоя нет:** Проверьте настройки по чеклисту выше

**После успешной настройки:**
- Все последующие push в `main` будут автоматически деплоиться
- Vercel Git Integration работает автоматически
- GitHub Actions больше не нужны для деплоя

---

## Проверка через Vercel CLI (опционально)

Если у вас установлен Vercel CLI, можете проверить статус:

```bash
cd step-one-app/step-one-app
npx vercel --version  # Проверка установки
npx vercel ls        # Список деплоев
```

Но это не обязательно - веб-интерфейс Vercel Dashboard показывает всё то же самое.
