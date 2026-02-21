# 🚀 АВТОМАТИЧЕСКИЙ ДЕПЛОЙ В VERCEL

## ⚡ Настройка за 3 шага

### 1️⃣ Откройте Vercel
👉 https://vercel.com/new

### 2️⃣ Подключите GitHub
- Выберите репозиторий `step-one-app`
- **Root Directory**: `miniapp` ⚠️
- Нажмите **Import**

### 3️⃣ Добавьте переменные окружения
```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Выберите: ✅ Production, ✅ Preview, ✅ Development

### 4️⃣ Deploy

---

## ✅ Готово!

Теперь:
```bash
git push origin main  # → автоматический деплой
```

**Подробная инструкция:** `АВТОМАТИЧЕСКИЙ_ДЕПЛОЙ.md`
