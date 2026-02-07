# Supabase Schema Restoration Guide

## Overview

This guide documents the complete database schema restoration for a fresh Supabase project. The migration file `migrations/000_initial_schema_complete.sql` creates all tables, constraints, indexes, triggers, and RLS policies from scratch.

## Key Design Decisions

### 1. User ID Strategy: BIGINT (Not UUID)
- **Decision**: All user IDs use `BIGINT` throughout the application
- **Rationale**: 
  - Telegram user IDs are numeric (BIGINT)
  - Simpler joins and queries
  - Better performance for numeric comparisons
  - Consistent with existing codebase expectations

### 2. Diary Source vs Channel Separation
- **`diary.source`**: Content type (`'text'`, `'photo'`, `'audio'`)
- **`diary.channel`**: Communication channel (`'telegram'`, `'webapp'`, `'admin'`, `'api'`)
- **Rationale**: 
  - Separates content type from delivery mechanism
  - Allows future expansion (e.g., voice from webapp)
  - Matches CHECK constraint requirements

### 3. RLS Policy Strategy
- **Service Role**: Full access (INSERT, UPDATE, DELETE, SELECT) on all tables
- **Authenticated Users**: Can read their own data (by `user_id`)
- **Rationale**: 
  - Telegram bot and API routes use service role key
  - Web app can use authenticated Supabase sessions
  - Security maintained through service role key protection

### 4. Foreign Key Strategy
- **CASCADE deletes**: `reminders` and `water_logs` cascade when user is deleted
- **SET NULL**: `subscriptions.last_payment_id` set to NULL if payment is deleted
- **Rationale**: 
  - Prevents orphaned records
  - Maintains referential integrity
  - Allows soft deletion patterns

## Tables Created

### 1. `users`
- **Primary Key**: `id` (BIGSERIAL)
- **Unique**: `telegram_id` (BIGINT, nullable)
- **Key Fields**: profile data, nutrition goals, consent flags
- **Indexes**: `telegram_id`, `email`, consent flags

### 2. `diary`
- **Primary Key**: `id` (BIGSERIAL)
- **Foreign Keys**: `user_id` → `users.id`
- **Key Fields**: `meal_text`, macros, `source`, `channel`, `parsed_json`
- **Constraints**: `diary_source_check` (text/photo/audio)
- **Indexes**: `user_id`, `telegram_user_id`, `created_at`, `channel`, `source`

### 3. `subscriptions`
- **Primary Key**: `id` (UUID)
- **Unique**: `user_id` (BIGINT, one subscription per user)
- **Foreign Keys**: `last_payment_id` → `payments.id` (SET NULL)
- **Key Fields**: status, periods, provider subscription ID
- **Indexes**: `user_id`, `status`, `provider`, `next_charge_at`

### 4. `payments`
- **Primary Key**: `id` (BIGSERIAL)
- **Unique**: `(provider, inv_id)` for idempotency
- **Key Fields**: amount, status, provider payload
- **Indexes**: `user_id`, `inv_id`, `status`, `provider`, `subscription_id`

### 5. `reminders`
- **Primary Key**: `id` (BIGSERIAL)
- **Foreign Keys**: `user_id` → `users.id` (CASCADE)
- **Constraints**: `type` (food/water), `time` (HH:MM regex)
- **Indexes**: `user_id`, `type`, `time`, `is_active`

### 6. `water_logs`
- **Primary Key**: `id` (BIGSERIAL)
- **Foreign Keys**: `user_id` → `users.id` (CASCADE)
- **Constraints**: `amount_ml` (0-5000), `source` (telegram/miniapp)
- **Indexes**: `user_id`, `logged_at`, `(user_id, DATE(logged_at))`

### 7. `app_logs`
- **Primary Key**: `id` (BIGSERIAL)
- **Key Fields**: `level`, `source`, `request_id`, `payload`
- **Constraints**: `level` (info/warn/error)
- **Indexes**: `created_at`, `level`, `source`, `request_id`, `user_id`, `telegram_user_id`

### 8. `robokassa_invoices`
- **Primary Key**: `id` (SERIAL - small integer for Robokassa InvId)
- **Key Fields**: `plan_code`, `method`, `status`, `payment_url`
- **Constraints**: `method` (card/sbp), `status` (created/paid/failed/expired)
- **Indexes**: `user_id`, `status`, `request_id`, `created_at`

## Verification Checklist

After running the migration, verify the following:

