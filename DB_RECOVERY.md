# Database Recovery Guide

## Overview

This guide explains how to recover the database schema after migrating to a new Supabase project.

## Environment Variables

### Required for Bot (server-side)

Set these in your bot's environment (`.env` file or Vercel):

- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (bypasses RLS, required for bot operations)

### Required for Miniapp (server-side API routes)

Set these in Vercel Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (for API routes)

### Required for Miniapp (client-side)

Set these in Vercel Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Anon/public key (respects RLS)

## Key Types: When to Use Which

### Service Role Key (`SUPABASE_SERVICE_ROLE_KEY`)

**Use for:**
- Bot operations (all bot code uses service role)
- Server-side API routes in miniapp
- Database migrations and schema operations
- Admin operations

**Characteristics:**
- Long key (200+ characters)
- Bypasses Row Level Security (RLS)
- Full database access
- ⚠️ **NEVER expose to client-side code**

### Anon/Public Key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)

**Use for:**
- Client-side code (browser, React components)
- Public API access
- Respects RLS policies

**Characteristics:**
- Shorter key (100-150 characters)
- Respects Row Level Security
- Limited access based on RLS policies
- Safe to expose in client code (hence `NEXT_PUBLIC_` prefix)

## Running Database Verification

### Using the verify-db script

```bash
# Install dependencies if needed
npm install -g tsx

# Set environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Run verification
npx tsx scripts/verify-db.ts
```

The script will:
1. Print connection context (URL, project ref, key type)
2. Check that all required tables exist
3. Check that all required columns exist
4. Print exact SQL to fix any issues found

### Expected Output

```
=== Database Verification ===

[SUPABASE] production (NODE_ENV=production) | https://xxxxx.supabase.co | project=xxxxx | key=service_role(abc123) | tables=[users,diary,water_logs,app_logs,reminders]

✅ Database connection successful
   Database: postgres
   Schema: public

📋 Checking 5 tables...

Checking table: users
  ✅ Table exists
  ✅ All required columns exist

...

=== Summary ===

✅ All checks passed! Database schema is correct.
```

## Applying Migrations

### Step 1: Apply Base Schema

Run in Supabase SQL Editor:

```sql
-- Copy and execute: supabase/migrations/0001_init.sql
```

This creates all base tables.

### Step 2: Apply Schema Restoration

Run in Supabase SQL Editor:

```sql
-- Copy and execute: supabase/migrations/0003_restore_complete_schema.sql
```

This ensures all columns exist.

### Step 3: Fix Constraints

Run in Supabase SQL Editor:

```sql
-- Copy and execute: supabase/migrations/0004_fix_users_calories_constraint.sql
```

This fixes the calories constraint to allow 0.

### Step 4: Add Missing Columns

Run in Supabase SQL Editor:

```sql
-- Copy and execute: supabase/migrations/0005_fix_missing_columns_and_reload_cache.sql
```

This adds any missing columns and reloads schema cache.

### Step 5: Add RPC Functions

Run in Supabase SQL Editor:

```sql
-- Copy and execute: supabase/migrations/0006_add_column_check_function.sql
-- Copy and execute: supabase/migrations/0007_add_exec_sql_function.sql
```

These add helper functions for diagnostics.

### Step 6: Reload Schema Cache

After applying migrations, always reload PostgREST schema cache:

```sql
SELECT pg_notify('pgrst', 'reload schema');
SELECT pg_notify('pgrst', 'reload config');
```

Wait 10-15 seconds for cache to reload.

## Forcing PostgREST Schema Reload

If you see errors like "Could not find table in schema cache" (PGRST205), reload the cache:

### Method 1: SQL Command

```sql
SELECT pg_notify('pgrst', 'reload schema');
SELECT pg_notify('pgrst', 'reload config');
```

### Method 2: Using exec_sql RPC (if available)

```typescript
const { error } = await supabase.rpc('exec_sql', {
  sql_text: "SELECT pg_notify('pgrst', 'reload schema')"
});
```

### Method 3: Restart PostgREST (if you have access)

In Supabase Dashboard → Settings → API → Restart PostgREST (if available)

## Required Tables and Columns

### users

