-- Peržiūros paskyra: skaityti galima, rašyti — ne.
-- 1) Authentication → Users → Add user (email + slaptažodis, Auto Confirm)
-- 2) Paleisk šį SQL
-- 3) Vercel env: WMS_VIEW_USERNAME + WMS_VIEW_EMAIL

create or replace function public.wms_can_write()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'wms_role', '')
    is distinct from 'viewer';
$$;

revoke all on function public.wms_can_write() from public;
grant execute on function public.wms_can_write() to authenticated;

drop policy if exists "wms_shared_insert" on wms_shared_state;
create policy "wms_shared_insert"
  on wms_shared_state for insert to authenticated
  with check (id = 'shared' and public.wms_can_write());

drop policy if exists "wms_shared_update" on wms_shared_state;
create policy "wms_shared_update"
  on wms_shared_state for update to authenticated
  using (id = 'shared' and public.wms_can_write())
  with check (id = 'shared' and public.wms_can_write());

drop policy if exists "auth documents upload" on storage.objects;
drop policy if exists "wms storage read" on storage.objects;
drop policy if exists "wms storage write" on storage.objects;
drop policy if exists "wms storage update" on storage.objects;
drop policy if exists "wms storage delete" on storage.objects;

create policy "wms storage read"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('documents', 'defects', 'handovers', 'wms-attachments')
  );

create policy "wms storage write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('documents', 'defects', 'handovers', 'wms-attachments')
    and public.wms_can_write()
  );

create policy "wms storage update"
  on storage.objects for update to authenticated
  using (
    bucket_id in ('documents', 'defects', 'handovers', 'wms-attachments')
    and public.wms_can_write()
  )
  with check (
    bucket_id in ('documents', 'defects', 'handovers', 'wms-attachments')
    and public.wms_can_write()
  );

create policy "wms storage delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('documents', 'defects', 'handovers', 'wms-attachments')
    and public.wms_can_write()
  );

update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || '{"wms_role":"viewer"}'::jsonb
where email = 'perziura@wms.internal';

update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || '{"wms_role":"editor"}'::jsonb
where email is distinct from 'perziura@wms.internal'
  and coalesce(raw_app_meta_data ->> 'wms_role', '') is distinct from 'viewer';
