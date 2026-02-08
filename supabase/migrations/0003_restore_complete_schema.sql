-- ============================================================================
-- COMPLETE SCHEMA RESTORATION MIGRATION
-- ============================================================================
-- This migration ensures ALL tables and columns exist as expected by the code.
-- It is idempotent and safe to run on a fresh Supabase project or existing one.
--
-- Run this in Supabase SQL Editor or via Supabase CLI:
--   supabase db push
--
-- This migration fixes:
-- 1. users table with ALL columns (calories, goal, etc.)
-- 2. reminders table (required for scheduler)
-- 3. app_logs table with chat_id column (TEXT)
-- 4. diary table with correct constraints
-- 5. water_logs table
-- 6. All other required tables
-- ============================================================================

-- ============================================================================
-- TABLE 1: users (with ALL columns used by code)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE,
  name TEXT,
  phone TEXT,
  email TEXT,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  age INTEGER CHECK (age > 0 AND age < 150),
  weight NUMERIC(5, 2) CHECK (weight > 0 AND weight < 1000),
  height INTEGER CHECK (height > 0 AND height < 300),
  activity TEXT CHECK (activity IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal TEXT CHECK (goal IN ('lose', 'maintain', 'gain')),
  calories INTEGER DEFAULT 0 CHECK (calories >= 0),
  protein NUMERIC(6, 2) DEFAULT 0 CHECK (protein >= 0),
  fat NUMERIC(6, 2) DEFAULT 0 CHECK (fat >= 0),
  carbs NUMERIC(6, 2) DEFAULT 0 CHECK (carbs >= 0),
  water_goal_ml INTEGER CHECK (water_goal_ml > 0 AND water_goal_ml < 10000),
  avatar_url TEXT,
  privacy_accepted BOOLEAN DEFAULT false,
  privacy_accepted_at TIMESTAMPTZ,
  terms_accepted BOOLEAN DEFAULT false,
  terms_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add missing columns if table exists but columns are missing
DO $$
BEGIN
  -- calories with DEFAULT 0
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'calories') THEN
    ALTER TABLE users ADD COLUMN calories INTEGER DEFAULT 0 CHECK (calories >= 0);
  ELSE
    -- Ensure DEFAULT exists
    ALTER TABLE users ALTER COLUMN calories SET DEFAULT 0;
  END IF;

  -- goal
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'goal') THEN
    ALTER TABLE users ADD COLUMN goal TEXT CHECK (goal IN ('lose', 'maintain', 'gain'));
  END IF;

  -- name
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'name') THEN
    ALTER TABLE users ADD COLUMN name TEXT;
  END IF;

  -- phone
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'phone') THEN
    ALTER TABLE users ADD COLUMN phone TEXT;
  END IF;

  -- email
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email') THEN
    ALTER TABLE users ADD COLUMN email TEXT;
  END IF;

  -- All other columns...
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'gender') THEN
    ALTER TABLE users ADD COLUMN gender TEXT CHECK (gender IN ('male', 'female', 'other'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'age') THEN
    ALTER TABLE users ADD COLUMN age INTEGER CHECK (age > 0 AND age < 150);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'weight') THEN
    ALTER TABLE users ADD COLUMN weight NUMERIC(5, 2) CHECK (weight > 0 AND weight < 1000);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'height') THEN
    ALTER TABLE users ADD COLUMN height INTEGER CHECK (height > 0 AND height < 300);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'activity') THEN
    ALTER TABLE users ADD COLUMN activity TEXT CHECK (activity IN ('sedentary', 'light', 'moderate', 'active', 'very_active'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'protein') THEN
    ALTER TABLE users ADD COLUMN protein NUMERIC(6, 2) DEFAULT 0 CHECK (protein >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'fat') THEN
    ALTER TABLE users ADD COLUMN fat NUMERIC(6, 2) DEFAULT 0 CHECK (fat >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'carbs') THEN
    ALTER TABLE users ADD COLUMN carbs NUMERIC(6, 2) DEFAULT 0 CHECK (carbs >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'water_goal_ml') THEN
    ALTER TABLE users ADD COLUMN water_goal_ml INTEGER CHECK (water_goal_ml > 0 AND water_goal_ml < 10000);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'avatar_url') THEN
    ALTER TABLE users ADD COLUMN avatar_url TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'privacy_accepted') THEN
    ALTER TABLE users ADD COLUMN privacy_accepted BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'privacy_accepted_at') THEN
    ALTER TABLE users ADD COLUMN privacy_accepted_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'terms_accepted') THEN
    ALTER TABLE users ADD COLUMN terms_accepted BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'terms_accepted_at') THEN
    ALTER TABLE users ADD COLUMN terms_accepted_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'created_at') THEN
    ALTER TABLE users ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'updated_at') THEN
    ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id) WHERE telegram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

-- ============================================================================
-- TABLE 2: diary
-- ============================================================================

