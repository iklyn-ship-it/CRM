-- Adds client-billed expense fields to finance operations.
-- Run this once in Supabase SQL Editor before using expense markup/paid flags.

alter table public.operations
  add column if not exists bill_client boolean not null default false,
  add column if not exists markup numeric not null default 0,
  add column if not exists paid boolean not null default false;
