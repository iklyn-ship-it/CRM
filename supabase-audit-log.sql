-- ============================================================
-- Audit log for CRM changes
-- Run in Supabase SQL Editor
-- ============================================================

create table if not exists public.audit_logs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_email text not null default '',
  entity_type text not null default '',
  entity_id text not null default '',
  entity_label text not null default '',
  action text not null default 'update',
  summary text not null default '',
  changes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created_at
  on public.audit_logs(created_at desc);

create index if not exists idx_audit_logs_entity
  on public.audit_logs(entity_type, entity_id);

alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs_select" on public.audit_logs;
create policy "audit_logs_select"
on public.audit_logs
for select
to authenticated
using (true);

drop policy if exists "audit_logs_insert" on public.audit_logs;
create policy "audit_logs_insert"
on public.audit_logs
for insert
to authenticated
with check (user_id = auth.uid());

alter publication supabase_realtime add table public.audit_logs;
