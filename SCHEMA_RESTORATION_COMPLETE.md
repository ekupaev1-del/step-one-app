# Database Schema Restoration - Complete

## Summary

All database migrations have been created and committed to restore the complete schema for a NEW Supabase project.

---

## Migration Files Created/Updated

### 1. `supabase/migrations/0001_init.sql` (Updated)
**Change:** Fixed `users.calories` to have `DEFAULT 0`

**Before:**
```sql
calories INTEGER CHECK (calories > 0),
```

**After:**
```sql
calories INTEGER DEFAULT 0 CHECK (calories >= 0),
```

### 2. `supabase/migrations/0002_fix_users_calories_and_add_missing_tables.sql` (Existing)
- Fixes `users.calories` DEFAULT
- Adds `profiles` table
- Adds `telegram_link_tokens` table

### 3. `supabase/migrations/0003_restore_complete_schema.sql` (NEW - Main Fix)
**Purpose:** Complete idempotent schema restoration

**What it does:**
- Creates ALL tables if they don't exist
- Adds ALL missing columns if tables exist but columns are missing
- Ensures `users.calories` has `DEFAULT 0`
- Ensures `users.goal` exists
- Ensures `reminders` table exists with `is_active` column
- Ensures `app_logs` table exists with `chat_id TEXT` (not BIGINT)
- Fixes `diary.source` constraint to allow `'text'`, `'photo'`, `'audio'`
- Sets up all RLS policies
- Reloads PostgREST schema cache

**Tables created/verified:**
1. `users` - All columns including: id, telegram_id, name, phone, email, gender, age, weight, height, activity, **goal**, **calories** (DEFAULT 0), protein, fat, carbs, water_goal_ml, avatar_url, privacy_accepted, terms_accepted, created_at, updated_at
2. `diary` - With correct source constraint
3. `reminders` - With is_active column (required for scheduler)
4. `app_logs` - With chat_id TEXT column
5. `water_logs`
6. `subscriptions`
7. `payments`
8. `robokassa_invoices`

---

## Code Changes

**No code changes required.** All migrations ensure the schema matches what the code expects.

---

## Verification Steps (Run in Supabase SQL Editor)

### Step 1: Verify users table

```sql
-- Check calories column exists with DEFAULT
SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'users'
  AND column_name IN ('calories', 'goal', 'name', 'phone', 'email');
```

**Expected:**
- `calories`: integer, default `0`, nullable
- `goal`: text, nullable
- All other columns present

### Step 2: Verify reminders table

```sql
-- Check table exists and has is_active column
SELECT 
  column_name, 
  data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'reminders'
ORDER BY ordinal_position;
```

**Expected:** Table exists with columns: id, user_id, type, time, **is_active**, created_at, updated_at

### Step 3: Verify app_logs table

```sql
-- Check chat_id is TEXT (not BIGINT)
SELECT 
  column_name, 
  data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'app_logs'
  AND column_name = 'chat_id';
```

**Expected:** `chat_id` (text) ✅

### Step 4: Verify diary source constraint

```sql
-- Check constraint allows correct values
SELECT 
  conname, 
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.diary'::regclass
  AND conname = 'diary_source_check';
```

**Expected:** `CHECK (source IN ('text', 'photo', 'audio'))`

### Step 5: Test insert (should work)

```sql
-- Test users insert
INSERT INTO users (telegram_id) 
VALUES (999999999) 
ON CONFLICT (telegram_id) DO NOTHING
RETURNING id, telegram_id, calories;

-- Test reminders insert (requires user_id)
INSERT INTO reminders (user_id, type, time)
SELECT id, 'food', '08:00' FROM users WHERE telegram_id = 999999999
LIMIT 1
RETURNING id, user_id, type, time, is_active;

-- Test app_logs insert
INSERT INTO app_logs (level, source, chat_id, message)
VALUES ('info', 'test', '123456789', 'Test message')
RETURNING id, level, source, chat_id;
```

**Expected:** All inserts succeed

---

## How to Apply Migrations

### For a NEW Supabase Project:

1. **Open Supabase Dashboard → SQL Editor**
2. **Run migrations in order:**
   - Copy/paste `supabase/migrations/0001_init.sql` → Run
   - Copy/paste `supabase/migrations/0002_fix_users_calories_and_add_missing_tables.sql` → Run
   - Copy/paste `supabase/migrations/0003_restore_complete_schema.sql` → Run
3. **Reload schema cache:**
   ```sql
   SELECT pg_notify('pgrst', 'reload schema');
   ```

### For an Existing Project (Missing Tables):

**Just run `0003_restore_complete_schema.sql`** - it's idempotent and will:
- Create missing tables
- Add missing columns
- Fix constraints
- Set up RLS policies

---

## Expected Results After Migration

✅ `/start` command works (no "column users.calories does not exist")
✅ `/start` command works (no "column users.goal does not exist")
✅ Reminders scheduler works (no "table reminders does not exist")
✅ Logging works (no "table app_logs does not exist")
✅ Logging works (no "column chat_id does not exist")
✅ Diary inserts work (no "violates check constraint diary_source_check")

---

## Files Changed

1. ✅ `supabase/migrations/0001_init.sql` - Fixed calories DEFAULT
2. ✅ `supabase/migrations/0003_restore_complete_schema.sql` - NEW comprehensive migration
3. ✅ `docs/DB_SETUP.md` - NEW runbook with step-by-step instructions

---

## Next Steps

1. Apply migrations to your NEW Supabase project (see `docs/DB_SETUP.md`)
2. Set environment variables in Vercel
3. Test `/start` command
4. Verify reminders scheduler runs
5. Check logs for any remaining errors

---

## Migration Order

When applying to a fresh database, run in this order:
1. `0001_init.sql` - Creates base schema
2. `0002_fix_users_calories_and_add_missing_tables.sql` - Fixes calories, adds profiles
3. `0003_restore_complete_schema.sql` - Ensures everything exists (idempotent)

**Note:** `0003_restore_complete_schema.sql` can be run standalone on a fresh database - it will create everything.
