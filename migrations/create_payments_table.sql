-- Create payments table for Robokassa payment tracking
-- This table stores payment records and uses auto-incrementing ID as InvId
-- This migration is idempotent - safe to run multiple times

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.payments (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    plan_code TEXT NOT NULL DEFAULT 'trial_3d_199',
    amount NUMERIC(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RUB',
    status TEXT NOT NULL DEFAULT 'created',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns if they don't exist (for existing tables)
DO $$ 
BEGIN
    -- Add currency if missing (CRITICAL: required by insert)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'payments' 
        AND column_name = 'currency'
    ) THEN
        ALTER TABLE public.payments ADD COLUMN currency TEXT NOT NULL DEFAULT 'RUB';
    END IF;

    -- Add robokassa_invoice_id if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'payments' 
        AND column_name = 'robokassa_invoice_id'
    ) THEN
        ALTER TABLE public.payments ADD COLUMN robokassa_invoice_id BIGINT;
    END IF;

    -- Add payment_url if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'payments' 
        AND column_name = 'payment_url'
    ) THEN
        ALTER TABLE public.payments ADD COLUMN payment_url TEXT;
    END IF;

    -- Add signature if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'payments' 
        AND column_name = 'signature'
    ) THEN
        ALTER TABLE public.payments ADD COLUMN signature TEXT;
    END IF;
END $$;

-- Add constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'payments_status_check'
    ) THEN
        ALTER TABLE public.payments 
        ADD CONSTRAINT payments_status_check 
        CHECK (status IN ('created', 'pending', 'paid', 'failed', 'canceled'));
    END IF;
END $$;

-- Create indexes for performance (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS payments_user_id_created_at_idx ON public.payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_status_idx ON public.payments(status);
CREATE INDEX IF NOT EXISTS payments_robokassa_invoice_id_idx ON public.payments(robokassa_invoice_id);

-- Add comment
COMMENT ON TABLE public.payments IS 'Stores Robokassa payment records. id column is used as InvId for Robokassa.';

-- CRITICAL: Refresh PostgREST schema cache after migration
-- This ensures Supabase API immediately recognizes new columns
SELECT pg_notify('pgrst', 'reload schema');

-- Verify currency column exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'payments' 
        AND column_name = 'currency'
    ) THEN
        RAISE EXCEPTION 'Migration failed: currency column not created';
    END IF;
END $$;
