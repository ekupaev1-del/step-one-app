-- ============================================================================
-- FIX: Add missing columns and reload PostgREST schema cache
-- ============================================================================
-- This migration fixes:
-- 1. Missing columns in users table: calories, goal, protein, fat, carbs, water_goal_ml
-- 2. Missing created_at column in water_logs
-- 3. Reloads PostgREST schema cache to fix PGRST205 errors
-- ============================================================================

-- ============================================================================
-- 1. Fix users table - Add all missing columns with proper defaults
-- ============================================================================

DO $$
BEGIN
  -- calories (INTEGER, DEFAULT 0, NOT NULL, CHECK >= 0)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'calories') THEN
    ALTER TABLE public.users ADD COLUMN calories INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE public.users ADD CONSTRAINT users_calories_check CHECK (calories >= 0);
    RAISE NOTICE 'Added column "calories" to table "users"';
  ELSE
    -- Ensure it has correct defaults and constraints
    ALTER TABLE public.users ALTER COLUMN calories SET DEFAULT 0;
    ALTER TABLE public.users ALTER COLUMN calories SET NOT NULL;
    -- Drop old constraint if exists and add correct one
    ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_calories_check;
    ALTER TABLE public.users ADD CONSTRAINT users_calories_check CHECK (calories >= 0);
    RAISE NOTICE 'Fixed column "calories" in table "users"';
  END IF;

  -- goal (TEXT, CHECK IN ('lose', 'maintain', 'gain'))
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'goal') THEN
    ALTER TABLE public.users ADD COLUMN goal TEXT CHECK (goal IN ('lose', 'maintain', 'gain'));
    RAISE NOTICE 'Added column "goal" to table "users"';
  END IF;

  -- protein (NUMERIC(6, 2), DEFAULT 0, CHECK >= 0)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'protein') THEN
    ALTER TABLE public.users ADD COLUMN protein NUMERIC(6, 2) DEFAULT 0 CHECK (protein >= 0);
    RAISE NOTICE 'Added column "protein" to table "users"';
  ELSE
    ALTER TABLE public.users ALTER COLUMN protein SET DEFAULT 0;
    RAISE NOTICE 'Fixed column "protein" in table "users"';
  END IF;

  -- fat (NUMERIC(6, 2), DEFAULT 0, CHECK >= 0)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'fat') THEN
    ALTER TABLE public.users ADD COLUMN fat NUMERIC(6, 2) DEFAULT 0 CHECK (fat >= 0);
    RAISE NOTICE 'Added column "fat" to table "users"';
  ELSE
    ALTER TABLE public.users ALTER COLUMN fat SET DEFAULT 0;
    RAISE NOTICE 'Fixed column "fat" in table "users"';
  END IF;

  -- carbs (NUMERIC(6, 2), DEFAULT 0, CHECK >= 0)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'carbs') THEN
    ALTER TABLE public.users ADD COLUMN carbs NUMERIC(6, 2) DEFAULT 0 CHECK (carbs >= 0);
    RAISE NOTICE 'Added column "carbs" to table "users"';
  ELSE
    ALTER TABLE public.users ALTER COLUMN carbs SET DEFAULT 0;
    RAISE NOTICE 'Fixed column "carbs" in table "users"';
  END IF;

  -- water_goal_ml (INTEGER, CHECK > 0 AND < 10000)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'water_goal_ml') THEN
    ALTER TABLE public.users ADD COLUMN water_goal_ml INTEGER CHECK (water_goal_ml > 0 AND water_goal_ml < 10000);
    RAISE NOTICE 'Added column "water_goal_ml" to table "users"';
  END IF;

  RAISE NOTICE 'Users table columns check complete';
END $$;

-- ============================================================================
-- 2. Fix water_logs table - Add missing created_at column
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'water_logs' AND column_name = 'created_at') THEN
    ALTER TABLE public.water_logs ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    RAISE NOTICE 'Added column "created_at" to table "water_logs"';
  ELSE
    -- Ensure it has default
    ALTER TABLE public.water_logs ALTER COLUMN created_at SET DEFAULT NOW();
    RAISE NOTICE 'Fixed column "created_at" in table "water_logs"';
  END IF;
END $$;

-- ============================================================================
-- 3. Ensure all tables have proper RLS policies for service_role
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_logs ENABLE ROW LEVEL SECURITY;

