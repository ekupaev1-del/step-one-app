-- Rebuild payments table with proper schema
-- This migration drops and recreates the payments table with correct structure
-- Run this in Supabase SQL Editor

-- Drop existing table if it exists (CAUTION: This will delete all existing payment records)
-- Uncomment the next line only if you want to start fresh:
-- DROP TABLE IF EXISTS public.payments CASCADE;

-- Create payments table with proper schema
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'opened', 'paid', 'failed', 'canceled')),
    telegram_user_id BIGINT NOT NULL,
    user_id BIGINT, -- nullable, internal app user if exists
    plan_code TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RUB',
    inv_id BIGINT NOT NULL UNIQUE, -- our invoice number used in Robokassa URL
    description TEXT NOT NULL,
    payment_url TEXT,
    provider TEXT NOT NULL DEFAULT 'robokassa',
    provider_payload JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS payments_telegram_user_id_idx ON public.payments(telegram_user_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON public.payments(status);
CREATE INDEX IF NOT EXISTS payments_inv_id_idx ON public.payments(inv_id);
CREATE INDEX IF NOT EXISTS payments_user_id_idx ON public.payments(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_created_at_idx ON public.payments(created_at DESC);

-- Add comment
COMMENT ON TABLE public.payments IS 'Stores payment records for Robokassa. inv_id is used as InvId in Robokassa payment URLs.';

-- If table already exists, add missing columns idempotently
DO $$ 
BEGIN
    -- Add id as UUID if it doesn't exist or is not UUID
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'payments' 
        AND column_name = 'id'
        AND data_type = 'uuid'
    ) THEN
        -- If id exists but is not UUID, we need to handle migration carefully
        -- For now, we'll just ensure the column exists with correct type
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'payments' 
            AND column_name = 'id'
        ) THEN
            -- Column exists but wrong type - skip for now (manual migration needed)
            RAISE NOTICE 'Column id exists but is not UUID. Manual migration may be required.';
        ELSE
            ALTER TABLE public.payments ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid();
        END IF;
    END IF;

    -- Add telegram_user_id if missing (CRITICAL)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'payments' 
        AND column_name = 'telegram_user_id'
    ) THEN
        ALTER TABLE public.payments ADD COLUMN telegram_user_id BIGINT NOT NULL DEFAULT 0;
        -- Update existing rows if any (you may need to adjust this)
        UPDATE public.payments SET telegram_user_id = COALESCE(user_id, 0) WHERE telegram_user_id = 0;
    END IF;

    -- Add plan_code if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'payments' 
        AND column_name = 'plan_code'
    ) THEN
        ALTER TABLE public.payments ADD COLUMN plan_code TEXT NOT NULL DEFAULT 'trial_3d_199';
    END IF;

    -- Add amount if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'payments' 
        AND column_name = 'amount'
    ) THEN
        ALTER TABLE public.payments ADD COLUMN amount NUMERIC(10,2) NOT NULL DEFAULT 0;
    END IF;

    -- Add currency if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'payments' 
        AND column_name = 'currency'
    ) THEN
        ALTER TABLE public.payments ADD COLUMN currency TEXT NOT NULL DEFAULT 'RUB';
    END IF;

    -- Add inv_id if missing (CRITICAL)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'payments' 
        AND column_name = 'inv_id'
    ) THEN
        ALTER TABLE public.payments ADD COLUMN inv_id BIGINT NOT NULL;
        -- Generate unique inv_id for existing rows
        UPDATE public.payments SET inv_id = COALESCE(
            (SELECT id::bigint FROM payments p2 WHERE p2.id::text = payments.id::text LIMIT 1),
            EXTRACT(EPOCH FROM NOW())::bigint * 1000 + (random() * 999)::int
        ) WHERE inv_id IS NULL;
        -- Add unique constraint
        CREATE UNIQUE INDEX IF NOT EXISTS payments_inv_id_unique_idx ON public.payments(inv_id);
    END IF;

    -- Add description if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'payments' 
        AND column_name = 'description'
    ) THEN
        ALTER TABLE public.payments ADD COLUMN description TEXT NOT NULL DEFAULT '';
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

    -- Add provider if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'payments' 
        AND column_name = 'provider'
    ) THEN
        ALTER TABLE public.payments ADD COLUMN provider TEXT NOT NULL DEFAULT 'robokassa';
    END IF;

    -- Add provider_payload if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'payments' 
        AND column_name = 'provider_payload'
    ) THEN
        ALTER TABLE public.payments ADD COLUMN provider_payload JSONB DEFAULT '{}'::jsonb;
    END IF;

    -- Add status constraint if missing
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'payments_status_check'
    ) THEN
        ALTER TABLE public.payments 
        ADD CONSTRAINT payments_status_check 
        CHECK (status IN ('created', 'opened', 'paid', 'failed', 'canceled'));
    END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS payments_telegram_user_id_idx ON public.payments(telegram_user_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON public.payments(status);
CREATE INDEX IF NOT EXISTS payments_inv_id_idx ON public.payments(inv_id);
CREATE INDEX IF NOT EXISTS payments_user_id_idx ON public.payments(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_created_at_idx ON public.payments(created_at DESC);

-- Ensure unique constraint on inv_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'payments_inv_id_key'
    ) THEN
        ALTER TABLE public.payments 
        ADD CONSTRAINT payments_inv_id_key UNIQUE (inv_id);
    END IF;
END $$;

-- CRITICAL: Refresh PostgREST schema cache after migration
SELECT pg_notify('pgrst', 'reload schema');

-- Verify critical columns exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'payments' 
        AND column_name = 'telegram_user_id'
    ) THEN
        RAISE EXCEPTION 'Migration failed: telegram_user_id column not created';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'payments' 
        AND column_name = 'inv_id'
    ) THEN
        RAISE EXCEPTION 'Migration failed: inv_id column not created';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'payments' 
        AND column_name = 'plan_code'
    ) THEN
        RAISE EXCEPTION 'Migration failed: plan_code column not created';
    END IF;
END $$;
