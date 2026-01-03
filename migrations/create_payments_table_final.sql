-- Create payments table for tracking invId uniqueness and payment attempts
-- TEMP DEBUG: This table is used for debugging Robokassa error 26
-- Run this SQL in Supabase SQL editor
-- IMPORTANT: This matches the schema expected by the API route

-- Drop table if exists (for clean migration)
-- DROP TABLE IF EXISTS public.payments CASCADE;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  telegram_user_id bigint,
  inv_id bigint unique not null,
  out_sum numeric(10,2) not null,
  mode text not null check (mode in ('minimal','recurring')),
  status text not null default 'created' check (status in ('created','paid','failed','canceled')),
  description text,
  debug jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create indexes for performance
create index if not exists payments_user_id_idx on public.payments(user_id);
create index if not exists payments_telegram_user_id_idx on public.payments(telegram_user_id);
create index if not exists payments_inv_id_idx on public.payments(inv_id);
create index if not exists payments_status_idx on public.payments(status);

-- RLS: If using service role key in API route, RLS can be ignored
-- But if needed, uncomment and adjust:
-- alter table public.payments enable row level security;
-- create policy "Service role can insert payments" on public.payments
--   for insert with check (true);
-- create policy "Service role can select payments" on public.payments
--   for select using (true);
