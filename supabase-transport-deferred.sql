-- Adds a soft "deferred" flag for transports hidden from the working list.
-- Run this once in Supabase SQL Editor if the "Отложенные" transport tab is unavailable.

alter table public.transports
  add column if not exists deferred boolean not null default false;

update public.transports
set deferred = false
where deferred is null;