### 1. Tables Exist
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```
**Expected**: 8 tables (users, diary, subscriptions, payments, reminders, water_logs, app_logs, robokassa_invoices)

### 2. Diary Source Constraint
```sql
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'diary'::regclass 
AND conname = 'diary_source_check';
```
**Expected**: `CHECK (source IN ('text', 'photo', 'audio'))`

### 3. Diary Channel Column
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'diary' 
AND column_name = 'channel';
```
**Expected**: `channel TEXT DEFAULT 'telegram'`

### 4. User ID Types
```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE column_name = 'user_id' 
AND table_schema = 'public'
ORDER BY table_name;
```
**Expected**: All `user_id` columns are `bigint` (not `uuid`)

### 5. RLS Policies
```sql
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```
**Expected**: Each table has service role policies for INSERT/UPDATE/DELETE/SELECT

### 6. Foreign Keys
```sql
SELECT
  tc.table_name, 
  kcu.column_name, 
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;
```
**Expected**: 
- `reminders.user_id` → `users.id` (CASCADE)
- `water_logs.user_id` → `users.id` (CASCADE)
- `subscriptions.last_payment_id` → `payments.id` (SET NULL)

### 7. Indexes
```sql
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```
**Expected**: Multiple indexes per table for performance

## Testing After Migration

### 1. Test User Creation
```sql
-- Insert test user (via service role)
INSERT INTO users (telegram_id) VALUES (123456789) RETURNING id, telegram_id;
```
**Expected**: Returns BIGINT `id` and `telegram_id = 123456789`

### 2. Test Diary Insert
```sql
-- Insert test diary entry
INSERT INTO diary (
  user_id, 
  telegram_user_id, 
  meal_text, 
  calories, 
  protein, 
  fat, 
  carbs, 
  source, 
  channel
) VALUES (
  1, 
  123456789, 
  '2 boiled eggs', 
  140, 
  12, 
  10, 
  1, 
  'text', 
  'telegram'
) RETURNING id, source, channel;
```
**Expected**: Returns row with `source = 'text'`, `channel = 'telegram'`

### 3. Test Constraint Violation
```sql
-- This should fail
INSERT INTO diary (user_id, meal_text, source) VALUES (1, 'test', 'telegram');
```
**Expected**: Error `23514` - constraint violation (source must be 'text', 'photo', or 'audio')

### 4. Test App Logs
```sql
-- Insert test log
INSERT INTO app_logs (level, source, message) 
VALUES ('info', 'test', 'Test log entry') 
RETURNING id, level, source;
```
**Expected**: Returns row with log entry

### 5. Test Subscription/Payment Flow
```sql
-- Create test payment
INSERT INTO payments (user_id, inv_id, amount, status)
VALUES (1, 'test-inv-001', 299.00, 'created')
RETURNING id, inv_id, status;

-- Create test subscription
INSERT INTO subscriptions (user_id, status, last_payment_id)
VALUES (1, 'active', 1)
RETURNING id, user_id, status;
```
**Expected**: Both inserts succeed

## Code Compatibility

The schema matches the existing codebase expectations:

1. **`diaryNormalize.ts`**: Expects `source` ('text'/'photo'/'audio') and `channel` ('telegram'/'webapp'/'admin'/'api')
2. **`logging.ts`**: Expects `app_logs` with `chat_id` (TEXT), `payload` (JSONB)
3. **Bot handlers**: Use BIGINT `user_id` and `telegram_user_id`
4. **Webhook route**: Maps message types to `source` values correctly

## Deployment Steps

1. **Open Supabase SQL Editor**
2. **Run migration**: Copy and paste `migrations/000_initial_schema_complete.sql`
3. **Verify**: Run verification queries above
4. **Test**: Run test queries above
5. **Deploy code**: Push to Vercel (code already matches schema)

## Troubleshooting

### Error: "relation already exists"
- **Cause**: Tables already exist from previous migrations
- **Solution**: Migration is idempotent - safe to run again, or drop tables first if needed

### Error: "permission denied"
- **Cause**: Not using service role key
- **Solution**: Ensure Supabase client uses `SUPABASE_SERVICE_ROLE_KEY` (not anon key)

### Error: "constraint violation"
- **Cause**: Invalid `source` value
- **Solution**: Use 'text', 'photo', or 'audio' (not 'telegram')

### Error: "column does not exist"
- **Cause**: PostgREST schema cache not reloaded
- **Solution**: Migration includes `SELECT pg_notify('pgrst', 'reload schema')` - wait a few seconds

## Next Steps

After schema restoration:
1. ✅ Verify all tables exist
2. ✅ Test user creation via bot `/start`
3. ✅ Test food logging via Telegram
4. ✅ Test subscription/payment flow
5. ✅ Monitor `app_logs` for errors
6. ✅ Verify RLS policies allow service role operations
