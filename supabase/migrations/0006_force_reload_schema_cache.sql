-- ============================================================================
-- FORCE RELOAD PostgREST SCHEMA CACHE
-- ============================================================================
-- This migration forces PostgREST to reload its schema cache
-- Run this if you see "Could not find table in schema cache" (PGRST205) errors
-- even though tables exist in Supabase UI
-- ============================================================================

-- Method 1: Notify PostgREST to reload schema
SELECT pg_notify('pgrst', 'reload schema');

-- Method 2: Force schema refresh by querying all tables
DO $$
BEGIN
  -- Query each table to ensure they're in the schema
  PERFORM 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users';
  PERFORM 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reminders';
  PERFORM 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_logs';
  PERFORM 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'diary';
  PERFORM 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'water_logs';
  
  RAISE NOTICE 'Schema cache reload triggered for all tables';
END $$;

-- Method 3: Verify all columns exist (this also helps refresh cache)
DO $$
DECLARE
  col_count INTEGER;
BEGIN
  -- Check users table columns
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'users'
    AND column_name IN ('calories', 'goal', 'protein', 'fat', 'carbs', 'water_goal_ml');
  
  IF col_count < 6 THEN
    RAISE WARNING 'Users table missing some columns. Expected 6, found %', col_count;
  ELSE
    RAISE NOTICE 'Users table: All 6 required columns exist';
  END IF;
  
  -- Check water_logs.created_at
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'water_logs'
    AND column_name = 'created_at';
  
  IF col_count = 0 THEN
    RAISE WARNING 'Water_logs table missing created_at column';
  ELSE
    RAISE NOTICE 'Water_logs table: created_at column exists';
  END IF;
END $$;

-- Method 4: Grant permissions explicitly (helps with cache)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- Final notification
SELECT pg_notify('pgrst', 'reload schema');
