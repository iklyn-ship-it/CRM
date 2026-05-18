-- Adds additional operator work hours separate from equipment/client hours.
-- Run in Supabase SQL Editor before saving operator extra hours in CRM.

alter table if exists public.orders
  add column if not exists operator_additional_work_hours numeric not null default 0;
