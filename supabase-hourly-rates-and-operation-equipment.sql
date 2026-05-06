alter table public.equipment
add column if not exists hourly_rate numeric not null default 0;

alter table public.operators
add column if not exists hourly_rate numeric not null default 0;

alter table public.orders
add column if not exists equipment_hourly_rate numeric not null default 0,
add column if not exists standard_work_hours numeric not null default 8,
add column if not exists additional_work_hours numeric not null default 0;

alter table public.operations
add column if not exists equipment_id text not null default '';

create index if not exists idx_operations_equipment
on public.operations(equipment_id);
