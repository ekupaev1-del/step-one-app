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

-- updated_at trigger (shared helper)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'set_updated_at'
      AND pg_function_is_visible(oid)
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.set_updated_at()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$;
    $fn$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'profiles_set_updated_at'
  ) THEN
    EXECUTE $trg$
      CREATE TRIGGER profiles_set_updated_at
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
    $trg$;
  END IF;
END $$;

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
DO $$
DECLARE
  duplicates_count INTEGER := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
    -- Ensure column exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'telegram_id'
    ) THEN
      EXECUTE 'ALTER TABLE public.users ADD COLUMN telegram_id BIGINT NULL';
    END IF;

    -- Only create UNIQUE index if there are no duplicates
    EXECUTE $q$
      SELECT COUNT(*)::int
      FROM (
        SELECT telegram_id
        FROM public.users
        WHERE telegram_id IS NOT NULL
        GROUP BY telegram_id
        HAVING COUNT(*) > 1
      ) d
    $q$ INTO duplicates_count;

    IF duplicates_count = 0 THEN
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id_unique ON public.users(telegram_id) WHERE telegram_id IS NOT NULL';
    ELSE
      RAISE NOTICE 'Skipped UNIQUE index on public.users.telegram_id due to duplicates (count=%)', duplicates_count;
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON public.users(telegram_id) WHERE telegram_id IS NOT NULL';
    END IF;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Reload PostgREST schema cache (Supabase)
-- -----------------------------------------------------------------------------
SELECT pg_notify('pgrst', 'reload schema');

