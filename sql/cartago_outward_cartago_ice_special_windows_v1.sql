begin;

do $$
declare
  target_pattern_count integer;
begin
  select count(*)::integer
  into target_pattern_count
  from public.route_patterns
  where id in (757, 758)
    and ruta_id = 4695;

  if target_pattern_count <> 2 then
    raise exception
      'cartago-ice special windows precondition failed: expected patterns 757/758 for ruta_id 4695, found %',
      target_pattern_count;
  end if;
end $$;

delete from public.service_windows
where pattern_id in (757, 758)
  and metadata->>'seed_source' = 'cartago_outward_fu1_cartago_ice_special_windows';

update public.service_windows sw
set activo = false,
    notas = 'Disabled: Moovit source shows CARTAGO - ICE SABANA NORTE as weekday commute special, not all-day service',
    metadata = coalesce(sw.metadata, '{}'::jsonb) || jsonb_build_object(
      'disabled_by', 'cartago_outward_fu1_cartago_ice_special_windows',
      'disabled_reason', 'source_window_conflict',
      'source_url', 'https://appassets.mvtdev.com/map/188/l/2967/48315317.pdf'
    ),
    updated_at = timezone('utc'::text, now())
from public.route_patterns rp
where sw.pattern_id = rp.id
  and rp.ruta_id = 4695
  and rp.id in (757, 758);

select setval(
  pg_get_serial_sequence('public.service_windows', 'id'),
  coalesce((select max(id) from public.service_windows), 0) + 1,
  false
);

insert into public.service_windows (
  pattern_id,
  dia_tipo,
  hora_inicio,
  hora_fin,
  frecuencia_promedio_min,
  activo,
  notas,
  metadata
)
values
  (
    757,
    'habil',
    '05:20'::time,
    '05:21'::time,
    240,
    true,
    'Moovit CARTAGO - ICE SABANA NORTE weekday special: Cartago -> Contraloria/Sabana 05:20',
    jsonb_build_object(
      'seed_kind', 'moovit_service_window',
      'seed_source', 'cartago_outward_fu1_cartago_ice_special_windows',
      'source_url', 'https://appassets.mvtdev.com/map/188/l/2967/48315317.pdf'
    )
  ),
  (
    758,
    'habil',
    '16:50'::time,
    '16:51'::time,
    240,
    true,
    'Moovit CARTAGO - ICE SABANA NORTE weekday special: ICE/Sabana -> Cartago 16:50',
    jsonb_build_object(
      'seed_kind', 'moovit_service_window',
      'seed_source', 'cartago_outward_fu1_cartago_ice_special_windows',
      'source_url', 'https://appassets.mvtdev.com/map/188/l/2967/48315317.pdf'
    )
  );

do $$
declare
  active_special_count integer;
  broad_active_count integer;
begin
  select count(*)::integer
  into active_special_count
  from public.service_windows
  where pattern_id in (757, 758)
    and activo = true
    and metadata->>'seed_source' = 'cartago_outward_fu1_cartago_ice_special_windows'
    and (
      (pattern_id = 757 and dia_tipo = 'habil' and hora_inicio = '05:20'::time and hora_fin = '05:21'::time)
      or (pattern_id = 758 and dia_tipo = 'habil' and hora_inicio = '16:50'::time and hora_fin = '16:51'::time)
    );

  select count(*)::integer
  into broad_active_count
  from public.service_windows
  where pattern_id in (757, 758)
    and activo = true
    and coalesce(metadata->>'seed_source', '') <> 'cartago_outward_fu1_cartago_ice_special_windows';

  if active_special_count <> 2 then
    raise exception
      'cartago-ice special windows postcondition failed: expected 2 active special windows, found %',
      active_special_count;
  end if;

  if broad_active_count <> 0 then
    raise exception
      'cartago-ice special windows postcondition failed: expected 0 broad active legacy windows, found %',
      broad_active_count;
  end if;
end $$;

commit;
