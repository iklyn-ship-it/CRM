-- Adds repair cost and responsible fields.
-- Run this once in Supabase SQL Editor before using the new repair fields.

alter table if exists public.repairs
  add column if not exists labor_cost numeric not null default 0,
  add column if not exists parts_cost numeric not null default 0,
  add column if not exists responsible text not null default '';
