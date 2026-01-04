-- Add parent_invoice_id column to existing subscriptions table
-- Per requirements: store parent_invoice_id for recurring payments

-- Check if subscriptions table exists, if not create it
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL,
  payment_id BIGINT REFERENCES public.payments(inv_id),
  status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'cancelled', 'trial')),
  plan_type TEXT NOT NULL CHECK (plan_type IN ('trial', 'standard', 'standard_plus')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add parent_invoice_id column if it doesn't exist
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS parent_invoice_id BIGINT;

-- Make telegram_user_id unique if not already
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'subscriptions_telegram_user_id_key'
  ) THEN
    ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_telegram_user_id_key UNIQUE (telegram_user_id);
  END IF;
END $$;

-- Create index on telegram_user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_telegram_user_id ON public.subscriptions(telegram_user_id);

-- Create index on parent_invoice_id for recurring charge lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_parent_invoice_id ON public.subscriptions(parent_invoice_id);

-- Comments for documentation
COMMENT ON TABLE public.subscriptions IS 'Stores subscription information and parent invoice IDs for recurring payments';
COMMENT ON COLUMN public.subscriptions.telegram_user_id IS 'Telegram user ID (unique)';
COMMENT ON COLUMN public.subscriptions.parent_invoice_id IS 'Parent invoice ID from Robokassa (for recurring charges)';
COMMENT ON COLUMN public.subscriptions.status IS 'Subscription status: trial, active, expired, cancelled';
COMMENT ON COLUMN public.subscriptions.trial_started_at IS 'When trial period started (set after payment confirmation)';
COMMENT ON COLUMN public.subscriptions.trial_ends_at IS 'When trial period ends (trial_started_at + 3 days)';

