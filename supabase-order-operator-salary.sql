-- Adds per-order operator salary override.
-- Run in Supabase SQL Editor before saving manual operator salary in CRM.

alter table if exists public.orders
  add column if not exists operator_salary_mode text not null default 'auto',
  add column if not exists operator_salary_rate numeric not null default 0;

update public.orders
set operator_salary_mode = 'auto'
where operator_salary_mode is null or operator_salary_mode = '';

alter table if exists public.orders
  drop constraint if exists orders_operator_salary_mode_check;

alter table if exists public.orders
  add constraint orders_operator_salary_mode_check
  check (operator_salary_mode in ('auto', 'hourly', 'daily', 'fixed'));
