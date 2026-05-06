alter table public.operations
add column if not exists transport_id text not null default '';

create index if not exists idx_operations_transport
on public.operations(transport_id);
