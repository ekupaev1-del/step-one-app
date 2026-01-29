-- 2026-01-28
-- Goal: Introduce UUID-first user identity + Telegram binding + unified meals API storage.
-- This migration is designed to be SAFE/IDEMPOTENT and not break existing legacy tables.
--
-- New tables:
-- - profiles (UUID PK)            : primary account identity for iOS + Telegram
-- - telegram_link_tokens          : one-time tokens for linking Telegram to an existing UUID account
-- - meals + meal_items            : unified meals storage (UUID user_id)
--
-- Notes:
-- - We DO NOT drop/rename existing public.users or public.diary tables here.
-- - Telegram binding is stored ONLY in profiles.telegram_id (BIGINT UNIQUE NULL).
-- - food_id is BIGINT (numeric) to keep numeric IDs numeric in JSON/API.

-- Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- profiles (UUID-first account identity)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- telegram_link_tokens (one-time link tokens)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- meals (unified diary storage, UUID user_id)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('telegram', 'ios', 'miniapp', 'api', 'admin', 'unknown')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Optional legacy fields (for Telegram text/AI flow)
  meal_text TEXT NULL,
  calories NUMERIC(10, 2) NULL,
  protein NUMERIC(10, 2) NULL,
  fat NUMERIC(10, 2) NULL,
  carbs NUMERIC(10, 2) NULL,
  legacy_payload JSONB NULL
);

CREATE INDEX IF NOT EXISTS idx_meals_user_date
  ON public.meals(user_id, date);

CREATE INDEX IF NOT EXISTS idx_meals_created_at
  ON public.meals(created_at DESC);

-- -----------------------------------------------------------------------------
-- meal_items (structured items for new POST /meals format)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meal_items (
  id BIGSERIAL PRIMARY KEY,
  meal_id UUID NOT NULL REFERENCES public.meals(id) ON DELETE CASCADE,
  food_id BIGINT NULL,
  food_name TEXT NOT NULL,
  weight_gr INTEGER NOT NULL CHECK (weight_gr > 0 AND weight_gr < 50000)
);

CREATE INDEX IF NOT EXISTS idx_meal_items_meal_id
  ON public.meal_items(meal_id);

-- -----------------------------------------------------------------------------
-- Optional: ensure legacy users.telegram_id exists + unique index (best-effort)
-- This is guarded to avoid breaking prod if duplicates exist.
-- -----------------------------------------------------------------------------
-- Add telegram_id column to users if it doesn't exist
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS telegram_id BIGINT NULL;

-- Drop existing indexes if they exist
DROP INDEX IF EXISTS idx_users_telegram_id_unique;
DROP INDEX IF EXISTS idx_users_telegram_id;

-- Create non-unique index (always safe, even if duplicates exist)
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON public.users(telegram_id) WHERE telegram_id IS NOT NULL;

-- Note: If you need a UNIQUE index on users.telegram_id, you must first ensure no duplicates exist,
-- then manually run: CREATE UNIQUE INDEX idx_users_telegram_id_unique ON public.users(telegram_id) WHERE telegram_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Reload PostgREST schema cache (Supabase)
-- -----------------------------------------------------------------------------
SELECT pg_notify('pgrst', 'reload schema');

