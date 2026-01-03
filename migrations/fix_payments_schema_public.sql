-- Fix PGRST204 error: "Could not find the 'description' column of 'payments' in the schema cache"
-- 
-- IMPORTANT: The payments table exists in the 'public' schema, NOT in a 'cache' schema.
-- PostgREST may show "cache" in error messages, but this refers to its internal schema cache,
-- not an actual database schema. The actual table is in public.payments.
--
-- This migration ensures the description column exists in public.payments
-- and refreshes PostgREST schema cache.

-- Step 1: Add description column to public.payments (TEXT, nullable)
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
  
  RAISE NOTICE 'Migration completed. Description column added to public.payments.';
  RAISE NOTICE 'Table schema: public.payments (NOT cache.payments)';
  RAISE NOTICE 'PostgREST cache will refresh automatically. If error persists, wait 1-2 minutes.';
END $$;

-- Step 4: Reload PostgREST schema cache (optional, helps with immediate recognition)
-- Note: This may not work in all environments, but it's safe to include
SELECT pg_notify('pgrst', 'reload schema');

