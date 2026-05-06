alter table public.orders
add column if not exists vat_enabled boolean not null default false,
add column if not exists discount_enabled boolean not null default false,
add column if not exists discount_type text not null default 'percent',
add column if not exists discount_value numeric not null default 0;

alter table public.orders
drop constraint if exists orders_discount_type_check;

alter table public.orders
add constraint orders_discount_type_check
check (discount_type in ('percent', 'amount'));
