-- Adds per-order non-working dates for equipment and operators.
-- Run this once in Supabase SQL Editor before using the new fields in CRM.

alter table if exists public.orders
  add column if not exists equipment_idle_dates jsonb not null default '[]'::jsonb,
  add column if not exists operator_idle_dates jsonb not null default '[]'::jsonb;
