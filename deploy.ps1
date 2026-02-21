# Скрипт для автоматического деплоя в Vercel (PowerShell)
# Использование: .\deploy.ps1 [production|preview]

param(
    [string]$Env = "preview"
)

$ErrorActionPreference = "Stop"

$Branch = git branch --show-current

Write-Host "🚀 Начинаю деплой в Vercel..." -ForegroundColor Green
Write-Host "📦 Окружение: $Env" -ForegroundColor Cyan
Write-Host "🌿 Ветка: $Branch" -ForegroundColor Cyan

# Переходим в директорию miniapp
Set-Location miniapp

# Проверяем, установлен ли Vercel CLI
try {
    $null = Get-Command vercel -ErrorAction Stop
} catch {
    Write-Host "📦 Устанавливаю Vercel CLI..." -ForegroundColor Yellow
    npm install -g vercel
}

# Проверяем, авторизованы ли мы в Vercel
try {
    $null = vercel whoami 2>&1
} catch {
    Write-Host "🔐 Требуется авторизация в Vercel..." -ForegroundColor Yellow
    vercel login
}

# Деплоим
if ($Env -eq "production") {
    Write-Host "🚀 Деплою в production..." -ForegroundColor Green
    vercel --prod
} else {
    Write-Host "🚀 Деплою в preview..." -ForegroundColor Green
    vercel
}

Write-Host "✅ Деплой завершён!" -ForegroundColor Green

# Возвращаемся в корневую директорию
Set-Location ..
