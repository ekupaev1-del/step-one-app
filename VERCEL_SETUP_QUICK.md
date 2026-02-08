# ⚡ Настройка Vercel за 3 минуты

## 🎯 Шаги

### 1. Подключите репозиторий
1. [Vercel Dashboard](https://vercel.com/dashboard) → **Add New Project**
2. Выберите `step-one-app`
3. **Import**

### 2. Настройте
- **Root Directory**: `miniapp` ⚠️
- **Production Branch**: `main`

### 3. Добавьте переменные
```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<key>
EXPECTED_SUPABASE_PROJECT_REF=<project-ref>
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

### 4. Deploy → Готово! 🎉

---

## ✅ Теперь просто push в GitHub:

```bash
git push origin main  # → автоматический деплой
```

**Всё! Больше ничего не нужно.**
