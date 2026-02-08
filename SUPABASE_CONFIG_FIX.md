# Supabase Configuration Fix - Summary

## Issues Fixed

### 1. Wrong Supabase Project URL
**Problem**: Application was connecting to wrong project (`ppisnuivnswwpkoxwpef` instead of `ipgxnqplwzptxyfjjsrr`)

**Solution**: 
- Created shared config module `lib/supabase-config.ts` with single source of truth
- Added guard to detect and reject wrong project URL
- All code now uses shared config module

### 2. Vercel Build Errors
**Problem**: `Module not found: Can't resolve '../../../lib/supabase/server'`

**Solution**:
- Replaced all relative imports with `@/` alias
- Updated 15+ API route files
- `tsconfig.json` already has `@/*` path mapping configured

### 3. Dynamic Import Extension
**Problem**: `import('./dbLogger.js')` pointing to TypeScript file

**Solution**: Already fixed - uses `import('./dbLogger')` without extension

## Modified Files

### New Files
- `lib/supabase-config.ts` - Shared Supabase configuration module

### Modified Files
- `bot/src/config/env.ts` - Uses shared config module
- `miniapp/lib/supabase/server.ts` - Uses shared config module
- `miniapp/lib/supabase/client.ts` - Uses shared config module
- `miniapp/lib/supabaseAdmin.ts` - Uses shared config module
- `miniapp/app/api/save/route.ts` - Fixed import to use `@/` alias
- `miniapp/app/api/user/route.ts` - Fixed import to use `@/` alias
- `miniapp/app/api/water/add/route.ts` - Fixed import to use `@/` alias
- `miniapp/app/api/recommendations/route.ts` - Fixed import to use `@/` alias
- `miniapp/app/api/report/monthly/route.ts` - Fixed import to use `@/` alias
- `miniapp/app/api/report/day/route.ts` - Fixed import to use `@/` alias
- `miniapp/app/api/report/calendar/route.ts` - Fixed import to use `@/` alias
- `miniapp/app/api/meals/route.ts` - Fixed import to use `@/` alias
- `miniapp/app/api/meals/[id]/route.ts` - Fixed import to use `@/` alias
- `miniapp/app/api/meal/update/route.ts` - Fixed import to use `@/` alias
- `miniapp/app/api/meal/delete/route.ts` - Fixed import to use `@/` alias
- `miniapp/app/api/profile/update/route.ts` - Fixed import to use `@/` alias
- `miniapp/app/api/profile/avatar/route.ts` - Fixed import to use `@/` alias
- `miniapp/app/api/profile/delete/route.ts` - Fixed import to use `@/` alias
- `miniapp/app/api/privacy/consent/route.ts` - Fixed import to use `@/` alias
- `miniapp/app/api/privacy/check/route.ts` - Fixed import to use `@/` alias
- `miniapp/app/api/notify-bot/route.ts` - Fixed import to use `@/` alias

## Environment Variables Required

### For Bot (local .env or production)
```
SUPABASE_URL=https://ipgxnqplwzptxyfjjsrr.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
TELEGRAM_BOT_TOKEN=<your-bot-token>
OPENAI_API_KEY=<your-openai-key>
```

### For Miniapp (Vercel environment variables)
```
NEXT_PUBLIC_SUPABASE_URL=https://ipgxnqplwzptxyfjjsrr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
TELEGRAM_BOT_TOKEN=<your-bot-token>
OPENAI_API_KEY=<your-openai-key>
```

**IMPORTANT**: 
- Bot uses `SUPABASE_URL` (not `NEXT_PUBLIC_SUPABASE_URL`)
- Miniapp uses `NEXT_PUBLIC_SUPABASE_URL` (for client-side) and `SUPABASE_SERVICE_ROLE_KEY` (for server-side)
- Both must point to the **correct** project: `https://ipgxnqplwzptxyfjjsrr.supabase.co`
- The application will **NOT start** if wrong project URL is detected

## Verification Checklist

### 1. Check Bot Startup
```bash
cd bot
npm run dev
```

Expected output:
```
[bot] production (NODE_ENV=development) | URL=https://ipgxnqplwzptxyfjjsrr.supabase.co | project=ipgxnqplwzptxyfjjsrr | key=service_role(abc123...xyz)
✅ Environment validation passed
```

If you see `ppisnuivnswwpkoxwpef` in the URL, the application will fail with a clear error message.

### 2. Check Miniapp Build
```bash
cd miniapp
npm run build
```

Should complete without import errors. Check for:
- ✅ No "Module not found" errors
- ✅ No "Can't resolve" errors
- ✅ Build completes successfully

### 3. Check Runtime Connection
After deployment, check logs for:
```
[supabase/server] production (VERCEL_ENV=production) | URL=https://ipgxnqplwzptxyfjjsrr.supabase.co | project=ipgxnqplwzptxyfjjsrr | key=service_role(abc123...xyz)
```

### 4. Test Database Operations
- `/start` command in bot should work
- Food logging should work
- Reports should generate
- No "column does not exist" errors
- No "table not found in schema cache" errors

## How It Works

1. **Shared Config Module** (`lib/supabase-config.ts`):
   - Validates URL format
   - Rejects wrong project URL (`ppisnuivnswwpkoxwpef`)
   - Validates key types (service_role vs anon)
   - Logs safe diagnostics (no secrets)

2. **Bot Configuration** (`bot/src/config/env.ts`):
   - Uses `SUPABASE_URL` from environment
   - Calls `getSupabaseServerConfig()` from shared module
   - Validates and logs on startup

3. **Miniapp Configuration**:
   - Server-side: Uses `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
   - Client-side: Uses `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Both use shared config module

4. **Import Paths**:
   - All API routes use `@/lib/supabase/server` (not relative paths)
   - `tsconfig.json` maps `@/*` to `./*` (miniapp root)

## Error Messages

If wrong project URL is detected, you'll see:
```
❌ CRITICAL: Wrong Supabase project detected!
   Current URL points to OLD project: https://ppisnuivnswwpkoxwpef.supabase.co
   Project ref: ppisnuivnswwpkoxwpef
   Expected project ref: ipgxnqplwzptxyfjjsrr
   
   Fix: Update SUPABASE_URL to point to the correct project:
   SUPABASE_URL=https://ipgxnqplwzptxyfjjsrr.supabase.co
```

The application will **NOT start** until the correct URL is configured.
