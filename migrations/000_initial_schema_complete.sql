-- ============================================================================
-- COMPLETE SUPABASE SCHEMA RESTORATION
-- ============================================================================
-- This migration creates the entire database schema from scratch
-- for a fresh Supabase project. It is idempotent and safe to run multiple times.
--
-- Design Decisions:
-- 1. All user IDs use BIGINT (not UUID) for consistency
-- 2. diary.source = content type ('text', 'photo', 'audio')
-- 3. diary.channel = communication channel ('telegram', 'webapp', 'admin', 'api')
-- 4. RLS policies allow service_role full access (required for bot/API)
-- 5. All tables have proper indexes for performance
-- 6. All constraints are explicitly defined
-- ============================================================================

-- ============================================================================
-- TABLE 1: users
-- ============================================================================
-- Core user table with Telegram integration and profile data

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE, -- Telegram user ID (nullable for future web-only users)
  name TEXT,
  phone TEXT,
  email TEXT,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  age INTEGER CHECK (age > 0 AND age < 150),
  weight NUMERIC(5, 2) CHECK (weight > 0 AND weight < 1000), -- kg
  height INTEGER CHECK (height > 0 AND height < 300), -- cm
  activity TEXT CHECK (activity IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal TEXT CHECK (goal IN ('lose', 'maintain', 'gain')),
  calories INTEGER CHECK (calories > 0),
  protein NUMERIC(6, 2) CHECK (protein >= 0),
  fat NUMERIC(6, 2) CHECK (fat >= 0),
  carbs NUMERIC(6, 2) CHECK (carbs >= 0),
  water_goal_ml INTEGER CHECK (water_goal_ml > 0 AND water_goal_ml < 10000),
  avatar_url TEXT,
  privacy_accepted BOOLEAN DEFAULT false,
  privacy_accepted_at TIMESTAMPTZ,
  terms_accepted BOOLEAN DEFAULT false,
  terms_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for users
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id) WHERE telegram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_privacy_accepted ON users(privacy_accepted) WHERE privacy_accepted = false;
CREATE INDEX IF NOT EXISTS idx_users_terms_accepted ON users(terms_accepted) WHERE terms_accepted = false;

-- ============================================================================
-- TABLE 2: diary
-- ============================================================================
-- Food diary entries from Telegram, webapp, API, etc.

CREATE TABLE IF NOT EXISTS diary (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL DEFAULT 0, -- Internal user ID (BIGINT)
  telegram_user_id BIGINT, -- Telegram user ID (for direct queries)
  meal_text TEXT NOT NULL,
  calories NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (calories >= 0),
  protein NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (protein >= 0),
  fat NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (fat >= 0),
  carbs NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (carbs >= 0),
  source TEXT NOT NULL CHECK (source IN ('text', 'photo', 'audio')), -- Content type
  channel TEXT DEFAULT 'telegram' CHECK (channel IN ('telegram', 'webapp', 'admin', 'api')), -- Communication channel
  message_id BIGINT, -- Telegram message ID (nullable)
  chat_id BIGINT, -- Telegram chat ID (nullable)
  parsed_json JSONB DEFAULT '{}'::jsonb, -- Full LLM analysis result
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for diary
CREATE INDEX IF NOT EXISTS idx_diary_user_id ON diary(user_id);
CREATE INDEX IF NOT EXISTS idx_diary_telegram_user_id ON diary(telegram_user_id) WHERE telegram_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diary_created_at ON diary(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diary_channel ON diary(channel) WHERE channel IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diary_source ON diary(source);
-- Note: Composite index (user_id, date) removed - not IMMUTABLE with TIMESTAMPTZ
-- Use separate indexes idx_diary_user_id and idx_diary_created_at instead

-- ============================================================================
-- TABLE 3: subscriptions
-- ============================================================================
-- User subscription records (one per user)

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL UNIQUE, -- One subscription per user
  provider TEXT NOT NULL DEFAULT 'robokassa',
  provider_subscription_id TEXT, -- Subscription ID from provider (nullable)
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'past_due', 'canceled')),
  started_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  next_charge_at TIMESTAMPTZ,
  last_payment_id BIGINT, -- FK to payments.id (nullable)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider ON subscriptions(provider);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_charge_at ON subscriptions(next_charge_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_subscription_id ON subscriptions(provider_subscription_id) WHERE provider_subscription_id IS NOT NULL;

-- ============================================================================
-- TABLE 4: payments
-- ============================================================================
-- Payment records for subscriptions and one-time payments

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'robokassa',
  inv_id TEXT NOT NULL, -- Invoice ID from provider
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'RUB',
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed', 'refunded')),
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  subscription_id TEXT, -- Provider subscription ID (nullable)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  provider_payload JSONB DEFAULT '{}'::jsonb
);

