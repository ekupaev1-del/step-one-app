-- Create payments table for tracking invId uniqueness and payment attempts
-- TEMP DEBUG: This table is used for debugging Robokassa error 26
-- Run this SQL in Supabase SQL editor

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  telegram_id bigint,
  inv_id bigint unique not null,
  out_sum numeric(12,2) not null,
  mode text not null check (mode in ('minimal','recurring')),
  status text not null default 'created' check (status in ('created','paid','failed','canceled')),
  description text,
  receipt_json text,
  receipt_encoded text,
  signature_base text,
  signature_value text,
  created_at timestamptz not null default now()
);

create index if not exists payments_user_id_idx on public.payments(user_id);
create index if not exists payments_telegram_id_idx on public.payments(telegram_id);
create index if not exists payments_inv_id_idx on public.payments(inv_id);
create index if not exists payments_status_idx on public.payments(status);

