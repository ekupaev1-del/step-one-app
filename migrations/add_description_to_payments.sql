-- Add 'description' column to payments table
-- Fixes PGRST204 error: "Could not find the 'description' column of 'payments' in the schema cache"
-- 
-- Table: public.payments
-- Detected from: miniapp/app/api/robokassa/create-trial/route.ts
--   Line 94: .from('payments')
--   Line 69: Insert payload includes 'description' field
--
-- This migration is safe to run multiple times (uses IF NOT EXISTS)

-- Step 1: Add description column (TEXT, nullable, default null)
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;

-- Step 2: Add comment for documentation
COMMENT ON COLUMN public.payments.description IS 'Payment description (e.g., "Trial subscription 3 days")';

-- Step 3: Reload PostgREST schema cache
-- This ensures PostgREST immediately recognizes the new column
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
END $$;

