-- Add parent_invoice_id column to payments table for recurring payments
-- This stores the parent invoice ID for child recurring payments

ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS parent_invoice_id BIGINT DEFAULT NULL;

COMMENT ON COLUMN public.payments.parent_invoice_id IS 'Parent invoice ID for recurring child payments. NULL for parent payments.';

CREATE INDEX IF NOT EXISTS idx_payments_parent_invoice_id ON public.payments(parent_invoice_id);

