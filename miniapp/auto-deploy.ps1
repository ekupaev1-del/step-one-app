# Автоматический деплой на Vercel
# Запустите: cd miniapp; .\auto-deploy.ps1

Write-Host "🚀 Автоматический деплой на Vercel" -ForegroundColor Green
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

# Проверка авторизации
Write-Host "🔐 Проверка авторизации..." -ForegroundColor Cyan
$whoami = vercel whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Необходима авторизация" -ForegroundColor Yellow
    Write-Host "Запустите: vercel login" -ForegroundColor Yellow
    vercel login
}

Write-Host "✅ Авторизован как: $whoami" -ForegroundColor Green
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
    Write-Host "Добавьте их через:" -ForegroundColor Yellow
    foreach ($var in $missingVars) {
        Write-Host "   vercel env add $var" -ForegroundColor Cyan
    }
    Write-Host ""
    $continue = Read-Host "Продолжить деплой без этих переменных? (y/n)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        exit 1
    }
} else {
    Write-Host "✅ Все переменные окружения установлены" -ForegroundColor Green
}

Write-Host ""

# Деплой
Write-Host "📦 Начинаю деплой..." -ForegroundColor Cyan
Write-Host ""

$deployResult = vercel --prod --yes 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Деплой успешно завершен!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🌐 Проверьте ваш проект на Vercel Dashboard" -ForegroundColor Cyan
    Write-Host "   https://vercel.com/dashboard" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "❌ Ошибка при деплое" -ForegroundColor Red
    Write-Host $deployResult -ForegroundColor Red
    exit 1
}
