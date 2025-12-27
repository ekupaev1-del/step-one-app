-- Add 'debug' column to payments table
-- Fixes PGRST204 error: "Could not find the 'debug' column"
-- 
-- Table: public.payments
-- Detected from: miniapp/app/api/robokassa/create-trial/route.ts
--   Line 94: .from('payments')
--   Line 70-78: Insert payload includes 'debug' field as JSONB object
--
-- This migration is safe to run multiple times (uses IF NOT EXISTS)

-- Add debug column (JSONB, nullable, default null)
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS debug JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.payments.debug IS 'Debug information for payment attempts (receipt_raw, receipt_encoded, signature_base, etc.)';

