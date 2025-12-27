-- STEP 1: Create subscriptions table
-- This table stores all subscription state and logic

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('trial', 'active', 'expired')),
  recurring_id TEXT,
  trial_end_at TIMESTAMPTZ,
  next_charge_at TIMESTAMPTZ,
  last_invoice_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_telegram_user_id ON subscriptions(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_expired ON subscriptions(status, trial_end_at) WHERE status = 'trial' AND trial_end_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_active_charge ON subscriptions(status, next_charge_at) WHERE status = 'active' AND next_charge_at IS NOT NULL;

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscriptions_updated_at();

-- Comments for documentation
COMMENT ON TABLE subscriptions IS 'Subscription state and logic - all managed on our side';
COMMENT ON COLUMN subscriptions.telegram_user_id IS 'Telegram user ID (unique)';
COMMENT ON COLUMN subscriptions.status IS 'Subscription status: trial, active, expired';
COMMENT ON COLUMN subscriptions.recurring_id IS 'RecurringID from Robokassa (saved after first payment)';
COMMENT ON COLUMN subscriptions.trial_end_at IS 'Trial end date (trial_end_at = created_at + 3 days)';
COMMENT ON COLUMN subscriptions.next_charge_at IS 'Next charge date (for recurring payments)';
COMMENT ON COLUMN subscriptions.last_invoice_id IS 'Last InvoiceID used for payment tracking';

