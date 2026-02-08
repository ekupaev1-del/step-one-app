-- ============================================================================
-- FIX: users.calories column and add missing tables (profiles, telegram_link_tokens)
-- ============================================================================
-- This migration fixes:
-- 1. users.calories: Add DEFAULT 0 to allow NULL checks in code
-- 2. profiles: UUID-first user identity table (used by bot for UUID sync)
-- 3. telegram_link_tokens: One-time tokens for linking Telegram accounts
-- ============================================================================

-- ============================================================================
-- FIX 1: users.calories - Add DEFAULT 0 (allow NULL for "not filled" check)
-- ============================================================================

-- First, set default for new rows
ALTER TABLE users 
  ALTER COLUMN calories SET DEFAULT 0;

-- Update existing NULL values to 0 (optional, but recommended)
UPDATE users 
  SET calories = 0 
  WHERE calories IS NULL;

-- Make column NOT NULL with DEFAULT (if we want to enforce it)
-- Note: We keep it nullable to allow code to check "isQuestionnaireFilled"
-- ALTER TABLE users ALTER COLUMN calories SET NOT NULL;

-- ============================================================================
-- FIX 2: profiles table (UUID-first user identity)
-- ============================================================================

-- Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT UNIQUE NULL,
  email TEXT UNIQUE NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at trigger function (create if not exists)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- updated_at trigger for profiles
DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Indexes for profiles
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_id ON public.profiles(telegram_id) WHERE telegram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email) WHERE email IS NOT NULL;

-- ============================================================================
-- FIX 3: telegram_link_tokens table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.telegram_link_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_user_id
  ON public.telegram_link_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_expires_at
  ON public.telegram_link_tokens(expires_at);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_unconsumed
  ON public.telegram_link_tokens(token)
  WHERE consumed_at IS NULL;

-- ============================================================================
-- RLS POLICIES for new tables
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_link_tokens ENABLE ROW LEVEL SECURITY;

-- Profiles policies
DO $$
BEGIN
  DROP POLICY IF EXISTS profiles_select_service ON profiles;
  DROP POLICY IF EXISTS profiles_insert_service ON profiles;
  DROP POLICY IF EXISTS profiles_update_service ON profiles;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY profiles_select_service ON profiles FOR SELECT USING (auth.role() = 'service_role');
CREATE POLICY profiles_insert_service ON profiles FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY profiles_update_service ON profiles FOR UPDATE USING (auth.role() = 'service_role');

-- Telegram link tokens policies
DO $$
BEGIN
  DROP POLICY IF EXISTS telegram_link_tokens_select_service ON telegram_link_tokens;
  DROP POLICY IF EXISTS telegram_link_tokens_insert_service ON telegram_link_tokens;
  DROP POLICY IF EXISTS telegram_link_tokens_update_service ON telegram_link_tokens;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY telegram_link_tokens_select_service ON telegram_link_tokens FOR SELECT USING (auth.role() = 'service_role');
CREATE POLICY telegram_link_tokens_insert_service ON telegram_link_tokens FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY telegram_link_tokens_update_service ON telegram_link_tokens FOR UPDATE USING (auth.role() = 'service_role');

-- ============================================================================
-- RELOAD POSTGREST SCHEMA CACHE
-- ============================================================================

SELECT pg_notify('pgrst', 'reload schema');
