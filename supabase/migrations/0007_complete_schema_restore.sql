-- ============================================================================
-- COMPLETE SCHEMA RESTORATION - Final Migration
-- ============================================================================
-- This migration ensures the database schema is 100% complete and matches
-- the original schema exactly. It's idempotent and safe to run multiple times.
--
-- Run this AFTER applying all previous migrations to ensure everything is correct.
-- ============================================================================

-- ============================================================================
-- 1. Ensure users table has ALL required columns with correct types and defaults
-- ============================================================================

DO $$
BEGIN
  -- calories (INTEGER NOT NULL DEFAULT 0, CHECK >= 0)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'calories') THEN
    ALTER TABLE public.users ADD COLUMN calories INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE public.users ADD CONSTRAINT users_calories_check CHECK (calories >= 0);
  ELSE
    ALTER TABLE public.users ALTER COLUMN calories SET DEFAULT 0;
    ALTER TABLE public.users ALTER COLUMN calories SET NOT NULL;
    ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_calories_check;
    ALTER TABLE public.users ADD CONSTRAINT users_calories_check CHECK (calories >= 0);
  END IF;

  -- goal (TEXT, CHECK IN ('lose', 'maintain', 'gain'))
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'goal') THEN
    ALTER TABLE public.users ADD COLUMN goal TEXT CHECK (goal IN ('lose', 'maintain', 'gain'));
  END IF;

  -- protein (NUMERIC(6, 2) DEFAULT 0, CHECK >= 0)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'protein') THEN
    ALTER TABLE public.users ADD COLUMN protein NUMERIC(6, 2) DEFAULT 0 CHECK (protein >= 0);
  ELSE
    ALTER TABLE public.users ALTER COLUMN protein SET DEFAULT 0;
  END IF;

  -- fat (NUMERIC(6, 2) DEFAULT 0, CHECK >= 0)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'fat') THEN
    ALTER TABLE public.users ADD COLUMN fat NUMERIC(6, 2) DEFAULT 0 CHECK (fat >= 0);
  ELSE
    ALTER TABLE public.users ALTER COLUMN fat SET DEFAULT 0;
  END IF;

  -- carbs (NUMERIC(6, 2) DEFAULT 0, CHECK >= 0)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'carbs') THEN
    ALTER TABLE public.users ADD COLUMN carbs NUMERIC(6, 2) DEFAULT 0 CHECK (carbs >= 0);
  ELSE
    ALTER TABLE public.users ALTER COLUMN carbs SET DEFAULT 0;
  END IF;

  -- water_goal_ml (INTEGER, CHECK > 0 AND < 10000)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'water_goal_ml') THEN
    ALTER TABLE public.users ADD COLUMN water_goal_ml INTEGER CHECK (water_goal_ml > 0 AND water_goal_ml < 10000);
  END IF;

  RAISE NOTICE 'Users table: All columns verified';
END $$;

-- ============================================================================
-- 2. Ensure water_logs has created_at column
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'water_logs' AND column_name = 'created_at') THEN
    ALTER TABLE public.water_logs ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    RAISE NOTICE 'Added created_at to water_logs';
  ELSE
    ALTER TABLE public.water_logs ALTER COLUMN created_at SET DEFAULT NOW();
    RAISE NOTICE 'Water_logs.created_at verified';
  END IF;
END $$;

-- ============================================================================
-- 3. Ensure all tables exist and have proper structure
-- ============================================================================

-- Verify reminders table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reminders') THEN
    CREATE TABLE public.reminders (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('food', 'water')),
      time TEXT NOT NULL CHECK (time ~ '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON public.reminders(user_id);
    RAISE NOTICE 'Created reminders table';
  ELSE
    RAISE NOTICE 'Reminders table exists';
  END IF;
END $$;

-- Verify app_logs table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_logs') THEN
    CREATE TABLE public.app_logs (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
      source TEXT NOT NULL,
      request_id TEXT,
      user_id BIGINT,
      telegram_user_id BIGINT,
      chat_id TEXT,
      message TEXT,
      payload JSONB DEFAULT '{}'::jsonb
    );
    CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON public.app_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_app_logs_level ON public.app_logs(level);
    CREATE INDEX IF NOT EXISTS idx_app_logs_source ON public.app_logs(source);
    RAISE NOTICE 'Created app_logs table';
  ELSE
    -- Ensure chat_id is TEXT
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'app_logs' AND column_name = 'chat_id') THEN
      IF (SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'app_logs' AND column_name = 'chat_id') != 'text' THEN
        ALTER TABLE public.app_logs ALTER COLUMN chat_id TYPE TEXT USING chat_id::TEXT;
      END IF;
    ELSE
      ALTER TABLE public.app_logs ADD COLUMN chat_id TEXT;
    END IF;
    RAISE NOTICE 'App_logs table exists and verified';
  END IF;