Required columns:
- `id` (BIGSERIAL)
- `telegram_id` (BIGINT, UNIQUE)
- `calories` (INTEGER, DEFAULT 0, NOT NULL)
- `goal` (TEXT, CHECK IN ('lose', 'maintain', 'gain'))
- `activity` (TEXT, CHECK IN ('sedentary', 'light', 'moderate', 'active', 'very_active'))
- `protein` (NUMERIC(6, 2), DEFAULT 0)
- `fat` (NUMERIC(6, 2), DEFAULT 0)
- `carbs` (NUMERIC(6, 2), DEFAULT 0)
- `water_goal_ml` (INTEGER)

### reminders

Required columns:
- `id` (BIGSERIAL)
- `user_id` (BIGINT, FK to users)
- `type` (TEXT, CHECK IN ('food', 'water'))
- `time` (TEXT, format: HH:MM)

### app_logs

Required columns:
- `id` (BIGSERIAL)
- `level` (TEXT, CHECK IN ('info', 'warn', 'error'))
- `source` (TEXT)
- `request_id` (TEXT)
- `user_id` (BIGINT)
- `telegram_user_id` (BIGINT)
- `chat_id` (TEXT)

### diary

Required columns:
- `id` (BIGSERIAL)
- `user_id` (BIGINT)
- `source` (TEXT, CHECK IN ('text', 'photo', 'audio'))
- `meal_text` (TEXT)
- `created_at` (TIMESTAMPTZ)

### water_logs

Required columns:
- `id` (BIGSERIAL)
- `user_id` (BIGINT, FK to users)
- `amount_ml` (INTEGER)
- `created_at` (TIMESTAMPTZ)

## Troubleshooting

### Error: "column users.calories does not exist" (42703)

**Cause:** Column missing from database.

**Fix:**
1. Run migration `0005_fix_missing_columns_and_reload_cache.sql`
2. Reload schema cache: `SELECT pg_notify('pgrst', 'reload schema');`

### Error: "Could not find table in schema cache" (PGRST205)

**Cause:** PostgREST schema cache is stale.

**Fix:**
1. Reload schema cache: `SELECT pg_notify('pgrst', 'reload schema');`
2. Wait 10-15 seconds
3. Restart your application

### Error: "exec_sql: Only service_role can execute"

**Cause:** Trying to use exec_sql with anon key.

**Fix:** Use `SUPABASE_SERVICE_ROLE_KEY` (not anon key) for exec_sql calls.

### Healthcheck shows columns as missing but they exist in UI

**Cause:** PostgREST cache is stale or healthcheck is using wrong method.

**Fix:**
1. Apply migration `0006_add_column_check_function.sql` (uses information_schema directly)
2. Reload schema cache
3. Restart application

## Runtime Diagnostics

The bot and miniapp now log connection context on startup:

```
[SUPABASE] production (VERCEL_ENV=production) | https://xxxxx.supabase.co | project=xxxxx | key=service_role(abc123) | tables=[users,diary,water_logs,app_logs,reminders]
```

This shows:
- Environment (production/preview/development/local)
- Full Supabase URL
- Project reference (extracted from URL)
- Key type (anon vs service_role)
- Masked key (first 6 + last 4 chars, safe to log)
- Expected tables

## Verification Checklist

After applying migrations:

- [ ] All tables exist (users, diary, water_logs, app_logs, reminders)
- [ ] All required columns exist in each table
- [ ] Schema cache reloaded (`pg_notify('pgrst', 'reload schema')`)
- [ ] Bot startup shows `✅ HEALTHY` in healthcheck
- [ ] `/start` command works without errors
- [ ] No PGRST205 errors in logs
- [ ] No 42703 (column does not exist) errors

## Quick Recovery Script

If you need to quickly recover the schema:

```sql
-- 1. Apply all migrations in order (0001, 0003, 0004, 0005, 0006, 0007)
-- 2. Reload cache
SELECT pg_notify('pgrst', 'reload schema');
SELECT pg_notify('pgrst', 'reload config');
-- 3. Wait 15 seconds
-- 4. Restart application
```

## Support

If issues persist:
1. Run `scripts/verify-db.ts` to get exact SQL fixes
2. Check bot logs for connection context
3. Verify environment variables are set correctly
4. Ensure you're using service_role key for bot operations