-- Unique constraint on (provider, inv_id) for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_inv_id_unique ON payments(provider, inv_id);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_inv_id ON payments(inv_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_provider ON payments(provider);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON payments(subscription_id) WHERE subscription_id IS NOT NULL;

-- Foreign key: subscriptions.last_payment_id -> payments.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_subscriptions_last_payment_id'
  ) THEN
    ALTER TABLE subscriptions ADD CONSTRAINT fk_subscriptions_last_payment_id 
    FOREIGN KEY (last_payment_id) REFERENCES payments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- TABLE 5: reminders
-- ============================================================================
-- User reminders for food and water

CREATE TABLE IF NOT EXISTS reminders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('food', 'water')),
  time TEXT NOT NULL CHECK (time ~ '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'), -- HH:MM format
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Foreign key: reminders.user_id -> users.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_reminders_user_id'
  ) THEN
    ALTER TABLE reminders ADD CONSTRAINT fk_reminders_user_id 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Indexes for reminders
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_type ON reminders(type);
CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders(time);
CREATE INDEX IF NOT EXISTS idx_reminders_active ON reminders(is_active) WHERE is_active = true;

-- ============================================================================
-- TABLE 6: water_logs
-- ============================================================================
-- Water intake tracking logs

CREATE TABLE IF NOT EXISTS water_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  amount_ml INTEGER NOT NULL CHECK (amount_ml > 0 AND amount_ml < 5000),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL CHECK (source IN ('telegram', 'miniapp')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Foreign key: water_logs.user_id -> users.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_water_logs_user_id'
  ) THEN
    ALTER TABLE water_logs ADD CONSTRAINT fk_water_logs_user_id 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Indexes for water_logs
CREATE INDEX IF NOT EXISTS idx_water_logs_user_id ON water_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_water_logs_logged_at ON water_logs(logged_at);
-- Note: Composite index (user_id, date) removed - not IMMUTABLE with TIMESTAMPTZ
-- Use separate indexes idx_water_logs_user_id and idx_water_logs_logged_at instead

-- ============================================================================
-- TABLE 7: app_logs
-- ============================================================================
-- Application logs for debugging and observability

CREATE TABLE IF NOT EXISTS app_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  source TEXT NOT NULL,
  request_id TEXT,
  user_id BIGINT,
  telegram_user_id BIGINT,
  chat_id TEXT, -- TEXT to match code expectations
  message TEXT,
  payload JSONB DEFAULT '{}'::jsonb
);

