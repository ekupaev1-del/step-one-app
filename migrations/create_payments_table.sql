-- Create payments table for Robokassa payment tracking
-- This table stores payment records and uses auto-incrementing ID as InvId

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.payments (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    plan_code TEXT NOT NULL DEFAULT 'trial_3d_199',
    amount NUMERIC(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RUB',
    status TEXT NOT NULL DEFAULT 'created',
    robokassa_invoice_id BIGINT,
    payment_url TEXT,
    signature TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT payments_status_check CHECK (status IN ('created', 'pending', 'paid', 'failed', 'canceled'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS payments_user_id_created_at_idx ON public.payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_status_idx ON public.payments(status);
CREATE INDEX IF NOT EXISTS payments_robokassa_invoice_id_idx ON public.payments(robokassa_invoice_id);

-- Add comment
COMMENT ON TABLE public.payments IS 'Stores Robokassa payment records. id column is used as InvId for Robokassa.';