CREATE TABLE IF NOT EXISTS diary (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL DEFAULT 0,
  telegram_user_id BIGINT,
  meal_text TEXT NOT NULL,
  calories NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (calories >= 0),
  protein NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (protein >= 0),
  fat NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (fat >= 0),
  carbs NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (carbs >= 0),
  source TEXT NOT NULL CHECK (source IN ('text', 'photo', 'audio')),
  channel TEXT DEFAULT 'telegram' CHECK (channel IN ('telegram', 'webapp', 'admin', 'api')),
  message_id BIGINT,
  chat_id BIGINT,
  parsed_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fix source constraint if it exists with wrong values
DO $$
BEGIN
  -- Drop existing constraint if it doesn't match
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.diary'::regclass 
    AND conname = 'diary_source_check'
  ) THEN
    ALTER TABLE public.diary DROP CONSTRAINT diary_source_check;
  END IF;
  
  -- Add correct constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.diary'::regclass 
    AND conname = 'diary_source_check'
  ) THEN
    ALTER TABLE public.diary 
      ADD CONSTRAINT diary_source_check 
      CHECK (source IN ('text', 'photo', 'audio'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_diary_user_id ON diary(user_id);
CREATE INDEX IF NOT EXISTS idx_diary_telegram_user_id ON diary(telegram_user_id) WHERE telegram_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diary_created_at ON diary(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diary_channel ON diary(channel) WHERE channel IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diary_source ON diary(source);

-- ============================================================================
-- TABLE 3: reminders (CRITICAL for scheduler)
-- ============================================================================

CREATE TABLE IF NOT EXISTS reminders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('food', 'water')),
  time TEXT NOT NULL CHECK (time ~ '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add missing columns if table exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reminders' AND column_name = 'is_active') THEN
    ALTER TABLE reminders ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_type ON reminders(type);
CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders(time);
CREATE INDEX IF NOT EXISTS idx_reminders_active ON reminders(is_active) WHERE is_active = true;

-- ============================================================================
-- TABLE 4: app_logs (CRITICAL for logging)
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  source TEXT NOT NULL,
  request_id TEXT,
  user_id BIGINT,
  telegram_user_id BIGINT,
  chat_id TEXT,  -- TEXT (not BIGINT) as per code expectations
  message TEXT,
  payload JSONB DEFAULT '{}'::jsonb
);

-- Ensure chat_id is TEXT (not BIGINT)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'app_logs' AND column_name = 'chat_id') THEN
    -- Check if it's not TEXT, alter it
    IF (SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'app_logs' AND column_name = 'chat_id') != 'text' THEN
      ALTER TABLE app_logs ALTER COLUMN chat_id TYPE TEXT USING chat_id::TEXT;
    END IF;
  ELSE
    ALTER TABLE app_logs ADD COLUMN chat_id TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON app_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_level ON app_logs(level);
CREATE INDEX IF NOT EXISTS idx_app_logs_source ON app_logs(source);
CREATE INDEX IF NOT EXISTS idx_app_logs_request_id ON app_logs(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_logs_user_id ON app_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_logs_telegram_user_id ON app_logs(telegram_user_id) WHERE telegram_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_logs_chat_id ON app_logs(chat_id) WHERE chat_id IS NOT NULL;

-- ============================================================================
-- TABLE 5: water_logs
-- ============================================================================

CREATE TABLE IF NOT EXISTS water_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  amount_ml INTEGER NOT NULL CHECK (amount_ml > 0 AND amount_ml < 5000),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL CHECK (source IN ('telegram', 'miniapp')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_water_logs_user_id ON water_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_water_logs_logged_at ON water_logs(logged_at);

-- ============================================================================
-- TABLE 6: subscriptions
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'robokassa',
  provider_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'past_due', 'canceled')),
  started_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  next_charge_at TIMESTAMPTZ,
  last_payment_id BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- ============================================================================
-- TABLE 7: payments
-- ============================================================================

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'robokassa',
  inv_id TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'RUB',
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed', 'refunded')),
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  provider_payload JSONB DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_inv_id_unique ON payments(provider, inv_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);

-- ============================================================================
-- TABLE 8: robokassa_invoices
-- ============================================================================

CREATE TABLE IF NOT EXISTS robokassa_invoices (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  plan_code TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('card', 'sbp')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'RUB',
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed', 'expired')),
  request_id TEXT,
  payment_url TEXT,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_robokassa_invoices_user_id ON robokassa_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_robokassa_invoices_status ON robokassa_invoices(status);
CREATE INDEX IF NOT EXISTS idx_robokassa_invoices_request_id ON robokassa_invoices(request_id);

-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_reminders_user_id') THEN
    ALTER TABLE reminders ADD CONSTRAINT fk_reminders_user_id 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_water_logs_user_id') THEN
    ALTER TABLE water_logs ADD CONSTRAINT fk_water_logs_user_id 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_subscriptions_last_payment_id') THEN
    ALTER TABLE subscriptions ADD CONSTRAINT fk_subscriptions_last_payment_id 
    FOREIGN KEY (last_payment_id) REFERENCES payments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS update_users_updated_at ON users;
  CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  
  DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
  CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  
  DROP TRIGGER IF EXISTS update_reminders_updated_at ON reminders;
  CREATE TRIGGER update_reminders_updated_at BEFORE UPDATE ON reminders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  
  DROP TRIGGER IF EXISTS update_robokassa_invoices_updated_at ON robokassa_invoices;
  CREATE TRIGGER update_robokassa_invoices_updated_at BEFORE UPDATE ON robokassa_invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
END $$;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE water_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE robokassa_invoices ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES - Service role has full access
-- ============================================================================

-- Users policies
DO $$
BEGIN
  DROP POLICY IF EXISTS users_select_own ON users;
  DROP POLICY IF EXISTS users_insert_service ON users;
  DROP POLICY IF EXISTS users_update_service ON users;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY users_select_own ON users FOR SELECT USING (auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND id::text = auth.uid()::text));
