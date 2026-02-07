# NOTE: This script is disabled in favor of Vercel's native Git integration.
# Vercel automatically deploys on every push to GitHub when Git integration is connected.
# 
# To use Vercel CLI instead (not recommended):
#   1. Install: npm install -g vercel
#   2. Login: vercel login
#   3. Deploy: vercel --prod
#
# However, native Git integration is simpler and doesn't require CLI setup.
# See DEPLOYMENT.md for the recommended approach.

Write-Host "⚠️  This script is disabled." -ForegroundColor Yellow
Write-Host ""
Write-Host "Vercel uses native Git integration for automatic deployments." -ForegroundColor Cyan
Write-Host "Just push to GitHub main branch and Vercel will deploy automatically." -ForegroundColor Cyan
Write-Host ""
Write-Host "See DEPLOYMENT.md for details." -ForegroundColor Cyan
Write-Host ""
Write-Host "If you need to use CLI, run: vercel --prod" -ForegroundColor Gray
