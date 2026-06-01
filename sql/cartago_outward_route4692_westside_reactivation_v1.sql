begin;

do $$
declare
  valid_target_count integer;
begin
  select count(*)::integer
  into valid_target_count
  from public.route_patterns
  where id in (751, 752)
    and ruta_id = 4692
    and (
      (
        activo = false
        and metadata->>'inactive_seed_source' = 'preview_route300_rio_loro_moovit_variants_v1'
      )
      or (
        activo = true
        and metadata->>'reactivated_by' = 'cartago_outward_route4692_westside_reactivation_v1'
      )
    );

  if valid_target_count <> 2 then
    raise exception
      'route4692 reactivation precondition failed: expected exactly 2 inactive preview-replaced or already-reactivated patterns, found %',
      valid_target_count;
  end if;
end $$;

update public.route_patterns
set activo = true,
    metadata = (
      coalesce(metadata, '{}'::jsonb)
      - 'inactive_reason'
      - 'inactive_seed_source'
    ) || jsonb_build_object(
      'reactivated_by', 'cartago_outward_route4692_westside_reactivation_v1',
      'reactivated_reason', 'Restore west-side San Jose coverage for Sabana and Hospital Mexico after Rio Loro preview variants replaced only the core 0300 corridor',
      'prior_inactive_seed_source', 'preview_route300_rio_loro_moovit_variants_v1'
    ),
    updated_at = timezone('utc'::text, now())
where id in (751, 752)
  and ruta_id = 4692
  and activo = false
  and metadata->>'inactive_seed_source' = 'preview_route300_rio_loro_moovit_variants_v1';

do $$
declare
  active_target_count integer;
begin
  select count(*)::integer
  into active_target_count
  from public.route_patterns
  where id in (751, 752)
    and ruta_id = 4692
    and activo = true
    and metadata->>'reactivated_by' = 'cartago_outward_route4692_westside_reactivation_v1'
    and metadata->>'prior_inactive_seed_source' = 'preview_route300_rio_loro_moovit_variants_v1';

  if active_target_count <> 2 then
    raise exception
      'route4692 reactivation postcondition failed: expected exactly 2 active reactivated patterns, found %',
      active_target_count;
  end if;
end $$;

commit;
