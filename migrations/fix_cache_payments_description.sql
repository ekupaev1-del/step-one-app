-- Fix PGRST204 error: "Could not find the 'description' column of 'payments' in the schema 'cache'"
-- 
-- This migration ensures the description column exists in public.payments
-- and handles PostgREST schema cache reload
--
-- Error context:
-- - Vercel logs show: PGRST204 "Could not find the 'description' column of 'payments' in the schema 'cache'"
-- - This suggests PostgREST is looking in a cached schema
-- - The table is in public.payments, but PostgREST cache needs to be updated
--
-- Table: public.payments
-- Source: miniapp/app/api/robokassa/create-trial/route.ts
--   Line 76: Insert payload includes 'description' field

-- Step 1: Ensure description column exists in public.payments (TEXT, nullable)
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;

-- Step 2: Add comment for documentation
COMMENT ON COLUMN public.payments.description IS 'Payment description (e.g., "Trial subscription 3 days")';

-- Step 3: Verify the column exists in public schema
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'payments' 
    AND column_name = 'description'
  ) THEN
    RAISE EXCEPTION 'Column description was not added to public.payments table';
  END IF;
END $$;

-- Step 4: Reload PostgREST schema cache
-- This ensures PostgREST immediately recognizes the new column
-- Note: pg_notify may not work in all environments, but it's safe to include
SELECT pg_notify('pgrst', 'reload schema');

-- Step 5: Verify all required columns exist (check against code expectations)
DO $$
DECLARE
  missing_cols TEXT[];
BEGIN
  SELECT array_agg(missing.column_name)
  INTO missing_cols
  FROM (
    SELECT unnest(ARRAY['id', 'user_id', 'telegram_user_id', 'inv_id', 'out_sum', 'mode', 'status', 'description', 'debug', 'created_at', 'updated_at']) AS column_name
  ) expected
  LEFT JOIN information_schema.columns actual
    ON actual.table_schema = 'public'
    AND actual.table_name = 'payments'
    AND actual.column_name = expected.column_name
  WHERE actual.column_name IS NULL;
  
  IF array_length(missing_cols, 1) > 0 THEN
    RAISE WARNING 'Missing columns in public.payments: %', array_to_string(missing_cols, ', ');
  END IF;
END $$;

-- Step 6: Final verification message
DO $$
BEGIN
  RAISE NOTICE 'Migration completed. Description column added to public.payments.';
  RAISE NOTICE 'If PostgREST cache error persists, restart PostgREST service or wait for cache refresh.';
END $$;

