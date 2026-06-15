-- Adds cash/cashless payment type for orders.
-- Run in Supabase SQL Editor before saving the order payment type in CRM.

alter table if exists public.orders
  add column if not exists payment_type text not null default 'cashless';

update public.orders
set payment_type = 'cashless'
where payment_type is null or payment_type = '';

alter table if exists public.orders
  drop constraint if exists orders_payment_type_check;

alter table if exists public.orders
  add constraint orders_payment_type_check
  check (payment_type in ('cash', 'cashless'));
