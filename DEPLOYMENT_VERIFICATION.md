# Deployment Verification Guide

## Root Cause Analysis

### Problem
Changes pushed to `main` branch are not reflected in production Mini App opened via Telegram.

### Root Causes Identified & Fixed:

1. **Service Worker Caching** ✅ FIXED
   - Service worker was caching ALL pages including `/profile`
   - Fixed: Updated `sw.js` to use network-first for pages, cache-only for static assets
   - Cache version updated to `v2` to force cache invalidation

2. **Missing Build Stamp** ✅ FIXED
   - No way to verify which deployment is actually loaded
   - Fixed: Added build stamp in `layout.tsx` showing git SHA, environment, and date

3. **Page Caching** ✅ FIXED
   - Profile page might be statically generated
   - Fixed: Added `export const dynamic = 'force-dynamic'` and `revalidate = 0`

4. **Bot URL Verification** ✅ FIXED
   - No logging to verify which URL bot is using
   - Fixed: Added detailed logging in `getMainMenuKeyboard()` and `sendMainMenu()`

## Verification Steps

### 1. Check Bot Logs
When bot sends menu, you should see:
```
[sendMainMenu] ========== MINI APP URL DEBUG ==========
[sendMainMenu] MINIAPP_BASE_URL from env: https://step-one-app-emins-projects-4717eabc.vercel.app
[sendMainMenu] Final baseUrl: https://step-one-app-emins-projects-4717eabc.vercel.app
[sendMainMenu] URL matches production: true
```

### 2. Check Build Stamp
Open Mini App via Telegram → Open DevTools (if possible) or check bottom-right corner:
- Should show: `build: <7-char-sha> | env: production | <date>`
- This proves which exact deployment is loaded

### 3. Verify Vercel Settings
In Vercel Dashboard:
- Settings → General → Root Directory: `miniapp`
- Settings → Git → Production Branch: `main`
- Deployments → Last deployment from `main` should be status "Ready"

### 4. Clear Service Worker Cache
If still seeing old version:
1. Open Mini App in Telegram
2. Open DevTools (if possible)
3. Application → Service Workers → Unregister
4. Application → Storage → Clear site data
5. Reload Mini App

## Files Changed

1. `miniapp/public/sw.js` - Fixed caching strategy
2. `miniapp/app/layout.tsx` - Added build stamp
3. `miniapp/app/profile/page.tsx` - Added dynamic rendering
4. `miniapp/next.config.ts` - Added Vercel env vars
5. `bot/src/index.ts` - Added URL verification logging

## Expected Production URL

**Production Domain:**
```
https://step-one-app-emins-projects-4717eabc.vercel.app
```

**Bot .env should have:**
```
MINIAPP_BASE_URL=https://step-one-app-emins-projects-4717eabc.vercel.app
```

## Next Steps After Deploy

1. Push changes to `main`
2. Wait for Vercel deployment (check Dashboard)
3. Check bot logs - verify URL is correct
4. Open Mini App via Telegram
5. Check build stamp - verify it matches latest commit
6. Verify green "Ваши нормы" card appears

