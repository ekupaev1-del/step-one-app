#!/bin/bash

# Скрипт для восстановления автоматического push
# После первого использования токен сохранится и все будет работать автоматически

echo "🔧 Восстановление автоматического push"
echo ""
echo "Это нужно сделать ОДИН РАЗ. После этого все будет работать автоматически!"
echo ""

# Настраиваем credential helper
git config --global credential.helper osxkeychain
git config --local credential.helper osxkeychain

echo "✅ Credential helper настроен"
echo ""
echo "📝 Инструкция:"
echo ""
echo "1. Создай Personal Access Token на GitHub:"
echo "   https://github.com/settings/tokens"
echo "   - Нажми 'Generate new token (classic)'"
echo "   - Название: step-one-app"
echo "   - Scope: выбери 'repo' (полный доступ)"
echo "   - Нажми 'Generate token'"
echo "   - СКОПИРУЙ ТОКЕН (он показывается только один раз!)"
echo ""
echo "2. Выполни эту команду (замени <TOKEN> на свой токен):"
echo ""
echo "   git push https://<TOKEN>@github.com/ekupaev1-del/step-one-app.git dev"
echo ""
echo "3. После первого успешного push:"
echo "   - Токен сохранится в macOS Keychain"
echo "   - Все последующие push будут работать автоматически"
echo "   - Просто делай: git push origin dev"
echo ""
echo "🎉 Готово! После этого все будет работать как раньше!"
