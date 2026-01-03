-- Complete migration to fix public.payments table structure
-- This migration is SAFE and IDEMPOTENT - can be run multiple times
-- 
-- Fixes PGRST204 errors for missing columns: invoice_id, amount, description
-- Ensures table structure matches insert payload exactly

-- Step 1: Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid references public.users(id) on delete cascade,
  telegram_user_id bigint not null,
  inv_id bigint not null,
  invoice_id text,
  amount numeric(12,2) not null,
  out_sum numeric(12,2) not null,
  mode text not null check (mode in ('minimal','recurring')),
  status text not null default 'created' check (status in ('created','paid','failed','canceled')),
  description text,
  debug jsonb
);

-- Step 2: Add missing columns if they don't exist (idempotent)
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS invoice_id text,
  ADD COLUMN IF NOT EXISTS amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS debug jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz default now();

-- Step 3: Update column types if needed (make nullable/not null as required)
-- Note: These ALTERs are safe even if columns already have correct types
DO $$
BEGIN
  -- Make telegram_user_id NOT NULL if it's nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'payments' 
    AND column_name = 'telegram_user_id'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.payments ALTER COLUMN telegram_user_id SET NOT NULL;
  END IF;

  -- Make inv_id NOT NULL if it's nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'payments' 
    AND column_name = 'inv_id'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.payments ALTER COLUMN inv_id SET NOT NULL;
  END IF;

  -- Make amount NOT NULL if it's nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'payments' 
    AND column_name = 'amount'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.payments ALTER COLUMN amount SET NOT NULL;
  END IF;

  -- Make out_sum NOT NULL if it's nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'payments' 
    AND column_name = 'out_sum'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.payments ALTER COLUMN out_sum SET NOT NULL;
  END IF;

  -- Update amount and out_sum to numeric(12,2) if they're different
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'payments' 
    AND column_name = 'amount'
    AND data_type != 'numeric'
  ) THEN
    ALTER TABLE public.payments ALTER COLUMN amount TYPE numeric(12,2);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'payments' 
    AND column_name = 'out_sum'
    AND (data_type != 'numeric' OR numeric_precision != 12 OR numeric_scale != 2)
  ) THEN
    ALTER TABLE public.payments ALTER COLUMN out_sum TYPE numeric(12,2);
  END IF;
END $$;

-- Step 4: Create indexes (idempotent)
CREATE INDEX IF NOT EXISTS payments_telegram_user_id_idx ON public.payments(telegram_user_id);
CREATE INDEX IF NOT EXISTS payments_inv_id_idx ON public.payments(inv_id);
CREATE INDEX IF NOT EXISTS payments_user_id_idx ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON public.payments(status);

-- Step 5: Add unique constraint on inv_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'payments_inv_id_key' 
    AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments ADD CONSTRAINT payments_inv_id_key UNIQUE (inv_id);
  END IF;
END $$;

-- Step 6: Add check constraints if they don't exist
DO $$
BEGIN
  -- Mode check constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'payments_mode_check' 
    AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments ADD CONSTRAINT payments_mode_check 
      CHECK (mode IN ('minimal', 'recurring'));
  END IF;

  -- Status check constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'payments_status_check' 
    AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments ADD CONSTRAINT payments_status_check 
      CHECK (status IN ('created', 'paid', 'failed', 'canceled'));
  END IF;
END $$;

-- Step 7: Verify final structure
DO $$
DECLARE
  missing_cols TEXT[];
BEGIN
  SELECT array_agg(expected.column_name)
  INTO missing_cols
  FROM (
    SELECT unnest(ARRAY['id', 'created_at', 'updated_at', 'user_id', 'telegram_user_id', 'inv_id', 'invoice_id', 'amount', 'out_sum', 'mode', 'status', 'description', 'debug']) AS column_name
  ) expected
  LEFT JOIN information_schema.columns actual
    ON actual.table_schema = 'public'
    AND actual.table_name = 'payments'
    AND actual.column_name = expected.column_name
  WHERE actual.column_name IS NULL;
  
  IF array_length(missing_cols, 1) > 0 THEN
    RAISE WARNING 'Missing columns in public.payments: %', array_to_string(missing_cols, ', ');
  ELSE
    RAISE NOTICE 'Migration completed successfully. All required columns exist in public.payments.';
  END IF;
END $$;

-- Step 8: Reload PostgREST schema cache (optional, helps with immediate recognition)
SELECT pg_notify('pgrst', 'reload schema');

