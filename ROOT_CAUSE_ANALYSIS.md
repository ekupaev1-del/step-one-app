# Root Cause Analysis: Database Errors After Supabase Project Recreation

## 🔍 Identified Root Causes

### 1. **Missing Database Schema** ⚠️ PRIMARY ISSUE
- **Problem**: New Supabase project has no tables (users, diary, app_logs, etc.)
- **Impact**: All database operations fail with "relation does not exist" (error code `42P01`)
- **Solution**: Run migration `supabase/migrations/0001_init.sql` in Supabase SQL Editor

### 2. **Supabase Key Usage** ✅ VERIFIED CORRECT
- **Status**: Code correctly uses:
  - `SUPABASE_SERVICE_ROLE_KEY` for server-side operations (bot, API routes)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` for client-side operations
- **No changes needed**

### 3. **RLS Policies** ✅ VERIFIED CORRECT
- **Status**: Migration includes proper RLS policies that allow `service_role` full access
- **Policies**: All tables have `*_service` policies for INSERT/UPDATE/DELETE using `auth.role() = 'service_role'`
- **No changes needed**

### 4. **Environment Variables** ⚠️ MUST VERIFY
- **Problem**: Variables may not be set in Vercel Production
- **Required Variables**:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `TELEGRAM_BOT_TOKEN`
  - `OPENAI_API_KEY` (if used)
- **Solution**: See `VERCEL_ENV_CHECKLIST.md`

### 5. **Error Logging** ✅ IMPROVED
- **Before**: Basic console.error with limited context
- **After**: Structured JSON logging with requestId, operation, table, error code/details/hint
- **Benefit**: Easier debugging in Vercel logs

### 6. **User-Friendly Error Messages** ✅ IMPROVED
- **Before**: Generic "Database error" message
- **After**: Specific messages based on error code (e.g., "Таблица не найдена" for `42P01`)
- **Benefit**: Better user experience, includes requestId for support

## 📋 Action Items

### Immediate (Required)
1. ✅ **Run SQL Migration**: Execute `supabase/migrations/0001_init.sql` in Supabase SQL Editor
2. ✅ **Verify Environment Variables**: Check Vercel Production has all required variables (see `VERCEL_ENV_CHECKLIST.md`)
3. ✅ **Test Health Endpoint**: `GET /api/health/db` should return `ok: true`
4. ✅ **Test Bot**: Send `/start` to Telegram bot

### Verification Steps
1. **Check Vercel Logs**: After deployment, check logs for structured JSON entries
2. **Test Database Operations**:
   - `/start` command creates/finds user
   - Diary entry insert works
   - No "relation does not exist" errors

## 🎯 Expected Outcomes

After fixes:
- ✅ `/start` command works without database errors
- ✅ Diary entries save successfully
- ✅ Structured logs appear in Vercel with requestId
- ✅ User-friendly error messages in Telegram
- ✅ `/api/health/db` returns `ok: true`

## 📊 Error Code Reference

Common Postgres error codes:
- `42P01`: Relation (table) does not exist
- `23505`: Unique constraint violation
- `23503`: Foreign key constraint violation
- `23514`: Check constraint violation

## 🔗 Related Files

- `supabase/migrations/0001_init.sql` - Complete schema migration
- `VERCEL_ENV_CHECKLIST.md` - Environment variables guide
- `bot/src/lib/dbLogger.ts` - Shared logging utility
- `miniapp/app/api/health/db/route.ts` - Diagnostic endpoint
