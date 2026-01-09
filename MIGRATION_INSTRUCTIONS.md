# Payment System Migration Instructions

## Overview
This document provides step-by-step instructions for applying the rebuilt payment system migration.

## Prerequisites
- Access to Supabase Dashboard
- SQL Editor access in Supabase

## Step 1: Apply Database Migration

1. Open Supabase Dashboard → SQL Editor
2. Open the file `migrations/rebuild_payments_table.sql`
3. Copy the entire contents of the file
4. Paste into Supabase SQL Editor
5. Click "Run" to execute

### Important Notes:
- The migration is **idempotent** - safe to run multiple times
- It will add missing columns if the table already exists
- Existing data will be preserved (if any)
- If you want to start fresh, uncomment the `DROP TABLE` line at the top (CAUTION: deletes all payment records)

## Step 2: Refresh PostgREST Schema Cache

After running the migration, refresh the schema cache:

```sql
SELECT pg_notify('pgrst', 'reload schema');
```

Wait 1-2 minutes for the cache to update.

## Step 3: Verify Migration Success

Run this query to verify all required columns exist:

```sql
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'payments'
ORDER BY ordinal_position;
```

### Expected Columns:
- `id` (uuid, PRIMARY KEY)
- `created_at` (timestamptz, NOT NULL)
- `updated_at` (timestamptz, NOT NULL)
- `status` (text, NOT NULL, default 'created')
- `telegram_user_id` (bigint, NOT NULL) ⚠️ **CRITICAL**
- `user_id` (bigint, nullable)
- `plan_code` (text, NOT NULL)
- `amount` (numeric(10,2), NOT NULL)
- `currency` (text, NOT NULL, default 'RUB')
- `inv_id` (bigint, NOT NULL, UNIQUE) ⚠️ **CRITICAL**
- `description` (text, NOT NULL)
- `payment_url` (text, nullable)
- `provider` (text, NOT NULL, default 'robokassa')
- `provider_payload` (jsonb, default '{}')

### Verify Indexes:

```sql
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'payments' AND schemaname = 'public';
```

Expected indexes:
- `payments_telegram_user_id_idx`
- `payments_status_idx`
- `payments_inv_id_idx`
- `payments_user_id_idx`
- `payments_created_at_idx`

## Step 4: Test Payment Flow

1. Deploy the updated code to Vercel
2. Open Mini App in Telegram
3. Navigate to profile page
4. Click "Pay" button
5. Verify:
   - Payment URL is generated
   - Payment record is created in database
   - No NOT NULL constraint errors

## Troubleshooting

### Error: "column 'telegram_user_id' does not exist"
- Run the migration again
- Check that the migration completed successfully
- Refresh PostgREST cache: `SELECT pg_notify('pgrst', 'reload schema');`
- Wait 1-2 minutes

### Error: "null value in column 'inv_id' violates not-null constraint"
- Ensure the migration added the `inv_id` column
- Check that the endpoint is generating `inv_id` before insert
- Verify the column exists: `SELECT column_name FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'inv_id';`

### Error: "duplicate key value violates unique constraint 'payments_inv_id_key'"
- This is rare but can happen if two requests generate the same `inv_id`
- The endpoint has retry logic (5 attempts)
- If it persists, check the `generateInvId()` function

## Rollback (if needed)

If you need to rollback:

1. The old migration files are still in `migrations/create_payments_table.sql`
2. You can restore the old table structure if needed
3. **WARNING**: This will lose all payment records created with the new schema

## Support

If you encounter issues:
1. Check Vercel logs for detailed error messages
2. Check Supabase logs for database errors
3. Use the debug panel in Mini App (`?debug=1`)
4. Verify all environment variables are set correctly
