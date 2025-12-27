-- Fix payments table schema - add missing columns
-- Fixes PGRST204 errors: 'telegram_user_id', 'description' columns not found
-- Fixes 23502 error: invoice_id null constraint violation
-- 
-- Run this SQL in Supabase SQL Editor

-- Add telegram_user_id if missing
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT;

-- Add description if missing
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS description TEXT;

-- Handle inv_id vs invoice_id mismatch
-- Check if invoice_id exists and migrate to inv_id
DO $$
BEGIN
  -- If invoice_id column exists but inv_id doesn't, copy data and rename
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
    -- Drop old invoice_id column
    ALTER TABLE public.payments DROP COLUMN invoice_id;
    -- Add unique constraint
    ALTER TABLE public.payments ADD CONSTRAINT payments_inv_id_unique UNIQUE (inv_id);
  END IF;
  
  -- If inv_id doesn't exist at all, add it
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'payments' 
    AND column_name = 'inv_id'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN inv_id BIGINT UNIQUE;
  END IF;
END $$;

-- Create index on inv_id if it doesn't exist
CREATE INDEX IF NOT EXISTS payments_inv_id_idx ON public.payments(inv_id);

-- Create index on telegram_user_id if it doesn't exist
CREATE INDEX IF NOT EXISTS payments_telegram_user_id_idx ON public.payments(telegram_user_id);

-- Add comments for documentation
COMMENT ON COLUMN public.payments.telegram_user_id IS 'Telegram user ID (bigint)';
COMMENT ON COLUMN public.payments.description IS 'Payment description';
COMMENT ON COLUMN public.payments.inv_id IS 'Robokassa InvoiceID (unique, bigint)';

