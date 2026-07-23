-- Bendra WMS būsena visiems prisijungusiems vartotojams (vienas sandėlis, visi įrenginiai)
create table if not exists wms_shared_state (
  id text primary key default 'shared' check (id = 'shared'),
  payload jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table wms_shared_state enable row level security;

drop policy if exists "wms_shared_select" on wms_shared_state;
create policy "wms_shared_select"
  on wms_shared_state for select to authenticated
  using (true);

drop policy if exists "wms_shared_insert" on wms_shared_state;
create policy "wms_shared_insert"
  on wms_shared_state for insert to authenticated
  with check (id = 'shared');

drop policy if exists "wms_shared_update" on wms_shared_state;
create policy "wms_shared_update"
  on wms_shared_state for update to authenticated
  using (id = 'shared')
  with check (id = 'shared');

-- Migracija iš senos per-vartotojo lentelės (jei buvo paleista wms_app_state.sql)
insert into wms_shared_state (id, payload, updated_at)
select 'shared', payload, updated_at
from wms_app_state
where payload is not null
order by
  coalesce(jsonb_array_length(payload->'orders'), 0) desc,
  updated_at desc
limit 1
on conflict (id) do update
set
  payload = case
    when coalesce(jsonb_array_length(excluded.payload->'orders'), 0)
       > coalesce(jsonb_array_length(wms_shared_state.payload->'orders'), 0)
      then excluded.payload
    else wms_shared_state.payload
  end,
  updated_at = greatest(wms_shared_state.updated_at, excluded.updated_at);
