-- Phase 0: Add recurring_id and other required fields for recurring payments
-- This migration adds fields required for Robokassa recurring payments

-- Add recurring_id field (stores RecurringID from Robokassa)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS recurring_id TEXT;

-- Add valid_until field (replaces/extends paid_until concept)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;

-- Add last_payment_at field
ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ;

-- Add fail_reason and fail_code for failed payments
ALTER TABLE users
ADD COLUMN IF NOT EXISTS fail_reason TEXT;
ALTER TABLE users
ADD COLUMN IF NOT EXISTS fail_code TEXT;

-- Add retry fields for retry strategy
ALTER TABLE users
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE users
ADD COLUMN IF NOT EXISTS retry_at TIMESTAMPTZ;

-- Create index for recurring billing queries (as per requirements)
-- Query: status in ("trial", "active") AND next_charge_at <= now() AND recurring_id IS NOT NULL
CREATE INDEX IF NOT EXISTS idx_users_recurring_charge 
ON users(subscription_status, next_charge_at, recurring_id) 
WHERE subscription_status IN ('trial', 'active') 
  AND next_charge_at IS NOT NULL 
  AND recurring_id IS NOT NULL
  AND subscription_status != 'canceled';

-- Add comment for documentation
COMMENT ON COLUMN users.recurring_id IS 'RecurringID from Robokassa for recurring payments';
COMMENT ON COLUMN users.valid_until IS 'Subscription valid until this date';
COMMENT ON COLUMN users.last_payment_at IS 'Last successful payment timestamp';
COMMENT ON COLUMN users.fail_reason IS 'Reason for payment failure';
COMMENT ON COLUMN users.fail_code IS 'Error code from Robokassa on failure';

