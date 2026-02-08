# Database Diagnostics and Fix - Complete Guide

## What Was Wrong

### Primary Issues:
1. **Schema Mismatch**: After recreating Supabase project, the database schema was incomplete:
   - `users.calories` column missing → Error 42703
   - `public.reminders` table missing → Error PGRST205
   - `public.app_logs` table missing → Error PGRST205

2. **Connection Diagnostics Missing**: No way to verify which Supabase project the app was connecting to, or what key type was being used.

3. **No Schema Healthcheck**: No validation that required tables/columns exist before operations.

4. **Build Error**: Dynamic import in `logging.ts` using `.js` extension caused Vercel build failures.

## What I Changed

### 1. Created Comprehensive Diagnostics Module (`bot/src/lib/dbDiagnostics.ts`)
   - **Connection Analysis**: Extracts project ref from URL, detects key type (anon vs service_role), identifies environment
   - **Schema Healthcheck**: Verifies all required tables and columns exist
   - **Detailed Logging**: Logs connection info, project ref, key suffix (last 6 chars) for identification

### 2. Enhanced Error Logging (`bot/src/lib/dbLogger.ts`)
   - Added project ref extraction to all DB error logs
   - Enhanced error context with connection details

### 3. Added Startup Diagnostics (`bot/src/index.ts`)
   - Runs connection diagnostics on bot startup
   - Runs schema healthcheck on startup
   - Runs healthcheck before each `/start` command
   - Logs all connection details (URL, project ref, key type, environment)

### 4. Fixed Build Error (`miniapp/lib/logging.ts`, `bot/src/services/logging.ts`)
   - Changed dynamic import from `'./dbLogger.js'` to `'./dbLogger'` (static import)
   - Fixes Vercel build failures

### 5. Verified Migrations
   - `0001_init.sql`: Complete schema with all tables
   - `0003_restore_complete_schema.sql`: Idempotent migration that adds missing columns/tables
   - `0004_fix_users_calories_constraint.sql`: Fixes calories constraint to allow 0

## Environment Variables Used

### Bot (`bot/src/config/env.ts`):
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (bypasses RLS)

### Miniapp Server (`miniapp/lib/supabase/server.ts`):
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key

### Miniapp Client (`miniapp/lib/supabase/client.ts`):
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Anon/public key (respects RLS)

## How to Apply Migrations

### Option 1: Supabase SQL Editor (Recommended)

1. **Open Supabase Dashboard**: https://supabase.com/dashboard
2. **Select your project**
3. **Go to SQL Editor**
4. **Run migrations in order**:

```sql
-- Step 1: Run 0001_init.sql (if starting fresh)
-- Copy entire contents of supabase/migrations/0001_init.sql and execute

-- Step 2: Run 0003_restore_complete_schema.sql (ensures all columns exist)
-- Copy entire contents of supabase/migrations/0003_restore_complete_schema.sql and execute

-- Step 3: Run 0004_fix_users_calories_constraint.sql (fixes calories constraint)
-- Copy entire contents of supabase/migrations/0004_fix_users_calories_constraint.sql and execute
```

### Option 2: Supabase CLI

```bash
# If you have Supabase CLI installed
cd step-one-app
supabase db push
```

## Verification Steps

### 1. Check Connection Diagnostics

After bot startup, you should see logs like:
```
[DB_DIAGNOSTICS] ========================================
[DB_DIAGNOSTICS] Supabase Connection Info:
[DB_DIAGNOSTICS]   URL: https://xxxxx.supabase.co
[DB_DIAGNOSTICS]   Project Ref: xxxxx
[DB_DIAGNOSTICS]   Key Type: service_role
[DB_DIAGNOSTICS]   Key Suffix: abc123
[DB_DIAGNOSTICS]   Environment: production
[DB_DIAGNOSTICS] ========================================
```

### 2. Check Schema Healthcheck

After bot startup, you should see:
```
[DB_HEALTHCHECK] ========================================
[DB_HEALTHCHECK] Schema Health Status: ✅ HEALTHY
[DB_HEALTHCHECK] Database: connected
[DB_HEALTHCHECK] Schema: public
[DB_HEALTHCHECK] Tables:
[DB_HEALTHCHECK]   ✅ users (exists: true)
[DB_HEALTHCHECK]     Verified columns: id, telegram_id, calories, goal, protein, fat, carbs, water_goal_ml
[DB_HEALTHCHECK]   ✅ reminders (exists: true)
[DB_HEALTHCHECK]   ✅ app_logs (exists: true)
[DB_HEALTHCHECK]   ✅ diary (exists: true)
[DB_HEALTHCHECK]   ✅ water_logs (exists: true)
[DB_HEALTHCHECK] ========================================
```

