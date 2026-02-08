# Database Setup Runbook

## Quick Start

This guide helps you restore the complete database schema in a NEW Supabase project.

---

## Step 1: Get Supabase Credentials

1. Open your Supabase project dashboard: https://supabase.com/dashboard
2. Go to **Settings** → **API**
3. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ Keep secret!)

---

## Step 2: Set Environment Variables in Vercel

1. Open Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
2. Add these variables (for **Production**, **Preview**, and **Development**):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (service_role key)
SUPABASE_URL=https://xxxxx.supabase.co (same as NEXT_PUBLIC_SUPABASE_URL)
```

3. Click **Save**
4. **Redeploy** your application (Vercel will pick up new env vars)

---

## Step 3: Apply Database Migrations

### Option A: Supabase SQL Editor (Recommended for first-time setup)

1. Open Supabase Dashboard → **SQL Editor**
2. Click **New query**
3. Copy and paste the contents of `supabase/migrations/0001_init.sql`
4. Click **Run** (or press `Ctrl+Enter`)
5. Wait for success message
6. Copy and paste the contents of `supabase/migrations/0002_fix_users_calories_and_add_missing_tables.sql`
7. Click **Run**
8. Copy and paste the contents of `supabase/migrations/0003_restore_complete_schema.sql`
9. Click **Run**

### Option B: Supabase CLI

```bash
# Install Supabase CLI (if not installed)
npm install -g supabase

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Push all migrations
supabase db push
```

**To get PROJECT_REF:**
- Supabase Dashboard → Settings → General → Reference ID

---

## Step 4: Reload PostgREST Schema Cache

After applying migrations, **reload the schema cache** so PostgREST recognizes new tables:

1. Open Supabase Dashboard → **SQL Editor**
2. Run this command:

```sql
SELECT pg_notify('pgrst', 'reload schema');
```

3. Wait 2-3 seconds for cache to reload

---

## Step 5: Verify Database Schema

Run these verification queries in Supabase SQL Editor:

### Test 1: Check users table structure

```sql
SELECT 
  column_name, 
  data_type, 
  column_default, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'users'
ORDER BY ordinal_position;
```

**Expected columns:**
- `id` (bigint)
- `telegram_id` (bigint)
- `calories` (integer, default 0) ✅
- `goal` (text) ✅
- `name`, `phone`, `email`, `gender`, `age`, `weight`, `height`, `activity`
- `protein`, `fat`, `carbs`, `water_goal_ml`
- `avatar_url`, `privacy_accepted`, `terms_accepted`
- `created_at`, `updated_at`

### Test 2: Check reminders table exists

```sql
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'reminders'
);
```

**Expected:** `true`

### Test 3: Check app_logs table with chat_id column

```sql
SELECT 
  column_name, 
  data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'app_logs'
  AND column_name = 'chat_id';
```

**Expected:** `chat_id` (text) ✅

### Test 4: Check diary source constraint

```sql
SELECT 
  conname, 
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.diary'::regclass
  AND conname = 'diary_source_check';
```

**Expected:** Constraint allowing `'text'`, `'photo'`, `'audio'`

### Test 5: Test insert into users (should work)

```sql
-- This should succeed
INSERT INTO users (telegram_id) 
VALUES (123456789) 
ON CONFLICT (telegram_id) DO NOTHING
RETURNING id, telegram_id, calories;
```

**Expected:** Returns row with `calories = 0` (or NULL if not set)

---

## Step 6: Test Application

### Test /start command

1. Open your Telegram bot
2. Send `/start`
3. Check Vercel logs for errors
4. **Expected:** User created successfully, no "column does not exist" errors

### Test reminders scheduler

1. Check Vercel logs for scheduler errors
2. **Expected:** No "table reminders does not exist" errors

### Test logging

1. Trigger any bot action (e.g., send a message)
2. Check Vercel logs
3. **Expected:** No "table app_logs does not exist" or "column chat_id does not exist" errors

---

## Troubleshooting

### Error: "column users.calories does not exist" (42703)

**Solution:**
1. Run migration `0003_restore_complete_schema.sql` again
2. Verify with Test 1 above
3. Reload schema cache: `SELECT pg_notify('pgrst', 'reload schema');`

### Error: "Could not find the table 'public.reminders'" (PGRST205)

**Solution:**
1. Check if table exists: `SELECT * FROM reminders LIMIT 1;`
2. If error "relation does not exist", run `0003_restore_complete_schema.sql`
3. Reload schema cache: `SELECT pg_notify('pgrst', 'reload schema');`

### Error: "Could not find column 'chat_id' of 'app_logs'" (PGRST204)

**Solution:**
1. Check column type: Run Test 3 above
2. If column doesn't exist or is wrong type, run `0003_restore_complete_schema.sql`
3. Reload schema cache: `SELECT pg_notify('pgrst', 'reload schema');`

### Error: "violates check constraint diary_source_check" (23514)

**Solution:**
1. Check constraint: Run Test 4 above
2. If constraint is wrong, migration `0003_restore_complete_schema.sql` will fix it
3. Reload schema cache

### Schema cache not reloading

**Solution:**
1. Wait 5-10 seconds after running `pg_notify`
2. Try restarting your Vercel deployment
3. Or manually reload: Supabase Dashboard → Settings → API → **Reload schema cache**

---

## Migration Files Reference

- **`0001_init.sql`** - Initial schema (all tables)
- **`0002_fix_users_calories_and_add_missing_tables.sql`** - Fixes calories DEFAULT, adds profiles/telegram_link_tokens
- **`0003_restore_complete_schema.sql`** - **Complete restoration** (use this if schema is missing)

**For a fresh Supabase project:** Run all three migrations in order.

**For an existing project with missing tables:** Run `0003_restore_complete_schema.sql` (it's idempotent).

---

## Verification Checklist

- [ ] All migrations applied successfully
- [ ] Schema cache reloaded
- [ ] Test 1: users table has `calories` and `goal` columns
- [ ] Test 2: reminders table exists
- [ ] Test 3: app_logs.chat_id is TEXT
- [ ] Test 4: diary.source constraint allows 'text', 'photo', 'audio'
- [ ] Test 5: Insert into users works
- [ ] `/start` command works without errors
- [ ] Reminders scheduler runs without errors
- [ ] Logging works without errors

---

## Support

If issues persist:
1. Check Vercel logs for exact error messages
2. Run verification queries above
3. Check Supabase Dashboard → Logs for Postgres errors
4. Ensure all environment variables are set correctly
