# Database Restoration Guide

This guide explains how to restore the Supabase database schema for a new Supabase project.

## Quick Start

### Option 1: Using Supabase SQL Editor (Recommended for New Projects)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open `supabase/FULL_RESET.sql`
4. Copy the entire contents
5. Paste into SQL Editor
6. Click **Run** (or press `Ctrl+Enter`)

This will:
- Drop all existing tables (if any)
- Create all tables with correct schema
- Set up RLS policies
- Create indexes and constraints
- Set up triggers

### Option 2: Using Supabase CLI

If you have Supabase CLI installed and linked:

```bash
cd miniapp
npm run db:push
```

Or manually:

```bash
supabase db push
```

## Environment Variables Checklist

Ensure these are set in **Vercel** (Settings → Environment Variables):

### Required Variables

- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
  - Format: `https://xxxxx.supabase.co`
  - Found in: Supabase Dashboard → Settings → API → Project URL

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon/public key
  - Format: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
  - Found in: Supabase Dashboard → Settings → API → Project API keys → `anon` `public`
  - ⚠️ **Safe to expose** - used in client-side code

- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (SECRET)
  - Format: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (much longer than anon key)
  - Found in: Supabase Dashboard → Settings → API → Project API keys → `service_role` `secret`
  - ⚠️ **NEVER expose to client** - only used in server-side code (API routes, bot)

### Optional Variables

- `DEBUG` - Set to `1` or `true` for verbose logging
- `TELEGRAM_BOT_TOKEN` - Telegram bot token (for bot functionality)

## Database Schema Overview

### Tables Created

1. **users** - Core user table with Telegram integration
   - `id` (BIGINT, primary key)
   - `telegram_id` (BIGINT, unique, nullable)
   - Profile fields: name, phone, email, gender, age, weight, height, etc.
   - Nutrition goals: calories, protein, fat, carbs, water_goal_ml

2. **diary** - Food diary entries
   - `id` (BIGINT, primary key)
   - `user_id` (BIGINT, references users.id)
   - `telegram_user_id` (BIGINT, for direct queries)
   - `source` (TEXT): 'text', 'photo', or 'audio'
   - `channel` (TEXT): 'telegram', 'webapp', 'admin', or 'api'
   - Meal data: meal_text, calories, protein, fat, carbs

3. **subscriptions** - User subscription records
   - `id` (UUID, primary key)
   - `user_id` (BIGINT, unique, references users.id)
   - Status, periods, provider info

4. **payments** - Payment records
   - `id` (BIGINT, primary key)
   - `user_id` (BIGINT, references users.id)
   - Provider, amount, status, etc.

5. **reminders** - User reminders for food and water
   - `id` (BIGINT, primary key)
   - `user_id` (BIGINT, references users.id)
   - Type: 'food' or 'water'
   - Time in HH:MM format

6. **water_logs** - Water intake tracking
   - `id` (BIGINT, primary key)
   - `user_id` (BIGINT, references users.id)
   - Amount in ml, logged_at timestamp

7. **app_logs** - Application logs for debugging
   - `id` (BIGINT, primary key)
   - Level: 'info', 'warn', or 'error'
   - Source, request_id, user_id, telegram_user_id, chat_id
   - Message and payload (JSONB)

8. **robokassa_invoices** - Payment invoice records
   - `id` (SERIAL, primary key)
   - `user_id` (BIGINT, references users.id)
   - Invoice status, payment URL, etc.

## Key Design Decisions

1. **All user IDs use BIGINT** (not UUID) for consistency
   - `users.id` is BIGINT
   - `diary.user_id` is BIGINT
   - All foreign keys use BIGINT

2. **diary.source** = content type ('text', 'photo', 'audio')
   - NOT 'telegram' (that's the channel)
   - The bot code normalizes this automatically

3. **diary.channel** = communication channel ('telegram', 'webapp', 'admin', 'api')
   - Separate from source to track where the entry came from

4. **RLS Policies** allow `service_role` full access
   - Required for Telegram bot and API routes
   - Bot uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS
   - Client code uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` (respects RLS)

## Verification Steps

After running the migration:

1. **Check tables exist:**
   ```sql
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public' 
   ORDER BY table_name;
   ```

2. **Test /start command:**
   - Send `/start` to your Telegram bot
   - Should create/update user in `users` table
   - Should NOT return "Database error"

3. **Test diary insert:**
   - After `/start`, send "2 boiled eggs" to bot
   - Should insert row into `diary` table
   - Should return "✅ Добавлено: ..." (not error)

4. **Check logs:**
   - Visit `/api/version` endpoint
   - Check Vercel logs for structured JSON logs
   - Errors should include requestId, telegram_user_id, and query details

## Troubleshooting

### Error: "invalid input syntax for type uuid: '347'"

**Cause:** Code is trying to insert numeric user ID into UUID column.

**Fix:** Ensure all `user_id` columns are BIGINT (not UUID). The migration already fixes this.

### Error: "violates check constraint diary_source_check"

**Cause:** Code is inserting `source: 'telegram'` but constraint only allows 'text', 'photo', 'audio'.

**Fix:** The bot code has been updated to use `normalizeDiaryEntry()` which converts 'telegram' to the correct source type. Ensure you're using the latest bot code.

### Error: "User not found. Use /start"

**Cause:** User doesn't exist in `users` table, or RLS is blocking the query.

**Fix:**
1. Ensure RLS policies allow `service_role` access
2. Ensure bot is using `SUPABASE_SERVICE_ROLE_KEY` (not anon key)
3. Check that `/start` command successfully creates user

### Error: "Database error..." on /start

**Cause:** RLS policies are blocking insert, or table doesn't exist.

**Fix:**
1. Run the migration again to ensure tables exist
2. Verify RLS policies are created correctly
3. Check that `SUPABASE_SERVICE_ROLE_KEY` is set correctly in Vercel

## Code Changes Made

1. **Fixed bot photo handler** - Now uses `source: 'photo'` (not 'telegram') and normalizes via `normalizeDiaryEntry()`

2. **Supabase clients:**
   - `bot/src/services/supabase.ts` - Uses service role key (correct)
   - `miniapp/lib/supabase/server.ts` - Uses service role key (correct)
   - `miniapp/lib/supabase/client.ts` - Uses anon key (correct)

3. **Logging:**
   - `bot/src/services/logging.ts` - Safe logging that never crashes
   - `miniapp/lib/logging.ts` - Safe logging that never crashes
   - Both log to console (structured JSON) and optionally to `app_logs` table

## Files Created/Updated

- `supabase/migrations/20260207150610_initial_schema_complete.sql` - Complete migration
- `supabase/FULL_RESET.sql` - Full reset script for SQL Editor
- `bot/src/index.ts` - Fixed photo handler to use correct source value
- `DATABASE_RESTORATION.md` - This file

## Next Steps

1. ✅ Run migration in Supabase SQL Editor
2. ✅ Verify environment variables in Vercel
3. ✅ Test `/start` command in Telegram bot
4. ✅ Test sending a food message (e.g., "2 boiled eggs")
5. ✅ Check Vercel logs for any errors
6. ✅ Verify `/api/version` endpoint works

## Support

If you encounter issues:

1. Check Vercel logs for structured JSON error messages
2. Check Supabase logs in dashboard
3. Verify all environment variables are set correctly
4. Ensure RLS policies are created (run migration again if needed)
5. Check that bot code is using service role key (not anon key)
