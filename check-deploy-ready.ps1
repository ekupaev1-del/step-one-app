# Скрипт проверки готовности к деплою в Vercel

Write-Host "🔍 Проверка готовности к деплою в Vercel..." -ForegroundColor Cyan
Write-Host ""

$errors = @()
$warnings = @()

# Проверка 1: vercel.json существует
Write-Host "✓ Проверка vercel.json..." -ForegroundColor Yellow
if (Test-Path "vercel.json") {
    Write-Host "  ✅ vercel.json найден" -ForegroundColor Green
    $vercelConfig = Get-Content "vercel.json" | ConvertFrom-Json
    if ($vercelConfig.rootDirectory -eq "miniapp") {
        Write-Host "  ✅ rootDirectory = miniapp" -ForegroundColor Green
    } else {
        $errors += "rootDirectory должен быть 'miniapp'"
        Write-Host "  ❌ rootDirectory неверный" -ForegroundColor Red
    }
} else {
    $errors += "vercel.json не найден"
    Write-Host "  ❌ vercel.json не найден" -ForegroundColor Red
}

# Проверка 2: miniapp директория существует
Write-Host "✓ Проверка директории miniapp..." -ForegroundColor Yellow
if (Test-Path "miniapp") {
    Write-Host "  ✅ Директория miniapp найдена" -ForegroundColor Green
} else {
    $errors += "Директория miniapp не найдена"
    Write-Host "  ❌ Директория miniapp не найдена" -ForegroundColor Red
}

# Проверка 3: package.json в miniapp
Write-Host "✓ Проверка package.json..." -ForegroundColor Yellow
if (Test-Path "miniapp/package.json") {
    Write-Host "  ✅ package.json найден" -ForegroundColor Green
    $packageJson = Get-Content "miniapp/package.json" | ConvertFrom-Json
    if ($packageJson.scripts.build) {
        Write-Host "  ✅ Скрипт build найден" -ForegroundColor Green
    } else {
        $errors += "Скрипт build не найден в package.json"
        Write-Host "  ❌ Скрипт build не найден" -ForegroundColor Red
    }
} else {
    $errors += "package.json не найден в miniapp"
    Write-Host "  ❌ package.json не найден" -ForegroundColor Red
}

# Проверка 4: GitHub Actions workflow
Write-Host "✓ Проверка GitHub Actions..." -ForegroundColor Yellow
if (Test-Path ".github/workflows/deploy.yml") {
    Write-Host "  ✅ GitHub Actions workflow найден" -ForegroundColor Green
} else {
    $warnings += "GitHub Actions workflow не найден (опционально)"
    Write-Host "  ⚠️  GitHub Actions workflow не найден (опционально)" -ForegroundColor Yellow
}

# Проверка 5: Git репозиторий
Write-Host "✓ Проверка Git репозитория..." -ForegroundColor Yellow
try {
    $gitRemote = git remote get-url origin 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Git remote настроен: $gitRemote" -ForegroundColor Green
    } else {
        $warnings += "Git remote не настроен"
        Write-Host "  ⚠️  Git remote не настроен" -ForegroundColor Yellow
    }
} catch {
    $warnings += "Git не инициализирован"
    Write-Host "  ⚠️  Git не инициализирован" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

# Итоги
if ($errors.Count -eq 0) {
    Write-Host "✅ ВСЁ ГОТОВО К ДЕПЛОЮ!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Следующие шаги:" -ForegroundColor Cyan
    Write-Host "  1. Откройте https://vercel.com/new" -ForegroundColor White
    Write-Host "  2. Подключите GitHub репозиторий" -ForegroundColor White
    Write-Host "  3. Укажите Root Directory: miniapp" -ForegroundColor White
    Write-Host "  4. Добавьте переменные окружения" -ForegroundColor White
    Write-Host "  5. Нажмите Deploy" -ForegroundColor White
    Write-Host ""
    Write-Host "📖 Подробная инструкция: АВТОМАТИЧЕСКИЙ_ДЕПЛОЙ.md" -ForegroundColor Cyan
} else {
    Write-Host "❌ НАЙДЕНЫ ОШИБКИ:" -ForegroundColor Red
    foreach ($error in $errors) {
        Write-Host "  • $error" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "⚠️  Исправьте ошибки перед деплоем" -ForegroundColor Yellow
}

if ($warnings.Count -gt 0) {
    Write-Host ""
    Write-Host "⚠️  ПРЕДУПРЕЖДЕНИЯ:" -ForegroundColor Yellow
    foreach ($warning in $warnings) {
        Write-Host "  • $warning" -ForegroundColor Yellow
    }
}

Write-Host ""
