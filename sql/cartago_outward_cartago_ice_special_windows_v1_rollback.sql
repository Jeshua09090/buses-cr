begin;

do $$
declare
  active_special_count integer;
  disabled_broad_count integer;
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
  into disabled_broad_count
  from public.service_windows
  where pattern_id in (757, 758)
    and activo = false
    and metadata->>'disabled_by' = 'cartago_outward_fu1_cartago_ice_special_windows';

  if active_special_count <> 2 then
    raise exception
      'cartago-ice rollback precondition failed: expected 2 active FU1 special windows, found %',
      active_special_count;
  end if;

  if disabled_broad_count <> 16 then
    raise exception
      'cartago-ice rollback precondition failed: expected 16 FU1-disabled broad windows, found %',
      disabled_broad_count;
  end if;
end $$;

delete from public.service_windows
where pattern_id in (757, 758)
  and metadata->>'seed_source' = 'cartago_outward_fu1_cartago_ice_special_windows';

update public.service_windows
set activo = true,
    notas = null,
    metadata = (
      coalesce(metadata, '{}'::jsonb)
      - 'disabled_by'
      - 'disabled_reason'
      - 'source_url'
    ),
    updated_at = timezone('utc'::text, now())
where pattern_id in (757, 758)
  and metadata->>'disabled_by' = 'cartago_outward_fu1_cartago_ice_special_windows';

do $$
declare
  active_broad_count integer;
  special_count integer;
  disabled_marker_count integer;
begin
  select count(*)::integer
  into active_broad_count
  from public.service_windows
  where pattern_id in (757, 758)
    and activo = true
    and coalesce(metadata->>'seed_source', '') <> 'cartago_outward_fu1_cartago_ice_special_windows';

  select count(*)::integer
  into special_count
  from public.service_windows
  where pattern_id in (757, 758)
    and metadata->>'seed_source' = 'cartago_outward_fu1_cartago_ice_special_windows';

  select count(*)::integer
  into disabled_marker_count
  from public.service_windows
  where pattern_id in (757, 758)
    and metadata ? 'disabled_by';

  if active_broad_count <> 16 then
    raise exception
      'cartago-ice rollback postcondition failed: expected 16 active broad windows, found %',
      active_broad_count;
  end if;

  if special_count <> 0 then
    raise exception
      'cartago-ice rollback postcondition failed: expected 0 FU1 special windows, found %',
      special_count;
  end if;

  if disabled_marker_count <> 0 then
    raise exception
      'cartago-ice rollback postcondition failed: expected 0 remaining disabled_by markers, found %',
      disabled_marker_count;
  end if;
end $$;

commit;
