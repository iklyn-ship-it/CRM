-- Adds assembly/disassembly fields to orders.
-- Run this once in Supabase SQL Editor before using assembly/disassembly in CRM.

alter table if exists public.orders
  add column if not exists assembly_enabled boolean not null default false,
  add column if not exists assembly_disassembly_date text not null default '',
  add column if not exists assembly_assembly_date text not null default '',
  add column if not exists assembly_disassembly_cost numeric not null default 0,
  add column if not exists assembly_assembly_cost numeric not null default 0;
