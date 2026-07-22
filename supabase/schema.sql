-- =============================================================================
-- Sandėlio WMS — Supabase SQL eilė
-- =============================================================================
-- 1. schema.sql          — lentelės, RLS, funkcijos (PIRMAS)
-- 2. seed_locations.sql  — stelažų lokacijos
-- auth_lockdown.sql       — NEREIKIA, jei schema.sql jau naujausia versija
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enum tipai
-- ---------------------------------------------------------------------------
do $$ begin
  create type zone_type as enum ('EXPO', 'DILED', 'STAGING', 'BROKAS', 'LONG');
exception when duplicate_object then null; end $$;

do $$ begin
  create type side_type as enum ('K', 'D');
exception when duplicate_object then null; end $$;

do $$ begin
  create type location_kind as enum ('pallet', 'small_shelf', 'special');
exception when duplicate_object then null; end $$;

do $$ begin
  create type unit_status as enum (
    'expected', 'received', 'stored', 'staged', 'issued', 'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type shipment_status as enum ('expected', 'arrived', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type unit_kind as enum ('box', 'pallet');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('active', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rack_size_type as enum ('red_2.9', 'blue_1.9');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Lokacijos (stelažai 1–18 + smulkūs + specialūs)
-- ---------------------------------------------------------------------------
create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  zone zone_type not null,
  rack int,
  side side_type,
  level int check (level is null or (level between 1 and 4)),
  kind location_kind not null default 'pallet',
  label text,
  rack_size rack_size_type,
  capacity_hint numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Grindų plotai (3D žemėlapyje pažymėti stačiakampiai)
-- ---------------------------------------------------------------------------
create table if not exists floor_areas (
  id uuid primary key default gen_random_uuid(),
  label text not null default '',
  x numeric not null,
  z numeric not null,
  w numeric not null,
  d numeric not null,
  notes text not null default '',
  order_id uuid,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Gamintojų profiliai (AI parsinimo kontekstas)
-- ---------------------------------------------------------------------------
create table if not exists manufacturer_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (name)
);

-- ---------------------------------------------------------------------------
-- Užsakymai
-- ---------------------------------------------------------------------------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null default '',
  project text not null default '',
  client text not null default '',
  zone zone_type,
  notes text not null default '',
  block_storage boolean not null default false,
  status order_status not null default 'active',
  qr_token text not null unique default encode(gen_random_bytes(12), 'hex'),
  custom_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Atvykimai (siuntos)
-- ---------------------------------------------------------------------------
create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete set null,
  status shipment_status not null default 'expected',
  carrier text not null default '',
  expected_at timestamptz,
  arrived_at timestamptz,
  pallet_count int,
  box_count int,
  notes text not null default '',
  document_name text,
  parsed_json jsonb,
  custom_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Dokumentai (Storage nuorodos + Gemini raw)
-- ---------------------------------------------------------------------------
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references shipments(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  storage_path text not null,
  mime_type text,
  file_name text,
  raw_gemini jsonb,
  normalized jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Vienetai (dėžės / paletės + QR)
-- ---------------------------------------------------------------------------
create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  shipment_id uuid references shipments(id) on delete set null,
  location_id uuid references locations(id) on delete set null,
  floor_area_id uuid references floor_areas(id) on delete set null,
  kind unit_kind not null default 'box',
  index_in_set int not null default 1,
  total_in_set int not null default 1,
  qr_token text not null unique default encode(gen_random_bytes(12), 'hex'),
  label_title text not null default '',
  status unit_status not null default 'expected',
  occupies_entire_rack boolean not null default false,
  slot_span text not null default 'full' check (slot_span in ('full', 'half')),
  slot_half text check (slot_half is null or slot_half in ('L', 'R')),
  footprint_w numeric,
  footprint_d numeric,
  footprint_offset_x numeric,
  footprint_offset_z numeric,
  weight_kg numeric,
  volume_m3 numeric,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Brokas
-- ---------------------------------------------------------------------------
create table if not exists defects (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references units(id) on delete set null,
  shipment_id uuid references shipments(id) on delete cascade,
  description text not null,
  photo_path text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Atsiėmimai
-- ---------------------------------------------------------------------------
create table if not exists handovers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  pdf_path text,
  recipient_name text not null default '',
  notes text not null default '',
  issued_at timestamptz not null default now(),
  unit_ids uuid[] not null default '{}'
);

-- ---------------------------------------------------------------------------
-- FK po visų lentelių
-- ---------------------------------------------------------------------------
alter table floor_areas
  drop constraint if exists floor_areas_order_id_fkey;
alter table floor_areas
  add constraint floor_areas_order_id_fkey
  foreign key (order_id) references orders(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Indeksai
-- ---------------------------------------------------------------------------
create index if not exists units_order_idx on units(order_id);
create index if not exists units_shipment_idx on units(shipment_id);
create index if not exists units_location_idx on units(location_id);
create index if not exists units_floor_area_idx on units(floor_area_id);
create index if not exists units_status_idx on units(status);
create index if not exists units_qr_idx on units(qr_token);
create index if not exists shipments_order_idx on shipments(order_id);
create index if not exists orders_status_idx on orders(status);
create index if not exists orders_custom_fields_idx on orders using gin (custom_fields);

create index if not exists orders_search_idx on orders using gin (
  to_tsvector(
    'simple',
    coalesce(order_code, '') || ' ' ||
    coalesce(project, '') || ' ' ||
    coalesce(client, '') || ' ' ||
    coalesce(notes, '')
  )
);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_updated_at on orders;
create trigger orders_updated_at
  before update on orders
  for each row execute function public.set_updated_at();

drop trigger if exists units_updated_at on units;
create trigger units_updated_at
  before update on units
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- QR puslapis telefone — saugus read-only RPC (be pilnos DB prieigos)
-- ---------------------------------------------------------------------------
create or replace function public.get_unit_by_qr(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case
    when auth.uid() is null then null
    else jsonb_build_object(
      'unit', to_jsonb(u.*),
      'order', to_jsonb(o.*),
      'shipment', to_jsonb(s.*),
      'location', to_jsonb(l.*),
      'floor_area', to_jsonb(f.*)
    )
  end
  from units u
  join orders o on o.id = u.order_id
  left join shipments s on s.id = u.shipment_id
  left join locations l on l.id = u.location_id
  left join floor_areas f on f.id = u.floor_area_id
  where u.qr_token = p_token
  limit 1;
$$;

-- QR išvykimas telefone
create or replace function public.issue_unit_by_qr(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit units%rowtype;
  v_order_still_active boolean;
  v_handover_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select * into v_unit from units where qr_token = p_token for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_unit.status in ('issued', 'archived') then
    return jsonb_build_object('ok', false, 'error', 'already_issued');
  end if;

  update units set
    location_id = null,
    floor_area_id = null,
    status = 'issued',
    updated_at = now()
  where id = v_unit.id;

  if v_unit.floor_area_id is not null then
    update floor_areas set order_id = null
    where id = v_unit.floor_area_id and order_id = v_unit.order_id;
  end if;

  insert into handovers (order_id, recipient_name, notes, unit_ids)
  values (
    v_unit.order_id,
    'QR atsiėmimas',
    coalesce((select code from locations where id = v_unit.location_id), ''),
    array[v_unit.id]
  )
  returning id into v_handover_id;

  select exists (
    select 1 from units
    where order_id = v_unit.order_id
      and id <> v_unit.id
      and status not in ('issued', 'archived')
  ) into v_order_still_active;

  if not v_order_still_active then
    update orders set status = 'archived', updated_at = now()
    where id = v_unit.order_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'handover_id', v_handover_id,
    'order_archived', not v_order_still_active
  );
end;
$$;

revoke execute on function public.get_unit_by_qr(text) from anon;
revoke execute on function public.issue_unit_by_qr(text) from anon;
grant execute on function public.get_unit_by_qr(text) to authenticated;
grant execute on function public.issue_unit_by_qr(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security (v1: vienas savininkas — visi authenticated = pilna prieiga)
-- ---------------------------------------------------------------------------
alter table locations enable row level security;
alter table floor_areas enable row level security;
alter table manufacturer_profiles enable row level security;
alter table orders enable row level security;
alter table shipments enable row level security;
alter table documents enable row level security;
alter table units enable row level security;
alter table defects enable row level security;
alter table handovers enable row level security;

drop policy if exists "auth all locations" on locations;
create policy "auth all locations" on locations
  for all to authenticated using (true) with check (true);

drop policy if exists "auth all floor_areas" on floor_areas;
create policy "auth all floor_areas" on floor_areas
  for all to authenticated using (true) with check (true);

drop policy if exists "auth all manufacturer_profiles" on manufacturer_profiles;
create policy "auth all manufacturer_profiles" on manufacturer_profiles
  for all to authenticated using (true) with check (true);

drop policy if exists "auth all orders" on orders;
create policy "auth all orders" on orders
  for all to authenticated using (true) with check (true);

drop policy if exists "auth all shipments" on shipments;
create policy "auth all shipments" on shipments
  for all to authenticated using (true) with check (true);

drop policy if exists "auth all documents" on documents;
create policy "auth all documents" on documents
  for all to authenticated using (true) with check (true);

drop policy if exists "auth all units" on units;
create policy "auth all units" on units
  for all to authenticated using (true) with check (true);

drop policy if exists "auth all defects" on defects;
create policy "auth all defects" on defects
  for all to authenticated using (true) with check (true);

drop policy if exists "auth all handovers" on handovers;
create policy "auth all handovers" on handovers
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Storage bucket'ai (dokumentai, broko foto, važtaraščiai)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 52428800, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('defects', 'defects', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('handovers', 'handovers', false, 52428800, array['application/pdf'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "auth documents upload" on storage.objects;
create policy "auth documents upload" on storage.objects
  for all to authenticated
  using (bucket_id in ('documents', 'defects', 'handovers'))
  with check (bucket_id in ('documents', 'defects', 'handovers'));

-- =============================================================================
-- Baigta. Kitas žingsnis:
--   1. Paleisti supabase/seed_locations.sql
--   2. Supabase Auth → sukurti vartotojus (Authentication → Users → Add user)
--   3. Vercel env: GEMINI_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
--      NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_APP_URL=https://sandelio.vercel.app
--      (service_role NEREIKIA paprastam prisijungimui)
-- =============================================================================
