-- Adds logistics fields to orders.
-- Run this once in Supabase SQL Editor before using logistics in CRM.

alter table if exists public.orders
  add column if not exists logistics_enabled boolean not null default false,
  add column if not exists logistics_provider text not null default 'own_trawl',
  add column if not exists logistics_trailer_id text not null default '',
  add column if not exists logistics_start_date text not null default '',
  add column if not exists logistics_end_date text not null default '',
  add column if not exists logistics_distance_km numeric not null default 0,
  add column if not exists logistics_price_per_km numeric not null default 0,
  add column if not exists logistics_cost numeric not null default 0,
  add column if not exists logistics_pickup_price_per_km numeric not null default 50,
  add column if not exists logistics_delivery_price_per_km numeric not null default 250,
  add column if not exists logistics_pickup_km numeric not null default 0,
  add column if not exists logistics_delivery_km numeric not null default 0,
  add column if not exists logistics_pickup_cost numeric not null default 0,
  add column if not exists logistics_delivery_cost numeric not null default 0,
  add column if not exists logistics_return_pickup_price_per_km numeric not null default 50,
  add column if not exists logistics_return_delivery_price_per_km numeric not null default 250,
  add column if not exists logistics_return_pickup_km numeric not null default 0,
  add column if not exists logistics_return_delivery_km numeric not null default 0,
  add column if not exists logistics_return_pickup_cost numeric not null default 0,
  add column if not exists logistics_return_delivery_cost numeric not null default 0;
