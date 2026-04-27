alter table public.operators
add column if not exists work_status text not null default 'active';

update public.operators
set work_status = 'active'
where work_status is null or work_status = '';

alter table public.operators
drop constraint if exists operators_work_status_check;

alter table public.operators
add constraint operators_work_status_check
check (work_status in ('active', 'sick_leave', 'dismissed'));
