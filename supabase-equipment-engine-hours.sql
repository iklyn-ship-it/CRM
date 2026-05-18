-- Adds engine hour counters for equipment and per-order meter readings.
-- Run in Supabase SQL Editor before saving moto hours in CRM.

alter table if exists public.equipment
  add column if not exists engine_hours numeric not null default 0;

alter table if exists public.orders
  add column if not exists equipment_engine_hours_start numeric not null default 0,
  add column if not exists equipment_engine_hours_end numeric not null default 0;
