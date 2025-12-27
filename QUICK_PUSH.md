# Быстрый способ сделать push

## Проблема
Git push не работает из-за отсутствия аутентификации GitHub.

## Решение: Создать Personal Access Token

1. **Создай токен на GitHub:**
   - Зайди: https://github.com/settings/tokens
   - Нажми "Generate new token" → "Generate new token (classic)"
   - Название: `step-one-app-deploy`
   - Выбери scope: `repo` (полный доступ к репозиториям)
   - Нажми "Generate token"
   - **Скопируй токен** (он показывается только один раз!)

2. **Используй токен для push:**
   ```bash
   cd /Users/eminkupaev/Desktop/step-one-app
   git push https://<ТВОЙ_ТОКЕН>@github.com/ekupaev1-del/step-one-app.git dev
   ```
   
   Замени `<ТВОЙ_ТОКЕН>` на токен, который ты скопировал.

3. **Или сохрани токен для будущего использования:**
   ```bash
   git config --global credential.helper store
   git push https://<ТВОЙ_ТОКЕН>@github.com/ekupaev1-del/step-one-app.git dev
   ```
   
   После первого push с токеном, git запомнит его.

## После push

После успешного push:
- ✅ GitHub Actions автоматически запустится
- ✅ Проект автоматически задеплоится на Vercel
- ✅ Все последующие push будут работать автоматически

## Альтернатива: GitHub Desktop

Если не хочешь использовать токен, можешь использовать GitHub Desktop:
1. Установи GitHub Desktop: https://desktop.github.com/
2. Открой проект в GitHub Desktop
3. Нажми "Push origin" для ветки dev
