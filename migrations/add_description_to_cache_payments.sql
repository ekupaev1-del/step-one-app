-- Fix PGRST204 error: "Could not find the 'description' column of 'payments' in the schema cache"
-- 
-- The error indicates PostgREST is looking for the column in schema "cache"
-- This migration adds the description column to the payments table
-- PostgREST will cache the schema automatically after this change

-- Step 1: Add description column to payments table (TEXT, nullable)
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;

-- Step 2: Add comment for documentation
COMMENT ON COLUMN public.payments.description IS 'Payment description (e.g., "Trial subscription 3 days")';

-- Step 3: Reload PostgREST schema cache
-- This ensures PostgREST immediately recognizes the new column
-- Note: In Supabase, PostgREST cache refreshes automatically, but this helps
SELECT pg_notify('pgrst', 'reload schema');

-- Step 4: Verify the column was added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'payments' 
    AND column_name = 'description'
  ) THEN
    RAISE EXCEPTION 'Column description was not added to payments table';
  END IF;
  
  RAISE NOTICE 'Migration completed. Description column added to public.payments.';
  RAISE NOTICE 'PostgREST cache will refresh automatically. If error persists, wait 1-2 minutes.';
END $$;