-- Indexes for app_logs
CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON app_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_level ON app_logs(level);
CREATE INDEX IF NOT EXISTS idx_app_logs_source ON app_logs(source);
CREATE INDEX IF NOT EXISTS idx_app_logs_request_id ON app_logs(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_logs_user_id ON app_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_logs_telegram_user_id ON app_logs(telegram_user_id) WHERE telegram_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_logs_chat_id ON app_logs(chat_id) WHERE chat_id IS NOT NULL;

-- ============================================================================
-- TABLE 8: robokassa_invoices
-- ============================================================================
-- Robokassa invoice records (for payment processing)

CREATE TABLE IF NOT EXISTS robokassa_invoices (
  id SERIAL PRIMARY KEY, -- Auto-increment integer (used as Robokassa InvId)
  user_id BIGINT NOT NULL,
  plan_code TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('card', 'sbp')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'RUB',
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed', 'expired')),
  request_id TEXT, -- Internal request ID for tracking
  payment_url TEXT, -- Generated Robokassa payment URL
  raw_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for robokassa_invoices
CREATE INDEX IF NOT EXISTS idx_robokassa_invoices_user_id ON robokassa_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_robokassa_invoices_status ON robokassa_invoices(status);
CREATE INDEX IF NOT EXISTS idx_robokassa_invoices_request_id ON robokassa_invoices(request_id);
CREATE INDEX IF NOT EXISTS idx_robokassa_invoices_created_at ON robokassa_invoices(created_at);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for users.updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for subscriptions.updated_at
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for reminders.updated_at
DROP TRIGGER IF EXISTS update_reminders_updated_at ON reminders;
CREATE TRIGGER update_reminders_updated_at
  BEFORE UPDATE ON reminders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for robokassa_invoices.updated_at
DROP TRIGGER IF EXISTS update_robokassa_invoices_updated_at ON robokassa_invoices;
CREATE TRIGGER update_robokassa_invoices_updated_at
  BEFORE UPDATE ON robokassa_invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- All tables use RLS with service_role having full access
-- This is required for the Telegram bot and API routes

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE water_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE robokassa_invoices ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES: users
-- ============================================================================

DROP POLICY IF EXISTS users_select_own ON users;
DROP POLICY IF EXISTS users_insert_service ON users;
DROP POLICY IF EXISTS users_update_service ON users;

-- Users can read their own data (by user_id or telegram_id)
CREATE POLICY users_select_own ON users
  FOR SELECT
  USING (
    auth.role() = 'service_role' OR
    (auth.uid() IS NOT NULL AND id::text = auth.uid()::text)
  );

-- Service role can insert/update everything
CREATE POLICY users_insert_service ON users
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY users_update_service ON users
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- ============================================================================
-- RLS POLICIES: diary
-- ============================================================================

DROP POLICY IF EXISTS diary_select_own ON diary;
DROP POLICY IF EXISTS diary_insert_service ON diary;
DROP POLICY IF EXISTS diary_update_service ON diary;
DROP POLICY IF EXISTS diary_delete_service ON diary;

-- Users can read their own diary entries
CREATE POLICY diary_select_own ON diary
  FOR SELECT
  USING (
    auth.role() = 'service_role' OR
    (auth.uid() IS NOT NULL AND user_id::text = auth.uid()::text)
  );

-- Service role can insert/update/delete everything
CREATE POLICY diary_insert_service ON diary
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY diary_update_service ON diary
  FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY diary_delete_service ON diary
  FOR DELETE
  USING (auth.role() = 'service_role');

-- ============================================================================
-- RLS POLICIES: subscriptions
-- ============================================================================

DROP POLICY IF EXISTS subscriptions_select_own ON subscriptions;
DROP POLICY IF EXISTS subscriptions_insert_service ON subscriptions;
DROP POLICY IF EXISTS subscriptions_update_service ON subscriptions;

-- Users can read their own subscription
CREATE POLICY subscriptions_select_own ON subscriptions
  FOR SELECT
  USING (
    auth.role() = 'service_role' OR
    (auth.uid() IS NOT NULL AND user_id::text = auth.uid()::text)
  );

-- Service role can insert/update everything
CREATE POLICY subscriptions_insert_service ON subscriptions
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY subscriptions_update_service ON subscriptions
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- ============================================================================
-- RLS POLICIES: payments
-- ============================================================================

DROP POLICY IF EXISTS payments_select_own ON payments;
DROP POLICY IF EXISTS payments_insert_service ON payments;
DROP POLICY IF EXISTS payments_update_service ON payments;

-- Users can read their own payments
CREATE POLICY payments_select_own ON payments
  FOR SELECT
  USING (
    auth.role() = 'service_role' OR
    (auth.uid() IS NOT NULL AND user_id::text = auth.uid()::text)
  );

-- Service role can insert/update everything
CREATE POLICY payments_insert_service ON payments
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY payments_update_service ON payments
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- ============================================================================
-- RLS POLICIES: reminders
-- ============================================================================

DROP POLICY IF EXISTS reminders_select_own ON reminders;
DROP POLICY IF EXISTS reminders_insert_service ON reminders;
DROP POLICY IF EXISTS reminders_update_service ON reminders;
DROP POLICY IF EXISTS reminders_delete_service ON reminders;

-- Users can read their own reminders
CREATE POLICY reminders_select_own ON reminders
  FOR SELECT
  USING (
    auth.role() = 'service_role' OR
    (auth.uid() IS NOT NULL AND user_id::text = auth.uid()::text)
  );

-- Service role can insert/update/delete everything
CREATE POLICY reminders_insert_service ON reminders
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY reminders_update_service ON reminders
  FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY reminders_delete_service ON reminders
  FOR DELETE
  USING (auth.role() = 'service_role');

-- ============================================================================
-- RLS POLICIES: water_logs
-- ============================================================================

DROP POLICY IF EXISTS water_logs_select_own ON water_logs;
DROP POLICY IF EXISTS water_logs_insert_service ON water_logs;
DROP POLICY IF EXISTS water_logs_update_service ON water_logs;
DROP POLICY IF EXISTS water_logs_delete_service ON water_logs;

-- Users can read their own water logs
CREATE POLICY water_logs_select_own ON water_logs
  FOR SELECT
  USING (
    auth.role() = 'service_role' OR
    (auth.uid() IS NOT NULL AND user_id::text = auth.uid()::text)
  );

-- Service role can insert/update/delete everything
CREATE POLICY water_logs_insert_service ON water_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY water_logs_update_service ON water_logs
  FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY water_logs_delete_service ON water_logs
  FOR DELETE
  USING (auth.role() = 'service_role');

-- ============================================================================
-- RLS POLICIES: app_logs
-- ============================================================================

DROP POLICY IF EXISTS app_logs_select_service ON app_logs;
DROP POLICY IF EXISTS app_logs_insert_service ON app_logs;

-- Only service role can read/write logs
CREATE POLICY app_logs_insert_service ON app_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY app_logs_select_service ON app_logs
  FOR SELECT
  USING (auth.role() = 'service_role');

-- ============================================================================
-- RLS POLICIES: robokassa_invoices
-- ============================================================================

DROP POLICY IF EXISTS robokassa_invoices_select_service ON robokassa_invoices;
DROP POLICY IF EXISTS robokassa_invoices_insert_service ON robokassa_invoices;
DROP POLICY IF EXISTS robokassa_invoices_update_service ON robokassa_invoices;

-- Only service role can read/write invoices
CREATE POLICY robokassa_invoices_insert_service ON robokassa_invoices
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY robokassa_invoices_update_service ON robokassa_invoices
  FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY robokassa_invoices_select_service ON robokassa_invoices
  FOR SELECT
  USING (auth.role() = 'service_role');

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE users IS 'Core user table with Telegram integration and profile data. Uses BIGINT id for consistency.';
COMMENT ON COLUMN users.telegram_id IS 'Telegram user ID (BIGINT, unique, nullable for future web-only users)';
COMMENT ON COLUMN users.id IS 'Internal user ID (BIGINT, primary key)';

COMMENT ON TABLE diary IS 'Food diary entries from Telegram, webapp, API, etc. Uses BIGINT user_id.';
COMMENT ON COLUMN diary.source IS 'Content type: text, photo, or audio';
COMMENT ON COLUMN diary.channel IS 'Communication channel: telegram, webapp, admin, or api';
COMMENT ON COLUMN diary.user_id IS 'Internal user ID (BIGINT, references users.id)';

COMMENT ON TABLE subscriptions IS 'User subscription records - one per user';
COMMENT ON COLUMN subscriptions.user_id IS 'Internal user ID (BIGINT, unique)';
COMMENT ON COLUMN subscriptions.provider_subscription_id IS 'Subscription ID from payment provider (e.g., Robokassa)';
COMMENT ON COLUMN subscriptions.last_payment_id IS 'Reference to the last successful payment for this subscription';

COMMENT ON TABLE payments IS 'Payment records for subscriptions and one-time payments';
COMMENT ON COLUMN payments.is_recurring IS 'Whether this payment is part of a recurring subscription';
COMMENT ON COLUMN payments.subscription_id IS 'Provider subscription ID (e.g., Robokassa subscription ID)';

COMMENT ON TABLE reminders IS 'User reminders for food and water';
COMMENT ON COLUMN reminders.type IS 'Type of reminder: food or water';
COMMENT ON COLUMN reminders.time IS 'Time in HH:MM format (24-hour)';

COMMENT ON TABLE water_logs IS 'Water intake tracking logs';
COMMENT ON COLUMN water_logs.amount_ml IS 'Amount of water in milliliters';
COMMENT ON COLUMN water_logs.logged_at IS 'Time when water was consumed (may differ from created_at)';
COMMENT ON COLUMN water_logs.source IS 'Source of entry: telegram or miniapp';

COMMENT ON TABLE app_logs IS 'Application logs for debugging and observability. Uses BIGINT user_id.';
COMMENT ON COLUMN app_logs.user_id IS 'Internal user ID (BIGINT from users table)';
COMMENT ON COLUMN app_logs.telegram_user_id IS 'Telegram user ID (BIGINT)';
COMMENT ON COLUMN app_logs.chat_id IS 'Telegram chat ID (TEXT)';
COMMENT ON COLUMN app_logs.message IS 'Error message or log message';
COMMENT ON COLUMN app_logs.payload IS 'Additional metadata as JSONB';

COMMENT ON TABLE robokassa_invoices IS 'Robokassa invoice records. The id field is used as InvId in Robokassa payment URLs (must be small integer).';
COMMENT ON COLUMN robokassa_invoices.id IS 'Auto-increment integer used as Robokassa InvId (small integer, within supported range)';
COMMENT ON COLUMN robokassa_invoices.request_id IS 'Internal request ID for tracking (can contain hyphens/letters, stored separately from InvId)';

-- ============================================================================
-- RELOAD POSTGREST SCHEMA CACHE
-- ============================================================================
-- This ensures Supabase PostgREST API immediately recognizes the new schema

SELECT pg_notify('pgrst', 'reload schema');

-- ============================================================================
-- VERIFICATION QUERIES (for manual testing)
-- ============================================================================
-- Uncomment these to verify the schema after running the migration:

-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'diary' ORDER BY ordinal_position;
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'diary'::regclass;
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'diary';
