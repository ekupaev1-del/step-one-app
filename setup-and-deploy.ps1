# Полная настройка и автоматический деплой на Vercel
# Запустите из корня проекта: .\setup-and-deploy.ps1

Write-Host "🚀 Настройка и автоматический деплой на Vercel" -ForegroundColor Green
Write-Host ""

# Проверка Vercel CLI
try {
    $vercelVersion = vercel --version 2>&1
    Write-Host "✅ Vercel CLI: $vercelVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Vercel CLI не установлен" -ForegroundColor Red
    Write-Host "Установите: npm install -g vercel" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Переход в папку miniapp
if (-not (Test-Path "miniapp")) {
    Write-Host "❌ Папка miniapp не найдена" -ForegroundColor Red
    Write-Host "Запустите скрипт из корня проекта step-one-app" -ForegroundColor Yellow
    exit 1
}

Push-Location "miniapp"
Write-Host "📁 Переход в папку miniapp" -ForegroundColor Cyan
Write-Host ""

# Проверка авторизации
Write-Host "🔐 Проверка авторизации в Vercel..." -ForegroundColor Cyan
try {
    $whoami = vercel whoami 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Авторизован как: $whoami" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Необходима авторизация" -ForegroundColor Yellow
        Write-Host "Откроется браузер для авторизации..." -ForegroundColor Yellow
        vercel login
    }
} catch {
    Write-Host "⚠️  Необходима авторизация" -ForegroundColor Yellow
    Write-Host "Откроется браузер для авторизации..." -ForegroundColor Yellow
    vercel login
}

Write-Host ""

# Проверка связи с проектом
Write-Host "🔗 Проверка связи с проектом Vercel..." -ForegroundColor Cyan
if (-not (Test-Path ".vercel")) {
    Write-Host "⚠️  Проект не связан с Vercel" -ForegroundColor Yellow
    Write-Host "Связываю проект..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Выберите:" -ForegroundColor Cyan
    Write-Host "  1. Связать с существующим проектом" -ForegroundColor Cyan
    Write-Host "  2. Создать новый проект" -ForegroundColor Cyan
    Write-Host ""
    vercel link
} else {
    Write-Host "✅ Проект уже связан" -ForegroundColor Green
    $projectInfo = Get-Content ".vercel/project.json" -ErrorAction SilentlyContinue
    if ($projectInfo) {
        Write-Host "   $projectInfo" -ForegroundColor Gray
    }
}

Write-Host ""

# Проверка переменных окружения
Write-Host "📋 Проверка переменных окружения..." -ForegroundColor Cyan
$envVars = vercel env ls 2>&1 | Out-String

$requiredVars = @("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY")
$missingVars = @()

foreach ($var in $requiredVars) {
    if ($envVars -notmatch $var) {
        $missingVars += $var
    }
}

if ($missingVars.Count -gt 0) {
    Write-Host "⚠️  Отсутствуют переменные окружения:" -ForegroundColor Yellow
    foreach ($var in $missingVars) {
        Write-Host "   - $var" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Добавьте их через команды:" -ForegroundColor Yellow
    foreach ($var in $missingVars) {
        Write-Host "   vercel env add $var production preview development" -ForegroundColor Cyan
    }
    Write-Host ""
    $addNow = Read-Host "Добавить переменные сейчас? (y/n)"
    if ($addNow -eq "y" -or $addNow -eq "Y") {
        foreach ($var in $missingVars) {
            Write-Host ""
            Write-Host "Добавление $var..." -ForegroundColor Cyan
            Write-Host "Введите значение для всех окружений (production, preview, development):" -ForegroundColor Yellow
            vercel env add $var production preview development
        }
    } else {
        Write-Host ""
        $continue = Read-Host "Продолжить деплой без этих переменных? (y/n)"
        if ($continue -ne "y" -and $continue -ne "Y") {
            Pop-Location
            exit 1
        }
    }
} else {
    Write-Host "✅ Все переменные окружения установлены" -ForegroundColor Green
}

Write-Host ""

# Деплой
Write-Host "📦 Начинаю деплой на production..." -ForegroundColor Cyan
Write-Host ""

try {
    vercel --prod --yes
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Деплой успешно завершен!" -ForegroundColor Green
        Write-Host ""
        Write-Host "🌐 Проверьте ваш проект на Vercel Dashboard" -ForegroundColor Cyan
        Write-Host "   https://vercel.com/dashboard" -ForegroundColor Cyan
    } else {
        Write-Host ""
        Write-Host "❌ Ошибка при деплое" -ForegroundColor Red
        Pop-Location
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "❌ Ошибка при деплое: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}

Pop-Location
Write-Host ""
Write-Host "🎉 Готово!" -ForegroundColor Green