### 3. Test /start Command

1. Send `/start` to the bot
2. Check logs for:
   - Connection diagnostics (project ref should match your Supabase project)
   - Schema healthcheck results
   - No errors about missing columns or tables

### 4. Verify Tables in Supabase UI

1. Open Supabase Dashboard → Table Editor
2. Verify these tables exist:
   - `users` (with columns: `id`, `telegram_id`, `calories`, `goal`, `protein`, `fat`, `carbs`, `water_goal_ml`)
   - `reminders`
   - `app_logs`
   - `diary`
   - `water_logs`

### 5. Test Database Operations

```sql
-- Test 1: Insert user (should work)
INSERT INTO users (telegram_id) 
VALUES (123456789) 
ON CONFLICT (telegram_id) DO NOTHING
RETURNING id, telegram_id, calories;

-- Test 2: Insert reminder (should work)
INSERT INTO reminders (user_id, type, time)
SELECT id, 'food', '08:00' FROM users WHERE telegram_id = 123456789 LIMIT 1
RETURNING *;

-- Test 3: Insert app_log (should work)
INSERT INTO app_logs (level, source, chat_id, message)
VALUES ('info', 'test', '123456789', 'Test')
RETURNING id, chat_id;
```

## Troubleshooting

### Error: "column users.calories does not exist" (42703)

**Cause**: Migration not applied or incomplete.

**Fix**:
1. Run `0003_restore_complete_schema.sql` in Supabase SQL Editor
2. Verify column exists: `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'calories';`

### Error: "Could not find table public.reminders in schema cache" (PGRST205)

**Cause**: Table doesn't exist or RLS policies missing.

**Fix**:
1. Run `0001_init.sql` or `0003_restore_complete_schema.sql`
2. Verify table exists: `SELECT * FROM reminders LIMIT 0;`
3. Check RLS: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'reminders';`

### Error: "Could not find table public.app_logs in schema cache" (PGRST205)

**Cause**: Table doesn't exist.

**Fix**:
1. Run `0001_init.sql` or `0003_restore_complete_schema.sql`
2. Verify table exists: `SELECT * FROM app_logs LIMIT 0;`

### Diagnostics Show Wrong Project Ref

**Cause**: Environment variables pointing to wrong Supabase project.

**Fix**:
1. Check `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` in your environment
2. Verify it matches your Supabase Dashboard → Settings → API → Project URL
3. Update environment variables and restart bot

### Key Type Shows "unknown" or "anon" (but should be "service_role")

**Cause**: Using wrong key or key not set.

**Fix**:
1. Check `SUPABASE_SERVICE_ROLE_KEY` is set
2. Verify it's the service_role key (long, 200+ chars) from Supabase Dashboard → Settings → API
3. NOT the anon/public key (shorter, ~100 chars)

## Files Changed

1. **Created**:
   - `bot/src/lib/dbDiagnostics.ts` - Comprehensive diagnostics module

2. **Modified**:
   - `bot/src/index.ts` - Added startup diagnostics and /start healthcheck
   - `bot/src/lib/dbLogger.ts` - Added project ref to error logs
   - `bot/src/services/logging.ts` - Fixed dynamic import
   - `miniapp/lib/logging.ts` - Fixed dynamic import

3. **Migrations** (already exist, verify they're applied):
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0003_restore_complete_schema.sql`
   - `supabase/migrations/0004_fix_users_calories_constraint.sql`

## Next Steps

1. **Apply migrations** in Supabase SQL Editor (see "How to Apply Migrations" above)
2. **Restart bot** to see diagnostics
3. **Test /start** command
4. **Verify logs** show correct project ref and healthy schema
5. **Monitor** for any remaining errors

## Summary

✅ **Diagnostics**: Full connection and schema healthcheck on startup and before /start  
✅ **Error Logging**: Enhanced with project ref and connection details  
✅ **Build Fix**: Fixed dynamic import issue in logging.ts  
✅ **Migrations**: Verified complete schema migrations exist  
✅ **Documentation**: Complete troubleshooting guide

The app will now:
- Log which Supabase project it's connecting to (project ref)
- Verify schema health before operations
- Provide actionable error messages
- Never crash on logging failures
