#!/bin/bash

# Скрипт для восстановления автоматического push
# Этот скрипт поможет настроить аутентификацию для git push

echo "🔧 Восстановление автоматического push в GitHub"
echo ""

# Проверяем текущую конфигурацию
echo "Текущая конфигурация:"
git config --local --get-regexp "credential|remote" | head -5
echo ""

# Настраиваем credential helper
echo "Настраиваем credential helper..."
git config --global credential.helper osxkeychain
git config --local credential.helper osxkeychain

echo ""
echo "✅ Credential helper настроен"
echo ""
echo "Теперь попробуй сделать push:"
echo "  git push origin dev"
echo ""
echo "Если появится запрос на аутентификацию:"
echo "  1. Username: твой GitHub username"
echo "  2. Password: используй Personal Access Token (не пароль!)"
echo "     Создай токен: https://github.com/settings/tokens"
echo "     Scope: repo (полный доступ)"
echo ""
echo "После первого успешного push, credentials сохранятся в keychain"
echo "и все последующие push будут работать автоматически!"
