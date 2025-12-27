-- Fix payments table schema - add missing columns and fix invoice_id/inv_id mismatch
-- Fixes PGRST204 errors: 'telegram_user_id', 'description' columns not found
-- Fixes 23502 error: invoice_id null constraint violation
-- 
-- Run this SQL in Supabase SQL Editor

-- Step 1: Add telegram_user_id if missing
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT;

-- Step 2: Add description if missing
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS description TEXT;

-- Step 3: Handle inv_id vs invoice_id mismatch
-- The code uses 'inv_id', but database might have 'invoice_id'
DO $$
BEGIN
  -- Case 1: invoice_id exists, inv_id doesn't - migrate data and rename
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'payments' 
    AND column_name = 'invoice_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'payments' 
    AND column_name = 'inv_id'
  ) THEN
    -- Add inv_id column
    ALTER TABLE public.payments ADD COLUMN inv_id BIGINT;
    -- Copy data from invoice_id to inv_id
    UPDATE public.payments SET inv_id = invoice_id WHERE invoice_id IS NOT NULL;
    -- Drop NOT NULL constraint from invoice_id if exists
    ALTER TABLE public.payments ALTER COLUMN invoice_id DROP NOT NULL;
    -- Drop old invoice_id column
    ALTER TABLE public.payments DROP COLUMN invoice_id;
    -- Add unique constraint on inv_id
    ALTER TABLE public.payments ADD CONSTRAINT payments_inv_id_unique UNIQUE (inv_id);
  END IF;
  
  -- Case 2: Both invoice_id and inv_id exist - copy data and drop invoice_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'payments' 
    AND column_name = 'invoice_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'payments' 
    AND column_name = 'inv_id'
  ) THEN
    -- Copy data from invoice_id to inv_id where inv_id is NULL
    UPDATE public.payments SET inv_id = invoice_id WHERE inv_id IS NULL AND invoice_id IS NOT NULL;
    -- Drop old invoice_id column
    ALTER TABLE public.payments DROP COLUMN invoice_id;
  END IF;
  
  -- Case 3: inv_id doesn't exist at all - add it
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'payments' 
    AND column_name = 'inv_id'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN inv_id BIGINT;
    -- Add unique constraint if not exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'payments_inv_id_unique'
    ) THEN
      ALTER TABLE public.payments ADD CONSTRAINT payments_inv_id_unique UNIQUE (inv_id);
    END IF;
  END IF;
END $$;

-- Step 4: Ensure inv_id is NOT NULL (but only if no NULL values exist)
DO $$
BEGIN
  -- Check if there are any NULL values in inv_id
  IF NOT EXISTS (SELECT 1 FROM public.payments WHERE inv_id IS NULL) THEN
    -- Safe to add NOT NULL constraint
    ALTER TABLE public.payments ALTER COLUMN inv_id SET NOT NULL;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- If constraint already exists or other error, just continue
    NULL;
END $$;

-- Step 5: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS payments_inv_id_idx ON public.payments(inv_id);
CREATE INDEX IF NOT EXISTS payments_telegram_user_id_idx ON public.payments(telegram_user_id);

-- Step 6: Add comments for documentation
COMMENT ON COLUMN public.payments.telegram_user_id IS 'Telegram user ID (bigint)';
COMMENT ON COLUMN public.payments.description IS 'Payment description';
COMMENT ON COLUMN public.payments.inv_id IS 'Robokassa InvoiceID (unique, bigint, NOT NULL)';

