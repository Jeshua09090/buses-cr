set search_path = public, extensions;

-- Helper used by Prueba seeding migrations to promote one official CTP variant
-- into the modern runtime tables consumed by the planner.

create or replace function public.planner_promote_ctp_variant_to_runtime(
  p_ruta_id integer,
  p_route_code text,
  p_variant_family_code text,
  p_variant_code text,
  p_nombre_ruta text,
  p_canton_inicio text,
  p_canton_final text,
  p_sentido text,
  p_pattern_name text,
  p_categoria_operativa text default 'local',
  p_clasificacion_confianza numeric default 0.860,
  p_frecuencia_base_min integer default 30,
  p_reverse_stop_order boolean default false,
  p_seed_source text default null
)
returns void
language plpgsql
as $$
declare
  v_seed_source text := coalesce(
    nullif(p_seed_source, ''),
    concat('preview_', lower(regexp_replace(p_variant_code, '[^a-zA-Z0-9]+', '_', 'g')), '_runtime')
  );
  v_pattern_code text := concat(
    'preview-',
    p_sentido,
    '-',
    p_ruta_id::text,
    '-',
    lower(regexp_replace(v_seed_source, '[^a-zA-Z0-9]+', '-', 'g'))
  );
begin
  if p_sentido not in ('ida', 'vuelta', 'loop', 'ambos') then
    raise exception 'Invalid sentido % for ruta %', p_sentido, p_ruta_id;
  end if;

  if not exists (
    select 1
    from public.staging_ctp_official_route_variants rv
    where rv.variant_code = p_variant_code
  ) then
    raise exception 'Missing official CTP variant %', p_variant_code;
  end if;

  insert into public.rutas (
    id,
    codigo_ctp,
    operador,
    nombre_ruta,
    canton_inicio,
    canton_final,
    distancia_km,
    geometry
  )
  select
    p_ruta_id,
    p_route_code,
    null::text,
    p_nombre_ruta,
    p_canton_inicio,
    p_canton_final,
    null::double precision,
    st_asgeojson(st_transform(rv.geom, 4326))::jsonb
  from public.staging_ctp_official_route_variants rv
  where rv.variant_code = p_variant_code
  on conflict (id) do update
  set codigo_ctp = excluded.codigo_ctp,
      operador = excluded.operador,
      nombre_ruta = excluded.nombre_ruta,
      canton_inicio = excluded.canton_inicio,
      canton_final = excluded.canton_final,
      geometry = excluded.geometry;

  delete from public.planner_ctp_preview_route_bindings b
  where b.ruta_id = p_ruta_id
    and coalesce(b.variant_code, '__family__') = coalesce(p_variant_code, '__family__')
    and b.preview_scope = 'route_stops';

  insert into public.planner_ctp_preview_route_bindings (
    ruta_id,
    route_code,
    variant_family_code,
    variant_code,
    preview_scope,
    preview_priority,
    reverse_stop_order,
    activo,
    metadata
  )
  values (
    p_ruta_id,
    p_route_code,
    p_variant_family_code,
    p_variant_code,
    'route_stops',
    10,
    p_reverse_stop_order,
    true,
    jsonb_build_object(
      'seed_source', v_seed_source,
      'seed_kind', 'runtime_variant_binding'
    )
  );

  delete from public.ruta_puntos
  where ruta_id = p_ruta_id;

  with points as (
    select
      case
        when cardinality(dp.path) >= 2 then dp.path[1]
        else 1
      end as segmento_id,
      row_number() over (
        order by
          case
            when cardinality(dp.path) >= 2 then dp.path[1]
            else 1
          end,
          case
            when cardinality(dp.path) >= 2 then dp.path[2]
            else dp.path[1]
          end
      ) as point_order,
      st_y(dp.geom) as lat,
      st_x(dp.geom) as lng
    from public.staging_ctp_official_route_variants rv
    cross join lateral st_dumppoints(st_transform(rv.geom, 4326)) as dp
    where rv.variant_code = p_variant_code
  )
  insert into public.ruta_puntos (
    id,
    ruta_id,
    lat,
    lng,
    orden,
    geog,
    segmento_id
  )
  select
    -1 * (p_ruta_id * 100000 + p.point_order) as id,
    p_ruta_id,
    p.lat,
    p.lng,
    p.point_order,
    st_setsrid(st_makepoint(p.lng, p.lat), 4326)::geography,
    p.segmento_id
  from points p;

  with raw_stops as (
    select
      rs.stop_source_id,
      rs.suggested_stop_sequence::integer as source_stop_sequence,
      s.source_identifier,
      coalesce(nullif(s.description_raw, ''), s.source_identifier) as stop_name,
      s.lat::double precision as lat,
      s.lng::double precision as lng,
      s.geo as stop_geo,
      (-200000000 - s.source_id)::integer as synthetic_parada_id
    from public.staging_ctp_route_stops_inferred rs
    join public.staging_ctp_official_stops s
      on s.source_id = rs.stop_source_id
    where rs.variant_code = p_variant_code
      and rs.suggested_stop_sequence is not null
  ),
  ordered_stops as (
    select
      rs.*,
      row_number() over (
        order by
          case when p_reverse_stop_order then rs.source_stop_sequence end desc nulls last,
          case when not p_reverse_stop_order then rs.source_stop_sequence end asc nulls last,
          rs.stop_source_id asc
      )::integer as stop_sequence
    from raw_stops rs
  ),
  distinct_synthetic_stops as (
    select distinct on (synthetic_parada_id)
      synthetic_parada_id,
      lat,
      lng,
      stop_name,
      stop_source_id,
      source_identifier
    from ordered_stops
    order by synthetic_parada_id, stop_sequence
  )
  insert into public.paradas (
    id,
    lat,
    lng,
    nombre,
    activo,
    fuente,
    metadata,
    created_at,
    updated_at
  )
  select
    dss.synthetic_parada_id,
    dss.lat::numeric,
    dss.lng::numeric,
    dss.stop_name,
    true,
    'importacion',
    jsonb_build_object(
      'seed_source', v_seed_source,
      'seed_kind', 'official_inferred_stop',
      'stop_source_id', dss.stop_source_id,
      'stop_source_identifier', dss.source_identifier,
      'variant_code', p_variant_code
    ),
    timezone('utc', now()),
    timezone('utc', now())
  from distinct_synthetic_stops dss
  on conflict (id) do update
  set lat = excluded.lat,
      lng = excluded.lng,
      nombre = excluded.nombre,
      activo = true,
      fuente = excluded.fuente,
      metadata = coalesce(public.paradas.metadata, '{}'::jsonb) || excluded.metadata,
      updated_at = timezone('utc', now());

  delete from public.route_patterns rp
  where rp.ruta_id = p_ruta_id
    and rp.fuente = 'importacion'
    and (
      coalesce(rp.metadata ->> 'seed_source', '') = v_seed_source
      or rp.pattern_code = v_pattern_code
    );

  with raw_stops as (
    select
      rs.stop_source_id,
      rs.suggested_stop_sequence::integer as source_stop_sequence,
      s.source_identifier,
      coalesce(nullif(s.description_raw, ''), s.source_identifier) as stop_name,
      s.lat::double precision as lat,
      s.lng::double precision as lng,
      s.geo as stop_geo,
      (-200000000 - s.source_id)::integer as synthetic_parada_id
    from public.staging_ctp_route_stops_inferred rs
    join public.staging_ctp_official_stops s
      on s.source_id = rs.stop_source_id
    where rs.variant_code = p_variant_code
      and rs.suggested_stop_sequence is not null
  ),
  ordered_stops as (
    select
      rs.*,
      row_number() over (
        order by
          case when p_reverse_stop_order then rs.source_stop_sequence end desc nulls last,
          case when not p_reverse_stop_order then rs.source_stop_sequence end asc nulls last,
          rs.stop_source_id asc
      )::integer as stop_sequence
    from raw_stops rs
  ),
  mapped_stops as (
    select
      os.*,
      coalesce(nearby.id, os.synthetic_parada_id)::bigint as parada_id,
      nearby.id as matched_runtime_parada_id
    from ordered_stops os
    left join lateral (
      select p.id
      from public.paradas p
      where p.activo = true
        and p.id > 0
        and st_dwithin(p.geo, os.stop_geo, 90)
      order by st_distance(p.geo, os.stop_geo) asc, p.id asc
      limit 1
    ) nearby on true
  ),
  segmented as (
    select
      ms.*,
      lag(ms.stop_geo) over (order by ms.stop_sequence) as prev_geo
    from mapped_stops ms
  ),
  measured as (
    select
      s.*,
      coalesce(st_distance(s.prev_geo, s.stop_geo)::integer, 0) as segment_distance_m
    from segmented s
  ),
  pattern_row as (
    select
      md5(
        string_agg(
          concat_ws(':', m.parada_id::text, m.stop_sequence::text),
          '|'
          order by m.stop_sequence
        )
      ) as stop_signature,
      (array_agg(m.parada_id order by m.stop_sequence asc))[1] as parada_inicial_id,
      (array_agg(m.parada_id order by m.stop_sequence desc))[1] as parada_final_id,
      (array_agg(m.stop_name order by m.stop_sequence desc))[1] as headsign,
      count(*)::integer as parada_count,
      sum(m.segment_distance_m)::integer as distancia_total_m,
      jsonb_build_object(
        'seed_source', v_seed_source,
        'seed_kind', 'route_pattern',
        'variant_code', p_variant_code,
        'reverse_stop_order', p_reverse_stop_order,
        'official_inferred_stop_count', count(*)::integer,
        'matched_runtime_stop_count', count(*) filter (where m.matched_runtime_parada_id is not null),
        'official_stop_source_ids', jsonb_agg(m.stop_source_id order by m.stop_sequence),
        'matched_runtime_stop_ids', jsonb_agg(m.matched_runtime_parada_id order by m.stop_sequence)
      ) as metadata
    from measured m
  ),
  inserted_pattern as (
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
      categoria_operativa,
      clasificacion_fuente,
      clasificacion_confianza,
      metadata
    )
    select
      p_ruta_id,
      p_sentido,
      v_pattern_code,
      p_pattern_name,
      pr.headsign,
      pr.stop_signature,
      pr.parada_inicial_id,
      pr.parada_final_id,
      pr.parada_count,
      pr.distancia_total_m,
      true,
      'importacion',
      p_categoria_operativa,
      'importacion',
      p_clasificacion_confianza,
      pr.metadata
    from pattern_row pr
    returning id
  )
  insert into public.route_pattern_stops (
    pattern_id,
    parada_id,
    stop_sequence,
    es_subida,
    es_bajada,
    pickup_type,
    drop_off_type,
    distancia_acumulada_m,
    tiempo_estimado_desde_inicio_min
  )
  select
    ip.id as pattern_id,
    m.parada_id,
    m.stop_sequence,
    true,
    true,
    0,
    0,
    sum(m.segment_distance_m) over (
      order by m.stop_sequence
      rows between unbounded preceding and current row
    )::integer as distancia_acumulada_m,
    greatest(
      0,
      round(
        (
          sum(m.segment_distance_m) over (
            order by m.stop_sequence
            rows between unbounded preceding and current row
          )
        )::numeric / 380.0
      )
    )::integer as tiempo_estimado_desde_inicio_min
  from measured m
  cross join inserted_pattern ip;

  with pattern_targets as (
    select rp.id as pattern_id
    from public.route_patterns rp
    where rp.ruta_id = p_ruta_id
      and rp.fuente = 'importacion'
      and coalesce(rp.metadata ->> 'seed_source', '') = v_seed_source
  )
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
  select
    pt.pattern_id,
    sw.dia_tipo,
    sw.hora_inicio,
    sw.hora_fin,
    sw.frecuencia_promedio_min,
    true,
    'Ventana sintetica para Prueba',
    jsonb_build_object(
      'seed_source', v_seed_source,
      'seed_kind', 'service_window',
      'seed_ruta_id', p_ruta_id
    )
  from pattern_targets pt
  join lateral (
    values
      ('habil'::text, '05:00'::time, '09:00'::time, greatest(20, p_frecuencia_base_min)),
      ('habil'::text, '09:00'::time, '16:00'::time, greatest(30, p_frecuencia_base_min + 10)),
      ('habil'::text, '16:00'::time, '20:30'::time, greatest(20, p_frecuencia_base_min)),
      ('sabado'::text, '06:00'::time, '20:00'::time, greatest(35, p_frecuencia_base_min + 10)),
      ('domingo'::text, '07:00'::time, '19:00'::time, greatest(45, p_frecuencia_base_min + 15)),
      ('feriado'::text, '07:00'::time, '19:00'::time, greatest(45, p_frecuencia_base_min + 15))
  ) as sw(dia_tipo, hora_inicio, hora_fin, frecuencia_promedio_min)
    on true;
end;
$$;

revoke all on function public.planner_promote_ctp_variant_to_runtime(
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  integer,
  boolean,
  text
) from public, anon, authenticated;

comment on function public.planner_promote_ctp_variant_to_runtime(
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  integer,
  boolean,
  text
) is
  'Promotes one official CTP variant into rutas, ruta_puntos, paradas, route_patterns, route_pattern_stops, service_windows, and planner_ctp_preview_route_bindings.';
