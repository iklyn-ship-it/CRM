alter table public.transports
add column if not exists internal boolean not null default false;

update public.transports
set internal = false
where internal is null;