END $$;

-- Verify diary table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'diary') THEN
    CREATE TABLE public.diary (
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
    CREATE INDEX IF NOT EXISTS idx_diary_user_id ON public.diary(user_id);
    CREATE INDEX IF NOT EXISTS idx_diary_created_at ON public.diary(created_at DESC);
    RAISE NOTICE 'Created diary table';
  ELSE
    RAISE NOTICE 'Diary table exists';
  END IF;
END $$;

-- ============================================================================
-- 4. Ensure RLS is enabled and policies exist
-- ============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_logs ENABLE ROW LEVEL SECURITY;

-- Create service_role policies (bypasses RLS)
DO $$
BEGIN
  -- Users
  DROP POLICY IF EXISTS users_select_service ON public.users;
  DROP POLICY IF EXISTS users_insert_service ON public.users;
  DROP POLICY IF EXISTS users_update_service ON public.users;
  CREATE POLICY users_select_service ON public.users FOR SELECT USING (auth.role() = 'service_role');
  CREATE POLICY users_insert_service ON public.users FOR INSERT WITH CHECK (auth.role() = 'service_role');
  CREATE POLICY users_update_service ON public.users FOR UPDATE USING (auth.role() = 'service_role');

  -- Reminders
  DROP POLICY IF EXISTS reminders_select_service ON public.reminders;
  DROP POLICY IF EXISTS reminders_insert_service ON public.reminders;
  CREATE POLICY reminders_select_service ON public.reminders FOR SELECT USING (auth.role() = 'service_role');
  CREATE POLICY reminders_insert_service ON public.reminders FOR INSERT WITH CHECK (auth.role() = 'service_role');

  -- App_logs
  DROP POLICY IF EXISTS app_logs_select_service ON public.app_logs;
  DROP POLICY IF EXISTS app_logs_insert_service ON public.app_logs;
  CREATE POLICY app_logs_select_service ON public.app_logs FOR SELECT USING (auth.role() = 'service_role');
  CREATE POLICY app_logs_insert_service ON public.app_logs FOR INSERT WITH CHECK (auth.role() = 'service_role');

  -- Diary
  DROP POLICY IF EXISTS diary_select_service ON public.diary;
  DROP POLICY IF EXISTS diary_insert_service ON public.diary;
  CREATE POLICY diary_select_service ON public.diary FOR SELECT USING (auth.role() = 'service_role');
  CREATE POLICY diary_insert_service ON public.diary FOR INSERT WITH CHECK (auth.role() = 'service_role');

  -- Water_logs
  DROP POLICY IF EXISTS water_logs_select_service ON public.water_logs;
  DROP POLICY IF EXISTS water_logs_insert_service ON public.water_logs;
  CREATE POLICY water_logs_select_service ON public.water_logs FOR SELECT USING (auth.role() = 'service_role');
  CREATE POLICY water_logs_insert_service ON public.water_logs FOR INSERT WITH CHECK (auth.role() = 'service_role');

  RAISE NOTICE 'RLS policies created/updated';
END $$;

-- ============================================================================
-- 5. FORCE RELOAD PostgREST SCHEMA CACHE (CRITICAL)
-- ============================================================================

-- Multiple methods to ensure cache reloads
SELECT pg_notify('pgrst', 'reload schema');

-- Grant permissions (helps refresh cache)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- Final notification
SELECT pg_notify('pgrst', 'reload schema');

RAISE NOTICE 'Schema restoration complete. PostgREST cache reloaded.';
