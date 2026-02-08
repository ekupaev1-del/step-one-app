-- ============================================================================
-- Add RPC function to check table columns via information_schema
-- ============================================================================
-- This bypasses PostgREST schema cache and directly queries information_schema
-- ============================================================================

-- Function to check if a column exists in a table
CREATE OR REPLACE FUNCTION public.check_column_exists(
  table_name_param TEXT,
  column_name_param TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = table_name_param
      AND column_name = column_name_param
  );
END;
$$;

-- Function to get all columns for a table
CREATE OR REPLACE FUNCTION public.get_table_columns(
  table_name_param TEXT
)
RETURNS TABLE(column_name TEXT, data_type TEXT, is_nullable TEXT, column_default TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.column_name::TEXT,
    c.data_type::TEXT,
    c.is_nullable::TEXT,
    c.column_default::TEXT
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = table_name_param
  ORDER BY c.ordinal_position;
END;
$$;

-- Grant execute permissions to service_role
GRANT EXECUTE ON FUNCTION public.check_column_exists(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_table_columns(TEXT) TO service_role;

-- Reload schema cache
SELECT pg_notify('pgrst', 'reload schema');
