#!/bin/bash

# Автоматический push - максимально упрощенная версия

echo "🚀 Автоматический push в GitHub"
echo ""

# Настраиваем все необходимое
git config --global credential.helper osxkeychain
git config --local credential.helper osxkeychain

# Проверяем remote
git remote set-url origin https://github.com/ekupaev1-del/step-one-app.git

echo "✅ Настройки применены"
echo ""

# Пробуем push
echo "Пробую сделать push..."
if git push origin dev 2>&1 | tee /tmp/git-push.log; then
    echo ""
    echo "✅ УСПЕХ! Push выполнен!"
    echo "Все коммиты отправлены в GitHub"
    echo "Vercel автоматически задеплоит изменения"
else
    echo ""
    echo "⚠️  Нужна авторизация (один раз)"
    echo ""
    echo "Быстрое решение:"
    echo ""
    echo "1. Создай токен: https://github.com/settings/tokens"
    echo "   - Generate new token (classic)"
    echo "   - Scope: repo"
    echo "   - Скопируй токен"
    echo ""
    echo "2. Выполни:"
    echo "   git push https://<ТОКЕН>@github.com/ekupaev1-del/step-one-app.git dev"
    echo ""
    echo "После первого push все будет работать автоматически!"
fi
