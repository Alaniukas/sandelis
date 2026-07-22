-- WMS būsenos sinchronizacija tarp įrenginių (JSON snapshot)
create table if not exists wms_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table wms_app_state enable row level security;

drop policy if exists "wms_app_state_select_own" on wms_app_state;
create policy "wms_app_state_select_own"
  on wms_app_state for select
  using (auth.uid() = user_id);

drop policy if exists "wms_app_state_insert_own" on wms_app_state;
create policy "wms_app_state_insert_own"
  on wms_app_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "wms_app_state_update_own" on wms_app_state;
create policy "wms_app_state_update_own"
  on wms_app_state for update
  using (auth.uid() = user_id);

drop policy if exists "wms_app_state_delete_own" on wms_app_state;
create policy "wms_app_state_delete_own"
  on wms_app_state for delete
  using (auth.uid() = user_id);
