-- Paleisk TIK po schema.sql (lentelė locations turi egzistuoti).

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
