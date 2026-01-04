-- Create subscriptions table for storing parent invoice IDs
-- Per requirements: store parent_invoice_id for recurring payments

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id BIGINT NOT NULL UNIQUE,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'trial',
  parent_invoice_id BIGINT,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

