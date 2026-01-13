-- Migration: Create payments table
-- Execute in Supabase SQL Editor

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL,
  telegram_user_id TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  inv_id BIGINT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'robokassa',
  status TEXT NOT NULL DEFAULT 'created',
  payment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT payments_status_check CHECK (status IN ('created', 'pending', 'paid', 'failed', 'canceled')),
  CONSTRAINT payments_currency_check CHECK (currency = 'RUB'),
  CONSTRAINT payments_provider_check CHECK (provider = 'robokassa'),
  CONSTRAINT payments_amount_check CHECK (amount > 0)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_telegram_user_id ON payments(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_payments_inv_id ON payments(inv_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

-- Add foreign key constraint (if users table exists)
-- ALTER TABLE payments ADD CONSTRAINT fk_payments_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Add comments
COMMENT ON TABLE payments IS 'Payment records for subscription purchases';
COMMENT ON COLUMN payments.user_id IS 'Reference to users.id';
COMMENT ON COLUMN payments.telegram_user_id IS 'Telegram user ID from initData (as string)';
COMMENT ON COLUMN payments.plan_code IS 'Subscription plan code (e.g., monthly_199)';
COMMENT ON COLUMN payments.inv_id IS 'Invoice ID used with payment provider';
COMMENT ON COLUMN payments.status IS 'Payment status: created|pending|paid|failed|canceled';
COMMENT ON COLUMN payments.payment_url IS 'Provider payment URL for redirect';

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payments_updated_at_trigger
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_payments_updated_at();

-- Notify PostgREST to reload schema cache
SELECT pg_notify('pgrst', 'reload schema');
