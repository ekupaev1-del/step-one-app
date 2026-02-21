# Скрипт для настройки автоматического деплоя в Vercel

Write-Host "🚀 Настройка автоматического деплоя в Vercel..." -ForegroundColor Green
Write-Host ""

# Проверяем, установлен ли Vercel CLI
Write-Host "📦 Проверка Vercel CLI..." -ForegroundColor Cyan
try {
    $vercelVersion = vercel --version 2>&1
    Write-Host "  ✅ Vercel CLI установлен: $vercelVersion" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Vercel CLI не установлен. Устанавливаю..." -ForegroundColor Yellow
    npm install -g vercel
}

# Проверяем авторизацию
Write-Host ""
Write-Host "🔐 Проверка авторизации в Vercel..." -ForegroundColor Cyan
try {
    $whoami = vercel whoami 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Авторизован как: $whoami" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Требуется авторизация..." -ForegroundColor Yellow
        Write-Host "  Откроется браузер для авторизации..." -ForegroundColor Yellow
        vercel login
    }
} catch {
    Write-Host "  ⚠️  Требуется авторизация..." -ForegroundColor Yellow
    vercel login
}

Write-Host ""
Write-Host "📋 Настройка проекта..." -ForegroundColor Cyan
Write-Host "  Следуйте инструкциям:" -ForegroundColor Yellow
Write-Host "  1. Выберите 'Link to existing project' или 'Create new project'" -ForegroundColor White
Write-Host "  2. Если создаете новый проект, укажите имя (например: step-one-app)" -ForegroundColor White
Write-Host "  3. Root Directory: miniapp (или оставьте пустым, если уже в miniapp)" -ForegroundColor White
Write-Host ""

# Переходим в директорию miniapp
Set-Location miniapp

# Подключаем проект
Write-Host "🔗 Подключение проекта к Vercel..." -ForegroundColor Cyan
vercel link

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "✅ Проект подключен к Vercel!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Следующие шаги:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Настройте Git integration в Vercel Dashboard:" -ForegroundColor White
Write-Host "   → https://vercel.com/dashboard" -ForegroundColor Gray
Write-Host "   → Settings → Git → Connect Repository" -ForegroundColor Gray
Write-Host "   → Выберите: ekupaev1-del/step-one-app" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Укажите настройки проекта:" -ForegroundColor White
Write-Host "   → Root Directory: miniapp" -ForegroundColor Gray
Write-Host "   → Production Branch: main" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Добавьте переменные окружения:" -ForegroundColor White
Write-Host "   → Settings → Environment Variables" -ForegroundColor Gray
Write-Host "   → Добавьте: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, и т.д." -ForegroundColor Gray
Write-Host ""
Write-Host "4. После настройки Git integration:" -ForegroundColor White
Write-Host "   → Каждый push в GitHub автоматически запустит деплой!" -ForegroundColor Green
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

# Возвращаемся в корневую директорию
Set-Location ..