-- Create/update policies for service_role (bypasses RLS)
DO $$
BEGIN
  -- Users policies
  DROP POLICY IF EXISTS users_select_service ON public.users;
  DROP POLICY IF EXISTS users_insert_service ON public.users;
  DROP POLICY IF EXISTS users_update_service ON public.users;
  DROP POLICY IF EXISTS users_delete_service ON public.users;
  
  CREATE POLICY users_select_service ON public.users FOR SELECT USING (auth.role() = 'service_role');
  CREATE POLICY users_insert_service ON public.users FOR INSERT WITH CHECK (auth.role() = 'service_role');
  CREATE POLICY users_update_service ON public.users FOR UPDATE USING (auth.role() = 'service_role');
  CREATE POLICY users_delete_service ON public.users FOR DELETE USING (auth.role() = 'service_role');

  -- Reminders policies
  DROP POLICY IF EXISTS reminders_select_service ON public.reminders;
  DROP POLICY IF EXISTS reminders_insert_service ON public.reminders;
  DROP POLICY IF EXISTS reminders_update_service ON public.reminders;
  DROP POLICY IF EXISTS reminders_delete_service ON public.reminders;
  
  CREATE POLICY reminders_select_service ON public.reminders FOR SELECT USING (auth.role() = 'service_role');
  CREATE POLICY reminders_insert_service ON public.reminders FOR INSERT WITH CHECK (auth.role() = 'service_role');
  CREATE POLICY reminders_update_service ON public.reminders FOR UPDATE USING (auth.role() = 'service_role');
  CREATE POLICY reminders_delete_service ON public.reminders FOR DELETE USING (auth.role() = 'service_role');

  -- App_logs policies
  DROP POLICY IF EXISTS app_logs_select_service ON public.app_logs;
  DROP POLICY IF EXISTS app_logs_insert_service ON public.app_logs;
  
  CREATE POLICY app_logs_select_service ON public.app_logs FOR SELECT USING (auth.role() = 'service_role');
  CREATE POLICY app_logs_insert_service ON public.app_logs FOR INSERT WITH CHECK (auth.role() = 'service_role');

  -- Diary policies
  DROP POLICY IF EXISTS diary_select_service ON public.diary;
  DROP POLICY IF EXISTS diary_insert_service ON public.diary;
  DROP POLICY IF EXISTS diary_update_service ON public.diary;
  DROP POLICY IF EXISTS diary_delete_service ON public.diary;
  
  CREATE POLICY diary_select_service ON public.diary FOR SELECT USING (auth.role() = 'service_role');
  CREATE POLICY diary_insert_service ON public.diary FOR INSERT WITH CHECK (auth.role() = 'service_role');
  CREATE POLICY diary_update_service ON public.diary FOR UPDATE USING (auth.role() = 'service_role');
  CREATE POLICY diary_delete_service ON public.diary FOR DELETE USING (auth.role() = 'service_role');

  -- Water_logs policies
  DROP POLICY IF EXISTS water_logs_select_service ON public.water_logs;
  DROP POLICY IF EXISTS water_logs_insert_service ON public.water_logs;
  DROP POLICY IF EXISTS water_logs_update_service ON public.water_logs;
  DROP POLICY IF EXISTS water_logs_delete_service ON public.water_logs;
  
  CREATE POLICY water_logs_select_service ON public.water_logs FOR SELECT USING (auth.role() = 'service_role');
  CREATE POLICY water_logs_insert_service ON public.water_logs FOR INSERT WITH CHECK (auth.role() = 'service_role');
  CREATE POLICY water_logs_update_service ON public.water_logs FOR UPDATE USING (auth.role() = 'service_role');
  CREATE POLICY water_logs_delete_service ON public.water_logs FOR DELETE USING (auth.role() = 'service_role');

  RAISE NOTICE 'RLS policies created/updated for all tables';
END $$;

-- ============================================================================
-- 4. CRITICAL: Reload PostgREST schema cache
-- ============================================================================
-- This fixes "Could not find table in schema cache" (PGRST205) errors
-- ============================================================================

SELECT pg_notify('pgrst', 'reload schema');

-- Also try alternative method (if pg_notify doesn't work)
DO $$
BEGIN
  -- Force schema reload by touching the schema
  PERFORM 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users';
  PERFORM 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reminders';
  PERFORM 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_logs';
  PERFORM 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'diary';
  PERFORM 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'water_logs';
  RAISE NOTICE 'Schema cache reload triggered';
END $$;

-- ============================================================================
-- 5. Verify all columns exist
-- ============================================================================

DO $$
DECLARE
  missing_columns TEXT[];
BEGIN
  -- Check users table
  SELECT array_agg(column_name) INTO missing_columns
  FROM (
    SELECT unnest(ARRAY['calories', 'goal', 'protein', 'fat', 'carbs', 'water_goal_ml']) AS column_name
  ) expected
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND columns.column_name = expected.column_name
  );

  IF array_length(missing_columns, 1) > 0 THEN
    RAISE WARNING 'Users table still missing columns: %', array_to_string(missing_columns, ', ');
  ELSE
    RAISE NOTICE 'Users table: All required columns exist';
  END IF;

  -- Check water_logs table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'water_logs' AND column_name = 'created_at'
  ) THEN
    RAISE WARNING 'Water_logs table still missing column: created_at';
  ELSE
    RAISE NOTICE 'Water_logs table: created_at column exists';
  END IF;
END $$;
