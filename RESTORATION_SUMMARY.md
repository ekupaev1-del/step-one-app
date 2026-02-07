# Supabase Database Restoration - Summary

## ✅ Completed Tasks

### 1. Database Schema Migration
- ✅ Created complete SQL migration: `supabase/migrations/20260207150610_initial_schema_complete.sql`
- ✅ Created FULL_RESET.sql for manual execution in Supabase SQL Editor
- ✅ All tables created with correct types (BIGINT for user_id, not UUID)
- ✅ All constraints fixed (diary.source allows 'text', 'photo', 'audio')
- ✅ RLS policies configured for service_role full access

### 2. Supabase Client Setup
- ✅ Created `miniapp/lib/supabase/server.ts` - Service role client (server-side only)
- ✅ Created `miniapp/lib/supabase/client.ts` - Anon key client (client-side)
- ✅ Added runtime assertions to prevent key misuse

### 3. Logging Improvements
- ✅ Updated logging to output structured JSON (single-line for Vercel logs)
- ✅ Logging is safe - never crashes if app_logs table is missing
- ✅ Added DEBUG env flag support for verbose logs
- ✅ All logs include requestId, telegramUserId, and error details

### 4. Documentation
- ✅ Created `DEPLOYMENT_GUIDE.md` with step-by-step instructions
- ✅ Added npm scripts for database migrations
- ✅ Created troubleshooting section

## 📋 Required Environment Variables (Vercel)

Set these in your Vercel project settings:

### Required
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public anon key (safe for client)
- `SUPABASE_SERVICE_ROLE_KEY` - Secret service role key (server-only)

### Optional
- `DEBUG` - Set to `1` or `true` for verbose logging
- `TELEGRAM_BOT_TOKEN` - For bot deployment
- `OPENAI_API_KEY` - For food analysis

## 🚀 Quick Start

### Step 1: Run Migration
1. Open Supabase SQL Editor
2. Copy contents of `supabase/FULL_RESET.sql`
3. Paste and run

### Step 2: Set Environment Variables
Set the 3 required variables in Vercel (see above)

### Step 3: Deploy & Test
1. Deploy to Vercel
2. Test `/start` command in Telegram bot
3. Test sending "2 boiled eggs" to verify diary insert

## 📊 Database Schema

### Tables Created
1. **users** - Core user table (BIGINT id, BIGINT telegram_id)
2. **diary** - Food diary entries (BIGINT user_id, source: 'text'|'photo'|'audio')
3. **subscriptions** - User subscriptions
4. **payments** - Payment records
5. **reminders** - Food/water reminders
6. **water_logs** - Water intake tracking
7. **app_logs** - Application logs (safe, never crashes if missing)
8. **robokassa_invoices** - Payment invoices

### Key Fixes
- ✅ All `user_id` columns are `BIGINT` (not UUID)
- ✅ `diary.source` constraint allows: `'text'`, `'photo'`, `'audio'`
- ✅ `diary.channel` allows: `'telegram'`, `'webapp'`, `'admin'`, `'api'`
- ✅ RLS policies allow `service_role` full access
- ✅ All foreign keys properly configured

## 🔍 Verification Queries

After migration, run these in Supabase SQL Editor:

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Verify user_id types (should be bigint, not uuid)
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE column_name = 'user_id' 
AND table_schema = 'public';

-- Check diary constraints
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'diary'::regclass;
```

## 🐛 Common Issues & Fixes

### Issue: "invalid input syntax for type uuid: '347'"
**Fix**: Migration didn't run. Re-run `FULL_RESET.sql`

### Issue: "violates check constraint diary_source_check"
**Fix**: Constraint already fixed in migration. If persists, check:
```sql
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'diary'::regclass 
AND conname LIKE '%source%';
```

### Issue: "User not found. Use /start"
**Fix**: Check RLS policies allow service_role to insert:
```sql
SELECT policyname, cmd FROM pg_policies 
WHERE tablename = 'users' AND schemaname = 'public';
```

## 📝 Migration Files

- **`supabase/migrations/20260207150610_initial_schema_complete.sql`** - Timestamped migration (for CLI)
- **`supabase/FULL_RESET.sql`** - Complete reset (for SQL Editor)

Both create the same schema. Use FULL_RESET.sql for quick setup.

## 🔐 Security Notes

- ✅ Service role key NEVER exposed to client
- ✅ Client code uses anon key only
- ✅ Server code uses service role key
- ✅ Runtime assertions prevent key misuse
- ✅ RLS enabled on all tables

## 📚 Additional Documentation

- See `DEPLOYMENT_GUIDE.md` for detailed step-by-step instructions
- See migration files for complete schema documentation

## ✨ Next Steps

1. Run migration in Supabase SQL Editor
2. Set environment variables in Vercel
3. Deploy and test `/start` command
4. Verify diary inserts work
5. Monitor logs for structured JSON output
