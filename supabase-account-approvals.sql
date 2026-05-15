-- ============================================================
-- Account approval gate for CRM
-- Run this once in Supabase SQL Editor.
--
-- Result:
-- - new users can register/sign in, but CRM data stays locked
--   until an admin activates the account.
-- - admin email below is always treated as approved.
-- - shared CRM tables require approval through RLS.
-- ============================================================

create table if not exists public.account_approvals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id)
);

alter table public.account_approvals enable row level security;

create or replace function public.crm_is_admin()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'iklyn@rbt-group.com.ua'
  );
$$;

create or replace function public.crm_is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.crm_is_admin()
    or exists (
      select 1
      from public.account_approvals aa
      where aa.user_id = auth.uid()
        and aa.approved = true
    );
$$;

drop policy if exists "account_approvals_select" on public.account_approvals;
create policy "account_approvals_select"
  on public.account_approvals
  for select
  to authenticated
  using (user_id = auth.uid() or public.crm_is_admin());

drop policy if exists "account_approvals_insert" on public.account_approvals;
create policy "account_approvals_insert"
  on public.account_approvals
  for insert
  to authenticated
  with check (
    public.crm_is_admin()
    or (user_id = auth.uid() and approved = false)
  );

drop policy if exists "account_approvals_update" on public.account_approvals;
create policy "account_approvals_update"
  on public.account_approvals
  for update
  to authenticated
  using (public.crm_is_admin())
  with check (public.crm_is_admin());

drop policy if exists "account_approvals_delete" on public.account_approvals;
create policy "account_approvals_delete"
  on public.account_approvals
  for delete
  to authenticated
  using (public.crm_is_admin());

do $$
declare
  t text;
begin
  if to_regclass('public.projects') is not null then
    -- Remove old broad project policies if they exist.
    drop policy if exists "Authenticated users can read projects" on public.projects;
    drop policy if exists "Authenticated users can insert projects" on public.projects;
    drop policy if exists "Authenticated users can update projects" on public.projects;
    drop policy if exists "Authenticated users can delete projects" on public.projects;
  end if;

  foreach t in array ARRAY[
    'clients',
    'equipment',
    'operators',
    'orders',
    'repairs',
    'transports',
    'projects',
    'operations',
    'integrations',
    'audit_logs'
  ]
  loop
    if to_regclass('public.' || quote_ident(t)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "%s_select" on public.%I', t, t);
    execute format(
      'create policy "%s_select" on public.%I for select to authenticated using (public.crm_is_approved())',
      t,
      t
    );

    execute format('drop policy if exists "%s_insert" on public.%I', t, t);
    execute format(
      'create policy "%s_insert" on public.%I for insert to authenticated with check (public.crm_is_approved() and user_id = auth.uid())',
      t,
      t
    );

    execute format('drop policy if exists "%s_update" on public.%I', t, t);
    execute format(
      'create policy "%s_update" on public.%I for update to authenticated using (public.crm_is_approved()) with check (public.crm_is_approved())',
      t,
      t
    );

    execute format('drop policy if exists "%s_delete" on public.%I', t, t);
    execute format(
      'create policy "%s_delete" on public.%I for delete to authenticated using (public.crm_is_approved())',
      t,
      t
    );
  end loop;
end $$;

-- Keep UI preferences personal, but only for approved accounts.
alter table public.user_settings enable row level security;

drop policy if exists "user_settings_select" on public.user_settings;
create policy "user_settings_select"
  on public.user_settings
  for select
  to authenticated
  using (user_id = auth.uid() and public.crm_is_approved());

drop policy if exists "user_settings_insert" on public.user_settings;
create policy "user_settings_insert"
  on public.user_settings
  for insert
  to authenticated
  with check (user_id = auth.uid() and public.crm_is_approved());

drop policy if exists "user_settings_update" on public.user_settings;
create policy "user_settings_update"
  on public.user_settings
  for update
  to authenticated
  using (user_id = auth.uid() and public.crm_is_approved())
  with check (user_id = auth.uid() and public.crm_is_approved());

drop policy if exists "user_settings_delete" on public.user_settings;
create policy "user_settings_delete"
  on public.user_settings
  for delete
  to authenticated
  using (user_id = auth.uid() and public.crm_is_approved());
