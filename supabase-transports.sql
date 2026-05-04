-- Adds transports section storage.
-- Run this once in Supabase SQL Editor before using the "Перевозки" section.

create table if not exists public.transports (
  id                       text primary key,
  user_id                  uuid not null references auth.users(id) on delete cascade,
  shipper                  text not null default '',
  consignee                text not null default '',
  start_date               text not null default '',
  end_date                 text not null default '',
  loading_point            text not null default '',
  unloading_point          text not null default '',
  equipment_id             text not null default '',
  driver_id                text not null default '',
  cargo_name               text not null default '',
  notes                    text not null default '',
  status                   text not null default 'new',
  pickup_price_per_km      numeric not null default 50,
  delivery_price_per_km    numeric not null default 250,
  pickup_km                numeric not null default 0,
  delivery_km              numeric not null default 0,
  pickup_cost              numeric not null default 0,
  delivery_cost            numeric not null default 0,
  created_at               timestamptz not null default now()
);

alter table public.transports enable row level security;

drop policy if exists "transports_select" on public.transports;
drop policy if exists "transports_insert" on public.transports;
drop policy if exists "transports_update" on public.transports;
drop policy if exists "transports_delete" on public.transports;

create policy "transports_select"
  on public.transports for select
  to authenticated
  using (true);

create policy "transports_insert"
  on public.transports for insert
  to authenticated
  with check (auth.uid() is not null);

create policy "transports_update"
  on public.transports for update
  to authenticated
  using (true)
  with check (auth.uid() is not null);

create policy "transports_delete"
  on public.transports for delete
  to authenticated
  using (true);

create index if not exists idx_transports_user
  on public.transports(user_id);

create index if not exists idx_transports_dates
  on public.transports(user_id, start_date, end_date);

do $$
begin
  alter publication supabase_realtime add table public.transports;
exception
  when duplicate_object then null;
end $$;
