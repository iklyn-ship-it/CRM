create table if not exists public.projects (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  name text not null default '',
  client_id text not null default '',
  start_date date,
  end_date date,
  status text not null default 'new',
  budget numeric not null default 0,
  location text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects
drop constraint if exists projects_status_check;

alter table public.projects
add constraint projects_status_check
check (status in ('new', 'active', 'paused', 'completed', 'cancelled'));

create index if not exists projects_client_id_idx on public.projects(client_id);
create index if not exists projects_status_idx on public.projects(status);
create index if not exists projects_start_date_idx on public.projects(start_date);

alter table public.projects enable row level security;

drop policy if exists "Authenticated users can read projects" on public.projects;
drop policy if exists "Authenticated users can insert projects" on public.projects;
drop policy if exists "Authenticated users can update projects" on public.projects;
drop policy if exists "Authenticated users can delete projects" on public.projects;

create policy "Authenticated users can read projects"
on public.projects for select
to authenticated
using (true);

create policy "Authenticated users can insert projects"
on public.projects for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Authenticated users can update projects"
on public.projects for update
to authenticated
using (true)
with check (true);

create policy "Authenticated users can delete projects"
on public.projects for delete
to authenticated
using (true);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;

create trigger projects_set_updated_at
before update on public.projects
for each row
execute function public.set_updated_at();
