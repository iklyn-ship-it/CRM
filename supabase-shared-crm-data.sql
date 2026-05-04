-- ============================================================
-- Shared CRM data access
-- Run in Supabase SQL Editor after supabase-schema-v2.sql.
--
-- Result:
-- - clients, equipment, operators, orders, repairs, transports, operations are visible
--   and editable by every authenticated CRM user.
-- - new records still store the user_id of the account that created them.
-- - integrations are readable by every authenticated CRM user so new accounts
--   can see the Google Forms/Sheets connection.
-- - user_settings stay personal per account.
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array ARRAY[
    'clients',
    'equipment',
    'operators',
    'orders',
    'repairs',
    'transports',
    'operations',
    'integrations'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "%s_select" on public.%I', t, t);
    execute format(
      'create policy "%s_select" on public.%I for select to authenticated using (true)',
      t,
      t
    );

    execute format('drop policy if exists "%s_insert" on public.%I', t, t);
    execute format(
      'create policy "%s_insert" on public.%I for insert to authenticated with check (user_id = auth.uid())',
      t,
      t
    );

    execute format('drop policy if exists "%s_update" on public.%I', t, t);
    execute format(
      'create policy "%s_update" on public.%I for update to authenticated using (true) with check (true)',
      t,
      t
    );

    execute format('drop policy if exists "%s_delete" on public.%I', t, t);
    execute format(
      'create policy "%s_delete" on public.%I for delete to authenticated using (true)',
      t,
      t
    );
  end loop;
end $$;

-- Keep UI preferences personal. Re-apply personal policies explicitly.
alter table public.user_settings enable row level security;

drop policy if exists "user_settings_select" on public.user_settings;
create policy "user_settings_select"
  on public.user_settings
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_settings_insert" on public.user_settings;
create policy "user_settings_insert"
  on public.user_settings
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_settings_update" on public.user_settings;
create policy "user_settings_update"
  on public.user_settings
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "user_settings_delete" on public.user_settings;
create policy "user_settings_delete"
  on public.user_settings
  for delete
  to authenticated
  using (user_id = auth.uid());
