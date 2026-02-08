-- ============================================================================
-- Add safe exec_sql RPC function for introspection queries
-- ============================================================================
-- This function allows running SQL queries but ONLY for service_role
-- It's designed for schema introspection and PostgREST cache reload
-- ============================================================================

CREATE OR REPLACE FUNCTION public.exec_sql(sql_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
  allowed_patterns TEXT[] := ARRAY[
    '^SELECT.*FROM information_schema',
    '^SELECT.*current_database',
    '^SELECT.*current_schema',
    '^SELECT.*current_setting',
    '^SELECT pg_notify',
    '^NOTIFY pgrst',
    '^SELECT.*FROM pg_',
    '^SELECT.*FROM pg_catalog'
  ];
  sql_upper TEXT;
  is_allowed BOOLEAN := false;
BEGIN
  -- CRITICAL: Only allow service_role to execute
  IF auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'exec_sql: Only service_role can execute SQL queries. Current role: %', auth.role();
  END IF;

  -- Normalize SQL for pattern matching
  sql_upper := UPPER(TRIM(sql_text));
  
  -- Check if SQL matches allowed patterns (read-only introspection queries)
  FOR i IN 1..array_length(allowed_patterns, 1) LOOP
    IF sql_upper ~ allowed_patterns[i] THEN
      is_allowed := true;
      EXIT;
    END IF;
  END LOOP;

  IF NOT is_allowed THEN
    RAISE EXCEPTION 'exec_sql: SQL query does not match allowed patterns. Only schema introspection queries are allowed.';
  END IF;

  -- Execute the query and return results as JSONB
  -- Note: This is a simplified version - for complex queries, you may need to use dynamic SQL
  -- For now, we'll handle common introspection queries
  
  -- Handle NOTIFY commands
  IF sql_upper LIKE 'NOTIFY%' THEN
    EXECUTE sql_text;
    RETURN jsonb_build_object('status', 'success', 'message', 'NOTIFY command executed');
  END IF;

  -- For SELECT queries, execute and return as JSONB
  BEGIN
    -- Execute query and convert result to JSONB array
    EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', sql_text) INTO result;
    RETURN COALESCE(result, '[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    -- If execution fails, return error info
    RETURN jsonb_build_object(
      'status', 'error',
      'error', SQLERRM,
      'sqlstate', SQLSTATE,
      'message', 'Query execution failed'
    );
  END;
END;
$$;

-- Grant execute permission to service_role
GRANT EXECUTE ON FUNCTION public.exec_sql(TEXT) TO service_role;

-- Reload schema cache
SELECT pg_notify('pgrst', 'reload schema');
