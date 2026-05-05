-- Adds operator shift periods to orders.
-- Run this in Supabase SQL Editor before saving orders with сменщики.

alter table if exists public.orders
  add column if not exists operator_shifts jsonb not null default '[]'::jsonb;
