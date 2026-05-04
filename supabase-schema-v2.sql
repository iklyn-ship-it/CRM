-- ============================================================
-- CRM v2: нормализованная схема
-- Выполнить в Supabase SQL Editor
-- ============================================================

-- 1. Клиенты
create table if not exists public.clients (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null default '',
  phone      text not null default '',
  source     text not null default '',
  type       text not null default 'Разовый',
  notes      text not null default '',
  created_at timestamptz not null default now()
);

-- 2. Техника
create table if not exists public.equipment (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null default '',
  type         text not null default '',
  code         text not null default '',
  default_rate numeric not null default 0,
  status       text not null default 'free',
  created_at   timestamptz not null default now()
);

-- 3. Операторы
create table if not exists public.operators (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null default '',
  phone      text not null default '',
  skill      text not null default '',
  rate       numeric not null default 0,
  created_at timestamptz not null default now()
);

-- 4. Заявки
create table if not exists public.orders (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  client_id    text not null default '',
  equipment_id text not null default '',
  operator_id  text not null default '',
  start_date   text not null default '',
  end_date     text not null default '',
  location     text not null default '',
  rate         numeric not null default 0,
  status       text not null default 'new',
  notes        text not null default '',
  equipment_idle_dates jsonb not null default '[]'::jsonb,
  operator_idle_dates  jsonb not null default '[]'::jsonb,
  logistics_enabled boolean not null default false,
  logistics_provider text not null default 'own_trawl',
  logistics_trailer_id text not null default '',
  logistics_start_date text not null default '',
  logistics_end_date text not null default '',
  logistics_distance_km numeric not null default 0,
  logistics_price_per_km numeric not null default 0,
  logistics_cost numeric not null default 0,
  logistics_pickup_price_per_km numeric not null default 50,
  logistics_delivery_price_per_km numeric not null default 250,
  logistics_pickup_km numeric not null default 0,
  logistics_delivery_km numeric not null default 0,
  logistics_pickup_cost numeric not null default 0,
  logistics_delivery_cost numeric not null default 0,
  created_at   timestamptz not null default now()
);

-- 5. Ремонты
create table if not exists public.repairs (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  equipment_id text not null default '',
  start_date   text not null default '',
  end_date     text not null default '',
  status       text not null default 'planned',
  labor_cost   numeric not null default 0,
  parts_cost   numeric not null default 0,
  responsible  text not null default '',
  tasks        text not null default '',
  notes        text not null default '',
  created_at   timestamptz not null default now()
);

-- 6. Перевозки
create table if not exists public.transports (
  id                       text primary key,
  user_id                  uuid not null references auth.users(id) on delete cascade,
  shipper                  text not null default '',
  consignee                text not null default '',
  start_date               text not null default '',
  end_date                 text not null default '',
  loading_point            text not null default '',
  unloading_point          text not null default '',
  equipment_id             text not null default '',
  driver_id                text not null default '',
  cargo_name               text not null default '',
  notes                    text not null default '',
  status                   text not null default 'new',
  pickup_price_per_km      numeric not null default 50,
  delivery_price_per_km    numeric not null default 250,
  pickup_km                numeric not null default 0,
  delivery_km              numeric not null default 0,
  pickup_cost              numeric not null default 0,
  delivery_cost            numeric not null default 0,
  created_at               timestamptz not null default now()
);

-- 7. Финансовые операции
create table if not exists public.operations (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       text not null default '',
  type       text not null default 'income',
  category   text not null default '',
  amount     numeric not null default 0,
  order_id   text not null default '',
  repair_id  text not null default '',
  comment    text not null default '',
  created_at timestamptz not null default now()
);

-- 8. Настройки интеграций (одна строка на пользователя)
create table if not exists public.integrations (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  google_sheets_url    text not null default '',
  auto_sync            boolean not null default false,
  imported_response_ids jsonb not null default '[]'::jsonb,
  last_sync_at         text not null default '',
  last_sync_status     text not null default '',
  updated_at           timestamptz not null default now()
);

-- 9. Пользовательские настройки (режим графика, календаря)
create table if not exists public.user_settings (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  chart_mode    text not null default 'bars',
  calendar_mode text not null default 'month',
  calendar_date text not null default '',
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- RLS: каждый пользователь видит только свои данные
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array ARRAY['clients','equipment','operators','orders','repairs','transports','operations','integrations','user_settings']
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "%s_select" on public.%I', t, t);
    execute format('create policy "%s_select" on public.%I for select to authenticated using (user_id = auth.uid())', t, t);

    execute format('drop policy if exists "%s_insert" on public.%I', t, t);
    execute format('create policy "%s_insert" on public.%I for insert to authenticated with check (user_id = auth.uid())', t, t);

    execute format('drop policy if exists "%s_update" on public.%I', t, t);
    execute format('create policy "%s_update" on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);

    execute format('drop policy if exists "%s_delete" on public.%I', t, t);
    execute format('create policy "%s_delete" on public.%I for delete to authenticated using (user_id = auth.uid())', t, t);
  end loop;
end $$;

-- ============================================================
-- Индексы для частых запросов
-- ============================================================

create index if not exists idx_orders_user     on public.orders(user_id);
create index if not exists idx_orders_status   on public.orders(user_id, status);
create index if not exists idx_repairs_user    on public.repairs(user_id);
create index if not exists idx_transports_user on public.transports(user_id);
create index if not exists idx_transports_dates on public.transports(user_id, start_date, end_date);
create index if not exists idx_operations_user on public.operations(user_id);
create index if not exists idx_clients_user    on public.clients(user_id);
create index if not exists idx_equipment_user  on public.equipment(user_id);

-- ============================================================
-- Realtime: включить для всех таблиц
-- ============================================================

alter publication supabase_realtime add table public.clients;
alter publication supabase_realtime add table public.equipment;
alter publication supabase_realtime add table public.operators;
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.repairs;
alter publication supabase_realtime add table public.transports;
alter publication supabase_realtime add table public.operations;
alter publication supabase_realtime add table public.integrations;
alter publication supabase_realtime add table public.user_settings;
