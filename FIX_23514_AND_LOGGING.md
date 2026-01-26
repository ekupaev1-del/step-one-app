# Fix for PostgreSQL Error 23514 and App Logs Schema Issues

## Root Causes

### Issue 1: Error 23514 - CHECK constraint violation
- **Error**: `new row for relation 'diary' violates check constraint 'diary_source_check'`
- **Cause**: Code inserts `source = 'telegram'` but the CHECK constraint doesn't allow this value
- **Location**: `diary` table, `source` column

### Issue 2: PostgREST Error PGRST204
- **Error**: `Could not find the 'chat_id' column of 'app_logs' in the schema cache`
- **Cause**: Code tries to insert `chat_id` into `app_logs` table, but the column doesn't exist
- **Location**: `app_logs` table

## Solution Implemented

### 1. SQL Migration (`migrations/20250102_fix_diary_source_constraint_and_app_logs.sql`)

**Fixes:**
- Drops existing `diary_source_check` constraint
- Recreates it with allowed values: `'telegram'`, `'webapp'`, `'admin'`, `'api'`
- Adds optional `input_kind` column to diary (for tracking text/photo/voice)
- Ensures `app_logs` table exists with correct schema (NO `chat_id` column)
- Adds missing columns (`message`, `meta`) if they don't exist
- Creates proper indexes

**Key Changes:**
```sql
-- Fix source constraint
ALTER TABLE public.diary DROP CONSTRAINT IF EXISTS diary_source_check;
ALTER TABLE public.diary 
  ADD CONSTRAINT diary_source_check 
  CHECK (source IN ('telegram', 'webapp', 'admin', 'api'));

-- Ensure app_logs has correct schema (no chat_id)
CREATE TABLE IF NOT EXISTS public.app_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  source TEXT NOT NULL,
  request_id TEXT,
  user_id BIGINT,
  telegram_user_id BIGINT,
  message TEXT,
  meta JSONB DEFAULT '{}'::jsonb
);
```

### 2. Code Changes

**Updated Files:**
- `miniapp/lib/logging.ts` - Removed `chatId` from logEntry, uses `meta` JSONB for additional data
- `bot/src/services/logging.ts` - Same changes, aligned with miniapp version
- `miniapp/app/api/telegram/webhook/route.ts` - Enhanced error logging, removed `chatId` from logEvent calls
- `bot/src/index.ts` - Removed `chatId` from logError calls

**Key Changes:**
1. **Logging**: No longer inserts `chat_id` (not in schema). Stores it in `meta` JSONB if needed.
2. **Error Logging**: Enhanced with full Postgres error details (code, message, details, hint, constraint, table, column)
3. **Console Logging**: Always logs to console first (for Vercel), then attempts DB insert
4. **Error Messages**: Include Postgres error code (e.g., "Код: 23514")

## Files Changed

### New Files:
- `migrations/20250102_fix_diary_source_constraint_and_app_logs.sql`

### Modified Files:
- `miniapp/lib/logging.ts`
- `bot/src/services/logging.ts`
- `miniapp/app/api/telegram/webhook/route.ts`
- `bot/src/index.ts`

## Verification Checklist

After deploying and running migration:

1. **Run Migration in Supabase SQL Editor**
   ```sql
   -- Execute: migrations/20250102_fix_diary_source_constraint_and_app_logs.sql
   ```

2. **Verify Constraint Fixed**
   ```sql
   SELECT conname, pg_get_constraintdef(oid) 
   FROM pg_constraint 
   WHERE conname = 'diary_source_check';
   -- Should show: CHECK (source IN ('telegram', 'webapp', 'admin', 'api'))
   ```

3. **Verify app_logs Schema**
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_schema = 'public' 
     AND table_name = 'app_logs'
   ORDER BY ordinal_position;
   -- Should NOT have chat_id column
   -- Should have: id, created_at, level, source, request_id, user_id, telegram_user_id, message, meta
   ```

4. **Test Telegram Bot**
   - Send message: "2 вареных яйца"
   - **Expected**: Bot responds with food analysis
   - **Check Vercel logs**: Should see `[DB_INSERT_SUCCESS:req-...]`
   - **Check diary table**: Row should exist with `source = 'telegram'`

5. **Verify Logging Works**
   ```sql
   SELECT level, source, request_id, user_id, telegram_user_id, created_at
   FROM app_logs
   ORDER BY created_at DESC
   LIMIT 10;
   -- Should show recent log entries
   ```

6. **Check for Errors**
   - No `23514` errors in Vercel logs
   - No `PGRST204` errors about `chat_id`
   - All errors include Postgres error code in user messages

## Expected Behavior

### Before Fix:
- ❌ Food messages fail with error 23514
- ❌ Logging fails with PGRST204 (chat_id not found)
- ❌ Errors are not visible in logs

### After Fix:
- ✅ Food messages save successfully with `source = 'telegram'`
- ✅ Logging works (no chat_id errors)
- ✅ Full error details in Vercel logs and app_logs table
- ✅ User-friendly error messages with error codes

## Summary

**Root Cause 1**: CHECK constraint `diary_source_check` didn't allow `'telegram'` value  
**Fix 1**: Updated constraint to allow `'telegram'`, `'webapp'`, `'admin'`, `'api'`

**Root Cause 2**: Code tried to insert `chat_id` into `app_logs` table that doesn't have this column  
**Fix 2**: Removed `chat_id` from all logging inserts, store in `meta` JSONB if needed

**Result**: Food saving works, logging works, full observability restored.
