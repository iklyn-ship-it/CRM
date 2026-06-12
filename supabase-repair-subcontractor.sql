-- Adds subcontractor flag for repair jobs.
-- Run in Supabase SQL Editor before saving the "подрядная организация" checkbox.

alter table if exists public.repairs
  add column if not exists subcontractor boolean not null default false;
