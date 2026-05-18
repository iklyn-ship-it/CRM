-- Adds a soft "deferred" flag for orders hidden from the working list.
-- Run in Supabase SQL Editor before moving orders to "Отложенные".

alter table if exists public.orders
  add column if not exists deferred boolean not null default false;
