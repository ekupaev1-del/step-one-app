#!/bin/bash

echo "🚀 Автоматический push в GitHub"
echo ""
echo "Введи GitHub Personal Access Token (один раз, потом будет работать автоматически):"
echo "Создай токен: https://github.com/settings/tokens"
echo "Scope: repo"
echo ""
read -s TOKEN

if [ -z "$TOKEN" ]; then
    echo "❌ Токен не введен"
    exit 1
fi

echo ""
echo "Отправляю изменения..."
git push https://${TOKEN}@github.com/ekupaev1-del/step-one-app.git dev

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ УСПЕХ! Push выполнен!"
    echo "Токен сохранен в keychain - дальше все будет работать автоматически"
    echo "Просто делай: git push origin dev"
else
    echo ""
    echo "❌ Ошибка при push"
    exit 1
fi
