# 🔍 Проверка настроек Vercel для автоматического деплоя

## ⚠️ Критически важные настройки

Если Git подключен, но деплой не запускается автоматически, проверьте:

### 1. Settings → General → Root Directory
**ДОЛЖНО БЫТЬ:** `miniapp`
- Если пусто или другое значение → автоматический деплой не будет работать!

### 2. Settings → Git → Production Branch
**ДОЛЖНО БЫТЬ:** `main`
- Если не указано или другое значение → деплой из main не будет production

### 3. Settings → Git → Ignored Build Step
**ДОЛЖНО БЫТЬ:** пусто (или правильная команда)
- Если указано что-то вроде `git diff HEAD^ HEAD --quiet .` → деплой может игнорироваться

### 4. Settings → Git → Auto-assign Custom Domain
- Проверьте, что не блокирует деплой

### 5. Settings → Git → Deployment Protection
- Убедитесь, что не включена защита, которая блокирует деплой

---

## 🚀 Решение: Запустить деплой вручную

Если автоматический деплой не работает, можно запустить вручную:

1. **Через Vercel Dashboard:**
   - Deployments → "Redeploy" последнего деплоя
   - Или "Deploy" → выберите коммит

2. **Через Vercel CLI:**
   ```bash
   cd miniapp
   vercel --prod
   ```

---

## ✅ После исправления настроек

Сделайте тестовый push:
```bash
git commit --allow-empty -m "Test auto deploy"
git push origin main
```

Должен появиться новый деплой автоматически!
