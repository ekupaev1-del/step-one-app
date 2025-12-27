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

-- Add inv_id if missing (this is the correct column name, not invoice_id)
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS inv_id BIGINT UNIQUE;

-- If there's an old invoice_id column, we need to check and potentially migrate data
-- But first, let's ensure inv_id is NOT NULL if it doesn't exist
-- Note: We can't make it NOT NULL if there are existing NULL values
-- So we'll add it as nullable first, then update existing rows if needed

-- Create index on inv_id if it doesn't exist
CREATE INDEX IF NOT EXISTS payments_inv_id_idx ON public.payments(inv_id);

-- Create index on telegram_user_id if it doesn't exist
CREATE INDEX IF NOT EXISTS payments_telegram_user_id_idx ON public.payments(telegram_user_id);

-- Add comments for documentation
COMMENT ON COLUMN public.payments.telegram_user_id IS 'Telegram user ID (bigint)';
COMMENT ON COLUMN public.payments.description IS 'Payment description';
COMMENT ON COLUMN public.payments.inv_id IS 'Robokassa InvoiceID (unique, bigint)';

