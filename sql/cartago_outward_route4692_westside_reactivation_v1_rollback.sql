begin;

do $$
declare
  reactivated_count integer;
begin
  select count(*)::integer
  into reactivated_count
  from public.route_patterns
  where id in (751, 752)
    and ruta_id = 4692
    and activo = true
    and metadata->>'reactivated_by' = 'cartago_outward_route4692_westside_reactivation_v1'
    and metadata->>'prior_inactive_seed_source' = 'preview_route300_rio_loro_moovit_variants_v1';

  if reactivated_count <> 2 then
    raise exception
      'route4692 rollback precondition failed: expected 2 active FU2-reactivated patterns, found %',
      reactivated_count;
  end if;
end $$;

update public.route_patterns
set activo = false,
    metadata = (
      coalesce(metadata, '{}'::jsonb)
      - 'reactivated_by'
      - 'reactivated_reason'
      - 'prior_inactive_seed_source'
    ) || jsonb_build_object(
      'inactive_reason', 'Replaced by official 0300 Moovit-like preview variants for Rio Loro',
      'inactive_seed_source', 'preview_route300_rio_loro_moovit_variants_v1'
    ),
    updated_at = timezone('utc'::text, now())
where id in (751, 752)
  and ruta_id = 4692
  and activo = true
  and metadata->>'reactivated_by' = 'cartago_outward_route4692_westside_reactivation_v1'
  and metadata->>'prior_inactive_seed_source' = 'preview_route300_rio_loro_moovit_variants_v1';

do $$
declare
  inactive_count integer;
  reactivation_marker_count integer;
begin
  select count(*)::integer
  into inactive_count
  from public.route_patterns
  where id in (751, 752)
    and ruta_id = 4692
    and activo = false
    and metadata->>'inactive_seed_source' = 'preview_route300_rio_loro_moovit_variants_v1'
    and metadata->>'inactive_reason' = 'Replaced by official 0300 Moovit-like preview variants for Rio Loro';

  select count(*)::integer
  into reactivation_marker_count
  from public.route_patterns
  where id in (751, 752)
    and ruta_id = 4692
    and (
      metadata ? 'reactivated_by'
      or metadata ? 'reactivated_reason'
      or metadata ? 'prior_inactive_seed_source'
    );

  if inactive_count <> 2 then
    raise exception
      'route4692 rollback postcondition failed: expected 2 inactive preview-replaced patterns, found %',
      inactive_count;
  end if;

  if reactivation_marker_count <> 0 then
    raise exception
      'route4692 rollback postcondition failed: expected 0 reactivation metadata markers, found %',
      reactivation_marker_count;
  end if;
end $$;

commit;
