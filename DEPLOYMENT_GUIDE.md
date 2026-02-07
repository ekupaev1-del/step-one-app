# Supabase Database Restoration & Deployment Guide

This guide explains how to restore the complete database schema in a new Supabase project and fix all configuration issues.

## Prerequisites

1. **New Supabase Project**: You have created a new Supabase project and have access to:
   - Project URL (e.g., `https://xxxxx.supabase.co`)
   - Anon Key (public, safe for client-side)
   - Service Role Key (secret, server-side only)

2. **Vercel Environment Variables**: You need to set these in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon key (public)
   - `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (secret)

## Step 1: Run Database Migration

You have two options to restore the schema:

### Option A: Using Supabase SQL Editor (Recommended for Quick Setup)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the file `supabase/FULL_RESET.sql`
4. Copy the entire contents
5. Paste into the SQL Editor
6. Click **Run** (or press Ctrl+Enter)
7. Wait for the migration to complete (should take 10-30 seconds)

**Verification**: After running, check that all tables exist:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

Expected tables:
- `app_logs`
- `diary`
- `payments`
- `reminders`
- `robokassa_invoices`
- `subscriptions`
- `users`
- `water_logs`

### Option B: Using Supabase CLI (For Development)

If you have Supabase CLI installed:

```bash
# Link to your project (replace PROJECT_REF with your project reference ID)
cd step-one-app/miniapp
npm run db:link

# Push migrations
npm run db:push
```

**Note**: The CLI method requires:
- Supabase CLI installed (`npm install -g supabase`)
- Project reference ID from your Supabase dashboard
- Local Supabase configuration

## Step 2: Verify Environment Variables in Vercel

Go to your Vercel project settings → Environment Variables and ensure:

### Required Variables

| Variable Name | Description | Where to Find |
|--------------|-------------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase Dashboard → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (safe for client) | Supabase Dashboard → Settings → API → anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret service role key (server-only) | Supabase Dashboard → Settings → API → service_role secret key |

### Additional Variables (if needed)

| Variable Name | Description |
|--------------|-------------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (for bot deployment) |
| `OPENAI_API_KEY` | OpenAI API key (for food analysis) |
| `DEBUG` | Set to `1` or `true` to enable verbose logging |

**⚠️ CRITICAL**: 
- `SUPABASE_SERVICE_ROLE_KEY` must NEVER be exposed to the client
- Only `NEXT_PUBLIC_SUPABASE_ANON_KEY` should be in client-side code
- The service role key bypasses RLS and has full database access

## Step 3: Verify Schema

After running the migration, verify the schema is correct:

### Check Table Structure

Run this in Supabase SQL Editor:

```sql
-- Check users table
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;

-- Check diary table (critical for bot)
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'diary' 
ORDER BY ordinal_position;
```

**Expected**:
- `users.id` should be `bigint` (BIGSERIAL)
- `users.telegram_id` should be `bigint`
- `diary.user_id` should be `bigint` (NOT uuid)
- `diary.source` should allow: `'text'`, `'photo'`, `'audio'`
- `diary.channel` should allow: `'telegram'`, `'webapp'`, `'admin'`, `'api'`

### Check RLS Policies

```sql
-- Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'diary', 'app_logs');

-- Check policies exist
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'diary');
```

**Expected**: All tables should have `rowsecurity = true` and policies allowing `service_role` full access.

## Step 4: Test /start Command

1. Deploy your bot to Vercel (or run locally)
2. Send `/start` command to your Telegram bot
3. Check Vercel logs for:
   - User creation/upsert success
   - No database errors
   - Request ID in logs

**Expected Log Output**:
```json
{"level":"info","source":"telegram_webhook","requestId":"req-...","telegramUserId":123456789,"timestamp":"2026-02-07T..."}
```

If you see errors like:
- `"invalid input syntax for type uuid: '347'"` → Schema migration didn't run correctly
- `"violates check constraint diary_source_check"` → Constraint mismatch (should allow 'text', 'photo', 'audio')
- `"User not found"` → RLS policy issue or user wasn't created

## Step 5: Test Diary Insert

After `/start` works:

1. Send a food message to the bot (e.g., "2 boiled eggs")
2. Check Vercel logs for successful insert
3. Verify in Supabase:
   ```sql
   SELECT * FROM diary ORDER BY created_at DESC LIMIT 1;
   ```

**Expected**:
- `user_id` is a number (BIGINT), not UUID
- `source` is one of: `'text'`, `'photo'`, `'audio'`
- `channel` is `'telegram'`
- No constraint violations

## Troubleshooting

### Error: "Database error..." on /start

**Possible causes**:
1. Migration didn't run → Run `FULL_RESET.sql` again
2. RLS policies missing → Check policies exist for `service_role`
3. Wrong environment variables → Verify `SUPABASE_SERVICE_ROLE_KEY` is set

**Fix**:
```sql
-- Re-run RLS policies for users table
DROP POLICY IF EXISTS users_insert_service ON users;
CREATE POLICY users_insert_service ON users
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
```

### Error: "invalid input syntax for type uuid: '347'"

**Cause**: `user_id` column is UUID but code sends BIGINT

**Fix**: Ensure migration ran correctly. Check:
```sql
SELECT data_type FROM information_schema.columns 
WHERE table_name = 'diary' AND column_name = 'user_id';
```

Should be `bigint`, not `uuid`.

### Error: "violates check constraint diary_source_check"

**Cause**: Code sends `source='telegram'` but constraint only allows content types

**Fix**: The migration already fixes this. If still failing:
```sql
-- Check current constraint
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'diary'::regclass 
AND conname LIKE '%source%';

-- Should allow: 'text', 'photo', 'audio'
```

### Error: "User not found. Use /start"

**Cause**: User wasn't created or RLS blocking access

**Fix**:
1. Check if user exists:
   ```sql
   SELECT * FROM users WHERE telegram_id = YOUR_TELEGRAM_ID;
   ```
2. If missing, `/start` should create it. Check logs for insert errors.
3. Verify RLS policies allow service_role to insert.

## Migration Files

- **`supabase/migrations/20260207150610_initial_schema_complete.sql`**: Timestamped migration (for Supabase CLI)
- **`supabase/FULL_RESET.sql`**: Complete reset script (for SQL Editor)

Both files create the same schema. Use:
- **FULL_RESET.sql** if you want to drop and recreate everything
- **Migration file** if you want incremental migrations

## Security Checklist

- [ ] `SUPABASE_SERVICE_ROLE_KEY` is NOT in client-side code
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` is used only in client components
- [ ] Server-side code (API routes) uses `getServerSupabaseClient()` from `lib/supabase/server.ts`
- [ ] Client-side code uses `getClientSupabaseClient()` from `lib/supabase/client.ts`
- [ ] RLS is enabled on all tables
- [ ] Service role policies allow full access for bot/API

## Next Steps

After successful deployment:

1. **Monitor Logs**: Check Vercel logs for structured JSON output
2. **Test All Features**: 
   - `/start` command
   - Food diary entries (text, photo, audio)
   - Water logging
   - Reminders
3. **Verify Data**: Check Supabase dashboard to ensure data is being written correctly

## Support

If issues persist:
1. Check Vercel logs for structured JSON errors
2. Verify environment variables are set correctly
3. Run verification queries in Supabase SQL Editor
4. Check that migration completed without errors
