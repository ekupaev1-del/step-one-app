#!/bin/bash

# Автоматическое добавление SSH ключа в GitHub
SSH_KEY=$(cat ~/.ssh/id_ed25519.pub)
KEY_TITLE="step-one-app-$(hostname)-$(date +%Y%m%d)"

echo "🔑 SSH ключ для добавления в GitHub:"
echo ""
echo "$SSH_KEY"
echo ""
echo "📝 Инструкция (быстро):"
echo ""
echo "1. Открой: https://github.com/settings/ssh/new"
echo "2. Title: $KEY_TITLE"
echo "3. Key: скопируй ключ выше"
echo "4. Нажми 'Add SSH key'"
echo ""
echo "Или выполни эту команду (если у тебя есть GitHub CLI):"
echo "  gh auth login"
echo "  gh ssh-key add ~/.ssh/id_ed25519.pub --title '$KEY_TITLE'"
echo ""
echo "После добавления ключа push будет работать автоматически!"
