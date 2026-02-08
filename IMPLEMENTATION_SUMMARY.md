# Implementation Summary: Database Recovery & Diagnostics

## What Was Fixed

### 1. Vercel Build Error ✅
- **Fixed**: Dynamic import in `miniapp/lib/logging.ts` 
- **Change**: Changed `import('./dbLogger.js')` to `import('./dbLogger')` (extensionless)
- **Result**: Build now works on Vercel/Next.js/Turbopack

### 2. Runtime Diagnostics ✅
- **Created**: `lib/debugSupabaseContext.ts` helper
- **Features**:
  - Extracts project ref from Supabase URL
  - Detects key type (anon vs service_role) without exposing secrets
  - Masks keys (first 6 + ... + last 4 chars)
  - Detects environment (production/preview/development/local)
  - Logs compact diagnostic line

**Example output:**
```
[SUPABASE] production (VERCEL_ENV=production) | https://xxxxx.supabase.co | project=xxxxx | key=service_role(abc123) | tables=[users,diary,water_logs,app_logs,reminders]
```

### 3. Database Verification ✅
- **Created**: `scripts/verify-db.ts` script
- **Features**:
  - Checks all required tables exist
  - Checks all required columns exist
  - Uses RPC function to bypass PostgREST cache
  - Prints exact SQL to fix issues
  - Shows database fingerprint (database name, schema)

**Usage:**
```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-key"
npx tsx scripts/verify-db.ts
```

### 4. Safe SQL Execution ✅
- **Created**: Migration `0007_add_exec_sql_function.sql`
- **Features**:
  - RPC function `exec_sql(sql_text)` for introspection queries
  - Only allows `service_role` to execute
  - Only allows read-only introspection queries (pattern-based whitelist)
  - Supports: `SELECT * FROM information_schema`, `current_database()`, `pg_notify`, etc.

**Security:**
- Hard checks `auth.role() = 'service_role'` (raises exception otherwise)
- Pattern-based whitelist for allowed SQL
- Only read-only queries allowed

### 5. Schema Reconciliation ✅
- **Verified**: All migrations ensure required tables/columns exist
- **Migrations**:
  - `0001_init.sql` - Base schema
  - `0003_restore_complete_schema.sql` - Complete restoration
  - `0004_fix_users_calories_constraint.sql` - Fix calories constraint
  - `0005_fix_missing_columns_and_reload_cache.sql` - Add missing columns
  - `0006_add_column_check_function.sql` - RPC for column checking
  - `0007_add_exec_sql_function.sql` - RPC for SQL execution

### 6. Error Reporting ✅
- **Enhanced**: `bot/src/lib/dbLogger.ts`
- **Features**:
  - Includes project ref in all error logs
  - Includes operation name and table
  - Full Postgres error details (code, message, details, hint)
  - User-friendly Telegram messages with error codes
  - Request ID for correlation

**Example error log:**
```
[DB_ERROR:start-1234567890-abc] select on users (telegramUserId: 123456789): [42703] column "calories" does not exist | Project: xxxxx
[DB_ERROR] {"requestId":"start-1234567890-abc","operation":"select","table":"users","projectRef":"xxxxx","error":{"code":"42703","message":"column \"calories\" does not exist"}}
```

### 7. Bot Startup Diagnostics ✅
- **Updated**: `bot/src/index.ts`
- **Features**:
  - Logs compact connection context on startup
  - Logs detailed diagnostics on startup
  - Logs connection context before each `/start` command
  - Runs schema healthcheck on startup and before `/start`

## Files Created/Modified

### New Files:
1. `lib/debugSupabaseContext.ts` - Debug helper for Supabase context
2. `scripts/verify-db.ts` - Database verification script
3. `supabase/migrations/0007_add_exec_sql_function.sql` - Safe SQL execution RPC
4. `DB_RECOVERY.md` - Complete recovery guide
5. `IMPLEMENTATION_SUMMARY.md` - This file

### Modified Files:
1. `bot/src/index.ts` - Added diagnostics on startup and /start
2. `bot/src/lib/dbLogger.ts` - Enhanced error reporting with project ref
3. `miniapp/lib/logging.ts` - Fixed dynamic import (removed .js extension)

## How to Use

### 1. Apply Migrations

Run in Supabase SQL Editor (in order):
1. `0001_init.sql` (if starting fresh)
2. `0003_restore_complete_schema.sql`
3. `0004_fix_users_calories_constraint.sql`
4. `0005_fix_missing_columns_and_reload_cache.sql`
5. `0006_add_column_check_function.sql`
6. `0007_add_exec_sql_function.sql`

After each migration, reload schema cache:
```sql
SELECT pg_notify('pgrst', 'reload schema');
```

### 2. Verify Database

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
npx tsx scripts/verify-db.ts
```

### 3. Check Runtime Diagnostics

After starting the bot, you'll see:
```
[SUPABASE] production (VERCEL_ENV=production) | https://xxxxx.supabase.co | project=xxxxx | key=service_role(abc123) | tables=[users,diary,water_logs,app_logs,reminders]
```

This confirms:
- Which Supabase project you're connected to
- What environment you're running in
- What key type is being used
- What tables are expected

## Environment Variables

### Bot (server-side):
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` ⚠️ Use service role (not anon)

### Miniapp (server-side API routes):
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` ⚠️ Use service role

### Miniapp (client-side):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` ✅ Use anon key (safe for client)

## Key Differences

| Key Type | Length | Use Case | RLS |
|----------|--------|----------|-----|
| **Service Role** | 200+ chars | Bot, API routes, migrations | Bypasses |
| **Anon/Public** | 100-150 chars | Client-side code | Respects |

## Troubleshooting

### Error: "column does not exist" (42703)
1. Run `scripts/verify-db.ts` to get exact SQL fixes
2. Apply the SQL in Supabase SQL Editor
3. Reload schema cache: `SELECT pg_notify('pgrst', 'reload schema');`

### Error: "table not found in schema cache" (PGRST205)
1. Reload schema cache: `SELECT pg_notify('pgrst', 'reload schema');`
2. Wait 10-15 seconds
3. Restart application

### Healthcheck shows columns missing but they exist in UI
1. Apply migration `0006_add_column_check_function.sql` (uses information_schema directly)
2. Reload schema cache
3. Restart application

## Next Steps

1. ✅ Apply all migrations in Supabase SQL Editor
2. ✅ Run `scripts/verify-db.ts` to verify schema
3. ✅ Check bot startup logs for connection context
4. ✅ Test `/start` command
5. ✅ Verify no PGRST205 or 42703 errors

## Documentation

- **DB_RECOVERY.md** - Complete recovery guide with all details
- **IMPLEMENTATION_SUMMARY.md** - This file (quick reference)
