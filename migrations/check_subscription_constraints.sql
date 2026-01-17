-- Query to check for subscription-related constraints on users table
-- Run this in Supabase SQL Editor to inspect constraints

-- Check for constraints with 'subscription' in the name
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'users' 
AND conname LIKE '%subscription%';

-- Check for constraints that reference subscription in their definition
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'users' 
AND pg_get_constraintdef(c.oid) LIKE '%subscription%';

-- Check for subscription-related columns
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'users' 
AND column_name LIKE '%subscription%';

-- Check all constraints on users table (for reference)
SELECT 
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'users'
ORDER BY contype, conname;
