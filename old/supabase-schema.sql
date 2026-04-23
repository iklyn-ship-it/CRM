create table if not exists public.crm_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.crm_state enable row level security;

drop policy if exists "Users can read own crm_state" on public.crm_state;
create policy "Users can read own crm_state"
on public.crm_state
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own crm_state" on public.crm_state;
create policy "Users can insert own crm_state"
on public.crm_state
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own crm_state" on public.crm_state;
create policy "Users can update own crm_state"
on public.crm_state
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
