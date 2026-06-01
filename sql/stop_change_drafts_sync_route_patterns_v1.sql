set search_path = public, extensions;

create or replace function public.sync_legacy_route_patterns_from_ruta_paradas(
  p_ruta_id integer,
  p_sentidos text[] default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_sentidos text[] := p_sentidos;
  v_synced_count integer;
begin
  if p_ruta_id is null then
    raise exception 'p_ruta_id es requerido';
  end if;

  if coalesce(array_length(v_sentidos, 1), 0) = 0 then
    select array_agg(distinct rp.sentido order by rp.sentido)
    into v_sentidos
    from public.ruta_paradas rp
    where rp.ruta_id = p_ruta_id
      and rp.sentido in ('ida', 'vuelta', 'loop', 'ambos');
  end if;

  if coalesce(array_length(v_sentidos, 1), 0) = 0 then
    return;
  end if;

  with target_sentidos as (
    select distinct unnest(v_sentidos) as sentido
  ),
  legacy_patterns as (
    select
      rp.ruta_id,
      rp.sentido,
      md5(
        string_agg(
          concat_ws(
            ':',
            rp.parada_id::text,
            rp.orden::text,
            case when rp.es_subida then '1' else '0' end,
            case when rp.es_bajada then '1' else '0' end
          ),
          '|'
          order by rp.orden asc
        )
      ) as stop_signature,
      count(*)::integer as parada_count,
      max(rp.distancia_acumulada_m) as distancia_total_m,
      (array_agg(rp.parada_id order by rp.orden asc))[1] as parada_inicial_id,
      (array_agg(rp.parada_id order by rp.orden desc))[1] as parada_final_id,
      (array_agg(coalesce(p.nombre, 'Parada de buses') order by rp.orden asc))[1] as parada_inicial_nombre,
      (array_agg(coalesce(p.nombre, 'Parada de buses') order by rp.orden desc))[1] as parada_final_nombre
    from public.ruta_paradas rp
    join target_sentidos ts
      on ts.sentido = rp.sentido
    join public.paradas p
      on p.id = rp.parada_id
    where rp.ruta_id = p_ruta_id
    group by rp.ruta_id, rp.sentido
  ),
  candidate_patterns as (
    select
      lp.ruta_id,
      lp.sentido,
      rp.id as pattern_id,
      row_number() over (
        partition by lp.ruta_id, lp.sentido
        order by rp.activo desc, rp.updated_at desc, rp.id desc
      ) as rn
    from legacy_patterns lp
    left join public.route_patterns rp
      on rp.ruta_id = lp.ruta_id
     and rp.sentido = lp.sentido
     and rp.fuente = 'legacy_migration'
  ),
  chosen_patterns as (
    select
      lp.ruta_id,
      lp.sentido,
      cp.pattern_id
    from legacy_patterns lp
    left join candidate_patterns cp
      on cp.ruta_id = lp.ruta_id
     and cp.sentido = lp.sentido
     and cp.rn = 1
  ),
  inserted_patterns as (
    insert into public.route_patterns (
      ruta_id,
      sentido,
      pattern_code,
      nombre,
      headsign,
      stop_signature,
      parada_inicial_id,
      parada_final_id,
      parada_count,
      distancia_total_m,
      activo,
      fuente,
      metadata,
      created_at,
      updated_at
    )
    select
      lp.ruta_id,
      lp.sentido,
      concat('legacy-sync-', lp.sentido),
      concat(
        coalesce(r.nombre_ruta, concat('Ruta ', lp.ruta_id::text)),
        ' / ',
        upper(lp.sentido)
      ),
      lp.parada_final_nombre,
      lp.stop_signature,
      lp.parada_inicial_id,
      lp.parada_final_id,
      lp.parada_count,
      lp.distancia_total_m,
      true,
      'legacy_migration',
      jsonb_build_object(
        'migrated_from', 'ruta_paradas',
        'legacy_ruta_id', lp.ruta_id,
        'legacy_sentido', lp.sentido,
        'synced_from_ruta_paradas_at', v_now
      ),
      v_now,
      v_now
    from legacy_patterns lp
    left join public.rutas r
      on r.id = lp.ruta_id
    join chosen_patterns cp
      on cp.ruta_id = lp.ruta_id
     and cp.sentido = lp.sentido
    where cp.pattern_id is null
    on conflict (ruta_id, sentido, pattern_code)
    do update set
      nombre = excluded.nombre,
      headsign = excluded.headsign,
      stop_signature = excluded.stop_signature,
      parada_inicial_id = excluded.parada_inicial_id,
      parada_final_id = excluded.parada_final_id,
      parada_count = excluded.parada_count,
      distancia_total_m = excluded.distancia_total_m,
      activo = true,
      metadata = coalesce(public.route_patterns.metadata, '{}'::jsonb) || excluded.metadata,
      updated_at = v_now
    returning public.route_patterns.id as pattern_id, public.route_patterns.ruta_id as ruta_id, public.route_patterns.sentido as sentido
  ),
  resolved_patterns as (
    select
      lp.ruta_id,
      lp.sentido,
      lp.stop_signature,
      lp.parada_count,
      lp.distancia_total_m,
      lp.parada_inicial_id,
      lp.parada_final_id,
      lp.parada_inicial_nombre,
      lp.parada_final_nombre,
      coalesce(cp.pattern_id, ip.pattern_id) as pattern_id
    from legacy_patterns lp
    join chosen_patterns cp
      on cp.ruta_id = lp.ruta_id
     and cp.sentido = lp.sentido
    left join inserted_patterns ip
      on ip.ruta_id = lp.ruta_id
     and ip.sentido = lp.sentido
  ),
  updated_patterns as (
    update public.route_patterns rp
    set
      nombre = concat(
        coalesce(r.nombre_ruta, concat('Ruta ', rs.ruta_id::text)),
        ' / ',
        upper(rs.sentido)
      ),
      headsign = rs.parada_final_nombre,
      stop_signature = rs.stop_signature,
      parada_inicial_id = rs.parada_inicial_id,
      parada_final_id = rs.parada_final_id,
      parada_count = rs.parada_count,
      distancia_total_m = rs.distancia_total_m,
      activo = true,
      metadata = coalesce(rp.metadata, '{}'::jsonb) || jsonb_build_object(
        'migrated_from', 'ruta_paradas',
        'legacy_ruta_id', rs.ruta_id,
        'legacy_sentido', rs.sentido,
        'synced_from_ruta_paradas_at', v_now
      ),
      updated_at = v_now
    from resolved_patterns rs
    left join public.rutas r
      on r.id = rs.ruta_id
    where rp.id = rs.pattern_id
    returning rp.id
  ),
  deactivated_extra_patterns as (
    update public.route_patterns rp
    set
      activo = false,
      metadata = coalesce(rp.metadata, '{}'::jsonb) || jsonb_build_object(
        'deactivated_by_sync_from_ruta_paradas_at', v_now,
        'deactivated_in_favor_of_pattern_id', rs.pattern_id
      ),
      updated_at = v_now
    from resolved_patterns rs
    where rp.ruta_id = rs.ruta_id
      and rp.sentido = rs.sentido
      and rp.fuente = 'legacy_migration'
      and rp.id <> rs.pattern_id
      and rp.activo = true
    returning rp.id
  ),
  removed_pattern_stops as (
    delete from public.route_pattern_stops rps
    using resolved_patterns rs
    where rps.pattern_id = rs.pattern_id
      and not exists (
        select 1
        from public.ruta_paradas rp
        where rp.ruta_id = rs.ruta_id
          and rp.sentido = rs.sentido
          and rp.orden = rps.stop_sequence
      )
    returning rps.id
  ),
  upserted_pattern_stops as (
    insert into public.route_pattern_stops (
      pattern_id,
      parada_id,
      stop_sequence,
      es_subida,
      es_bajada,
      pickup_type,
      drop_off_type,
      distancia_acumulada_m,
      tiempo_estimado_desde_inicio_min,
      created_at,
      updated_at
    )
    select
      rs.pattern_id,
      rp.parada_id,
      rp.orden,
      rp.es_subida,
      rp.es_bajada,
      case when rp.es_subida then 0 else 1 end,
      case when rp.es_bajada then 0 else 1 end,
      rp.distancia_acumulada_m,
      rp.tiempo_estimado_desde_inicio_min,
      v_now,
      v_now
    from public.ruta_paradas rp
    join resolved_patterns rs
      on rs.ruta_id = rp.ruta_id
     and rs.sentido = rp.sentido
    on conflict (pattern_id, stop_sequence)
    do update set
      parada_id = excluded.parada_id,
      es_subida = excluded.es_subida,
      es_bajada = excluded.es_bajada,
      pickup_type = excluded.pickup_type,
      drop_off_type = excluded.drop_off_type,
      distancia_acumulada_m = excluded.distancia_acumulada_m,
      tiempo_estimado_desde_inicio_min = excluded.tiempo_estimado_desde_inicio_min,
      updated_at = v_now
    returning pattern_id
  )
  select count(*)::integer
  into v_synced_count
  from resolved_patterns;
end;
$$;

create or replace function public._sync_legacy_patterns_after_stop_change_draft()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.status = 'applied'
     and old.status is distinct from new.status
     and new.ruta_id is not null
     and new.action_type in ('create_stop', 'attach_stop_to_route', 'detach_stop_from_route') then
    perform public.sync_legacy_route_patterns_from_ruta_paradas(new.ruta_id);
  end if;

  return new;
end;
$$;

drop trigger if exists sync_legacy_route_patterns_after_stop_change_draft on public.stop_change_drafts;
create trigger sync_legacy_route_patterns_after_stop_change_draft
after update of status on public.stop_change_drafts
for each row
when (new.status = 'applied' and old.status is distinct from new.status)
execute function public._sync_legacy_patterns_after_stop_change_draft();

grant execute on function public.sync_legacy_route_patterns_from_ruta_paradas(integer, text[])
  to authenticated;

grant execute on function public._sync_legacy_patterns_after_stop_change_draft()
  to authenticated;

comment on function public.sync_legacy_route_patterns_from_ruta_paradas(integer, text[]) is
  'Sincroniza route_patterns y route_pattern_stops legacy a partir de ruta_paradas para una ruta editada desde el portal.';

comment on function public._sync_legacy_patterns_after_stop_change_draft() is
  'Cuando un stop_change_draft pasa a applied, resincroniza route_patterns y route_pattern_stops para la ruta afectada.';

do $$
declare
  v_route_id integer;
begin
  for v_route_id in
    select distinct d.ruta_id
    from public.stop_change_drafts d
    where d.status = 'applied'
      and d.ruta_id is not null
      and d.action_type in ('create_stop', 'attach_stop_to_route', 'detach_stop_from_route')
  loop
    perform public.sync_legacy_route_patterns_from_ruta_paradas(v_route_id);
  end loop;
end;
$$;
