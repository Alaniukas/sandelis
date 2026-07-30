-- Priedų saugykla (PDF, nuotraukos) — bendra visiems įrenginiams
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wms-attachments',
  'wms-attachments',
  true,
  52428800,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "wms_attachments_select" on storage.objects;
create policy "wms_attachments_select"
  on storage.objects for select to authenticated
  using (bucket_id = 'wms-attachments');

drop policy if exists "wms_attachments_select_public" on storage.objects;
create policy "wms_attachments_select_public"
  on storage.objects for select to anon
  using (bucket_id = 'wms-attachments');

drop policy if exists "wms_attachments_insert" on storage.objects;
create policy "wms_attachments_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'wms-attachments');

drop policy if exists "wms_attachments_update" on storage.objects;
create policy "wms_attachments_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'wms-attachments');

drop policy if exists "wms_attachments_delete" on storage.objects;
create policy "wms_attachments_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'wms-attachments');
