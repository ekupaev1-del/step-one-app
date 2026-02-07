# Скрипт для деплоя на Vercel (PowerShell)

Write-Host "🚀 Деплой на Vercel..." -ForegroundColor Green

# Проверка наличия Vercel CLI
try {
    $vercelVersion = vercel --version 2>&1
    Write-Host "✅ Vercel CLI установлен: $vercelVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Vercel CLI не установлен" -ForegroundColor Red
    Write-Host "Установите: npm install -g vercel" -ForegroundColor Yellow
    exit 1
}

# Проверка переменных окружения
Write-Host "`n📋 Проверка переменных окружения..." -ForegroundColor Cyan

$requiredVars = @(
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY"
)

$missingVars = @()

foreach ($var in $requiredVars) {
    $envCheck = vercel env ls 2>&1 | Select-String -Pattern $var
    if (-not $envCheck) {
        $missingVars += $var
    }
}

if ($missingVars.Count -gt 0) {
    Write-Host "⚠️  Отсутствуют переменные окружения:" -ForegroundColor Yellow
    foreach ($var in $missingVars) {
        Write-Host "   - $var" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Добавьте их через: vercel env add $var" -ForegroundColor Yellow
    $continue = Read-Host "Продолжить деплой? (y/n)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        exit 1
    }
}

# Деплой
Write-Host "`n📦 Деплой проекта..." -ForegroundColor Cyan
vercel --prod

Write-Host "`n✅ Деплой завершен!" -ForegroundColor Green
Write-Host "🌐 Проверьте ваш проект на Vercel Dashboard" -ForegroundColor Cyan
