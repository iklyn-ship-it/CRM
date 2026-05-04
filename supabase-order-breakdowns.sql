-- Adds order breakdown/incident fields.
-- Run this once in Supabase SQL Editor before using breakdowns in CRM.

alter table if exists public.orders
  add column if not exists breakdown_enabled boolean not null default false,
  add column if not exists breakdown_date text not null default '',
  add column if not exists breakdown_end_date text not null default '',
  add column if not exists breakdown_status text not null default 'reported',
  add column if not exists breakdown_description text not null default '',
  add column if not exists breakdown_reporter text not null default '',
  add column if not exists breakdown_responsible text not null default '',
  add column if not exists breakdown_fault_party text not null default 'unknown',
  add column if not exists breakdown_affects_payment boolean not null default true,
  add column if not exists breakdown_operator_idle boolean not null default true,
  add column if not exists breakdown_labor_cost numeric not null default 0,
  add column if not exists breakdown_parts_cost numeric not null default 0,
  add column if not exists breakdown_create_repair boolean not null default false,
  add column if not exists breakdown_repair_id text not null default '';
