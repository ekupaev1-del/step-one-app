-- Add subscription fields to users
ALTER TABLE users
ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'trial' CHECK (subscription_status IN ('trial','active','expired')),
ADD COLUMN IF NOT EXISTS trial_end_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_end_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS robokassa_parent_invoice_id TEXT,
ADD COLUMN IF NOT EXISTS last_payment_status TEXT;

-- Payments table for Robokassa transactions
CREATE TABLE IF NOT EXISTS payments (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    invoice_id TEXT NOT NULL UNIQUE,
    previous_invoice_id TEXT,
    amount NUMERIC(10,2) NOT NULL,
    status TEXT NOT NULL,
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_previous_invoice_id ON payments(previous_invoice_id);
