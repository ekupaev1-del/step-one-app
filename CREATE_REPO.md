# 🔧 ИНСТРУКЦИЯ: Создать репозиторий на GitHub

## ШАГ 1: Создай репозиторий на GitHub

1. Зайди на https://github.com/new
2. Repository name: `step-one-app`
3. Выбери Public или Private
4. НЕ добавляй README, .gitignore, лицензию (у нас уже всё есть)
5. Нажми "Create repository"

## ШАГ 2: После создания GitHub покажет команды

Скопируй URL репозитория (будет что-то вроде):
`https://github.com/ekupaev1-del/step-one-app.git`

## ШАГ 3: Подключи remote

```bash
cd /Users/eminkupaev/Desktop/step-one-app
git remote add origin https://github.com/ekupaev1-del/step-one-app.git
```

## ШАГ 4: Запушь

```bash
git push -u origin main
git push -u origin dev
```

Готово! 🎉
