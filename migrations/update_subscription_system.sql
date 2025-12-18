-- Update subscription system for trial + autopayment flow
-- 1. Add required fields
ALTER TABLE users
ADD COLUMN IF NOT EXISTS paid_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS next_charge_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS robokassa_initial_invoice_id TEXT;

-- 2. Update subscription_status enum to include all required statuses
ALTER TABLE users
DROP CONSTRAINT IF EXISTS users_subscription_status_check;

ALTER TABLE users
ADD CONSTRAINT users_subscription_status_check 
CHECK (subscription_status IN ('none', 'trial', 'active', 'canceled', 'expired', 'payment_failed'));

-- 3. Update default status to 'none'
ALTER TABLE users
ALTER COLUMN subscription_status SET DEFAULT 'none';

-- 4. Create indexes for recurring billing queries
CREATE INDEX IF NOT EXISTS idx_users_trial_expired 
ON users(subscription_status, next_charge_at) 
WHERE subscription_status = 'trial' AND next_charge_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_active_expired 
ON users(subscription_status, next_charge_at) 
WHERE subscription_status = 'active' AND next_charge_at IS NOT NULL;