CREATE POLICY users_insert_service ON users FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY users_update_service ON users FOR UPDATE USING (auth.role() = 'service_role');

-- Diary policies
DO $$
BEGIN
  DROP POLICY IF EXISTS diary_select_own ON diary;
  DROP POLICY IF EXISTS diary_insert_service ON diary;
  DROP POLICY IF EXISTS diary_update_service ON diary;
  DROP POLICY IF EXISTS diary_delete_service ON diary;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY diary_select_own ON diary FOR SELECT USING (auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND user_id::text = auth.uid()::text));
CREATE POLICY diary_insert_service ON diary FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY diary_update_service ON diary FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY diary_delete_service ON diary FOR DELETE USING (auth.role() = 'service_role');

-- Subscriptions policies
DO $$
BEGIN
  DROP POLICY IF EXISTS subscriptions_select_own ON subscriptions;
  DROP POLICY IF EXISTS subscriptions_insert_service ON subscriptions;
  DROP POLICY IF EXISTS subscriptions_update_service ON subscriptions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY subscriptions_select_own ON subscriptions FOR SELECT USING (auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND user_id::text = auth.uid()::text));
CREATE POLICY subscriptions_insert_service ON subscriptions FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY subscriptions_update_service ON subscriptions FOR UPDATE USING (auth.role() = 'service_role');

-- Payments policies
DO $$
BEGIN
  DROP POLICY IF EXISTS payments_select_own ON payments;
  DROP POLICY IF EXISTS payments_insert_service ON payments;
  DROP POLICY IF EXISTS payments_update_service ON payments;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY payments_select_own ON payments FOR SELECT USING (auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND user_id::text = auth.uid()::text));
CREATE POLICY payments_insert_service ON payments FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY payments_update_service ON payments FOR UPDATE USING (auth.role() = 'service_role');

-- Reminders policies
DO $$
BEGIN
  DROP POLICY IF EXISTS reminders_select_own ON reminders;
  DROP POLICY IF EXISTS reminders_insert_service ON reminders;
  DROP POLICY IF EXISTS reminders_update_service ON reminders;
  DROP POLICY IF EXISTS reminders_delete_service ON reminders;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY reminders_select_own ON reminders FOR SELECT USING (auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND user_id::text = auth.uid()::text));
CREATE POLICY reminders_insert_service ON reminders FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY reminders_update_service ON reminders FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY reminders_delete_service ON reminders FOR DELETE USING (auth.role() = 'service_role');

-- Water logs policies
DO $$
BEGIN
  DROP POLICY IF EXISTS water_logs_select_own ON water_logs;
  DROP POLICY IF EXISTS water_logs_insert_service ON water_logs;
  DROP POLICY IF EXISTS water_logs_update_service ON water_logs;
  DROP POLICY IF EXISTS water_logs_delete_service ON water_logs;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY water_logs_select_own ON water_logs FOR SELECT USING (auth.role() = 'service_role' OR (auth.uid() IS NOT NULL AND user_id::text = auth.uid()::text));
CREATE POLICY water_logs_insert_service ON water_logs FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY water_logs_update_service ON water_logs FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY water_logs_delete_service ON water_logs FOR DELETE USING (auth.role() = 'service_role');

-- App logs policies
DO $$
BEGIN
  DROP POLICY IF EXISTS app_logs_select_service ON app_logs;
  DROP POLICY IF EXISTS app_logs_insert_service ON app_logs;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY app_logs_insert_service ON app_logs FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY app_logs_select_service ON app_logs FOR SELECT USING (auth.role() = 'service_role');

-- Robokassa invoices policies
DO $$
BEGIN
  DROP POLICY IF EXISTS robokassa_invoices_select_service ON robokassa_invoices;
  DROP POLICY IF EXISTS robokassa_invoices_insert_service ON robokassa_invoices;
  DROP POLICY IF EXISTS robokassa_invoices_update_service ON robokassa_invoices;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY robokassa_invoices_insert_service ON robokassa_invoices FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY robokassa_invoices_update_service ON robokassa_invoices FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY robokassa_invoices_select_service ON robokassa_invoices FOR SELECT USING (auth.role() = 'service_role');

-- ============================================================================
-- RELOAD POSTGREST SCHEMA CACHE (CRITICAL)
-- ============================================================================

SELECT pg_notify('pgrst', 'reload schema');
