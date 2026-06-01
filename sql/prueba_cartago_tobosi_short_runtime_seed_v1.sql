set search_path = public, extensions;

-- 0331 short branch: Cartago <-> Tobosi / Pollos Charlie.
--
-- Why this exists:
-- Moovit exposes a distinct short CARTAGO - TOBOSI service that ends at
-- Terminal Tobosi / Pollos Charlie. The current runtime mostly models the
-- longer Quebradillas and Barrancas branches, whose Sunday window ends at
-- 19:00. This short branch is needed for trips like Terminal Cartago ->
-- Restaurante Nuevo Mundo where Moovit keeps Tobosi available later on
-- weekends.
--
-- Source geometry/stops:
-- Reuse the already-seeded long Tobosi/Quebradillas patterns and clip at the
-- Pollos Charlie stop. This avoids inventing stop geometry.
--
-- Source schedule baseline:
-- Moovit CARTAGO - TOBOSI pages checked 2026-05-11.
-- - Cartago -> Tobosi Contiguo A Pollos Charlie:
--   lun-vie 07:10 single departure; sab/dom 06:05-22:05 every 20 min.
-- - Tobosi Contiguo A Pollos Charlie -> Cartago:
--   lun-vie 05:50, 06:30, 16:30, 17:30, 20:15.
--
-- This migration intentionally does not tighten the existing Quebradillas
-- windows. That should happen only after verifying those branches separately.

do $$
declare
  v_seed_source constant text := 'manual_cartago_tobosi_short_moovit_v1';
  v_ida_ruta_id constant bigint := 4318;
  v_vuelta_ruta_id constant bigint := 4319;
  v_source_ida_pattern_id constant bigint := 899;
  v_source_vuelta_pattern_id constant bigint := 900;
  v_pollos_charlie_parada_id constant bigint := -200015861;
begin
  -- Idempotent cleanup for this manual seed only.
  delete from public.ruta_puntos
  where ruta_id in (v_ida_ruta_id, v_vuelta_ruta_id);

  delete from public.rutas
  where id in (v_ida_ruta_id, v_vuelta_ruta_id);

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
  values
    (
      v_ida_ruta_id,
      '331',
      'Transportes Higapi',
      'CARTAGO - TOBOSI',
      'CARTAGO',
      'TOBOSI',
      null,
      null
    ),
    (
      v_vuelta_ruta_id,
      '331',
      'Transportes Higapi',
      'TOBOSI - CARTAGO',
      'TOBOSI',
      'CARTAGO',
      null,
      null
    );

  with clipped_ida as (
    select
      rps.*,
      row_number() over (order by rps.stop_sequence asc)::integer as new_stop_sequence
    from public.route_pattern_stops rps
    where rps.pattern_id = v_source_ida_pattern_id
      and rps.stop_sequence <= (
        select stop_sequence
        from public.route_pattern_stops
        where pattern_id = v_source_ida_pattern_id
          and parada_id = v_pollos_charlie_parada_id
        order by stop_sequence asc
        limit 1
      )
  ),
  ida_pattern_row as (
    select
      md5(
        string_agg(
          concat_ws(':', c.parada_id::text, c.new_stop_sequence::text),
          '|'
          order by c.new_stop_sequence
        )
      ) as stop_signature,
      (array_agg(c.parada_id order by c.new_stop_sequence asc))[1] as parada_inicial_id,
      (array_agg(c.parada_id order by c.new_stop_sequence desc))[1] as parada_final_id,
      (array_agg(p.nombre order by c.new_stop_sequence desc))[1] as headsign,
      count(*)::integer as parada_count,
      max(c.distancia_acumulada_m)::integer as distancia_total_m
    from clipped_ida c
    join public.paradas p
      on p.id = c.parada_id
  ),
  inserted_ida_pattern as (
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
      v_ida_ruta_id,
      'ida',
      'manual-ida-4318-cartago-tobosi-short-moovit-v1',
      'CARTAGO - TOBOSI / IDA',
      pr.headsign,
      pr.stop_signature,
      pr.parada_inicial_id,
      pr.parada_final_id,
      pr.parada_count,
      pr.distancia_total_m,
      true,
      'manual',
      'interurbana',
      'manual',
      0.780,
      jsonb_build_object(
        'seed_source', v_seed_source,
        'seed_kind', 'short_branch_clip',
        'source_pattern_id', v_source_ida_pattern_id,
        'clipped_at_parada_id', v_pollos_charlie_parada_id,
        'external_baseline', 'Moovit CARTAGO - TOBOSI Terminal Cartago -> Terminal Tobosi Contiguo A Pollos Charlie'
      )
    from ida_pattern_row pr
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
    ip.id,
    c.parada_id,
    c.new_stop_sequence,
    c.es_subida,
    c.es_bajada,
    c.pickup_type,
    c.drop_off_type,
    c.distancia_acumulada_m,
    c.tiempo_estimado_desde_inicio_min
  from clipped_ida c
  cross join inserted_ida_pattern ip;

  with clipped_vuelta as (
    select
      rps.*,
      row_number() over (order by rps.stop_sequence asc)::integer as new_stop_sequence,
      min(rps.distancia_acumulada_m) over () as base_distance_m,
      min(rps.tiempo_estimado_desde_inicio_min) over () as base_time_min
    from public.route_pattern_stops rps
    where rps.pattern_id = v_source_vuelta_pattern_id
      and rps.stop_sequence >= (
        select stop_sequence
        from public.route_pattern_stops
        where pattern_id = v_source_vuelta_pattern_id
          and parada_id = v_pollos_charlie_parada_id
        order by stop_sequence asc
        limit 1
      )
  ),
  vuelta_pattern_row as (
    select
      md5(
        string_agg(
          concat_ws(':', c.parada_id::text, c.new_stop_sequence::text),
          '|'
          order by c.new_stop_sequence
        )
      ) as stop_signature,
      (array_agg(c.parada_id order by c.new_stop_sequence asc))[1] as parada_inicial_id,
      (array_agg(c.parada_id order by c.new_stop_sequence desc))[1] as parada_final_id,
      (array_agg(p.nombre order by c.new_stop_sequence desc))[1] as headsign,
      count(*)::integer as parada_count,
      max(c.distancia_acumulada_m - c.base_distance_m)::integer as distancia_total_m
    from clipped_vuelta c
    join public.paradas p
      on p.id = c.parada_id
  ),
  inserted_vuelta_pattern as (
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
      v_vuelta_ruta_id,
      'vuelta',
      'manual-vuelta-4319-tobosi-cartago-short-moovit-v1',
      'TOBOSI - CARTAGO / VUELTA',
      pr.headsign,
      pr.stop_signature,
      pr.parada_inicial_id,
      pr.parada_final_id,
      pr.parada_count,
      pr.distancia_total_m,
      true,
      'manual',
      'interurbana',
      'manual',
      0.780,
      jsonb_build_object(
        'seed_source', v_seed_source,
        'seed_kind', 'short_branch_clip',
        'source_pattern_id', v_source_vuelta_pattern_id,
        'clipped_from_parada_id', v_pollos_charlie_parada_id,
        'external_baseline', 'Moovit CARTAGO - TOBOSI Terminal Tobosi Contiguo A Pollos Charlie -> Terminal Cartago'
      )
    from vuelta_pattern_row pr
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
    ip.id,
    c.parada_id,
    c.new_stop_sequence,
    c.es_subida,
    c.es_bajada,
    c.pickup_type,
    c.drop_off_type,
    c.distancia_acumulada_m - c.base_distance_m,
    greatest(0, c.tiempo_estimado_desde_inicio_min - c.base_time_min)
  from clipped_vuelta c
  cross join inserted_vuelta_pattern ip;

  -- Coarse route point fallback for planner-lab visualization. We use stop
  -- coordinates rather than the full Quebradillas shape, so the map does not
  -- imply the short branch continues beyond Tobosi.
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
    -1 * (v_ida_ruta_id * 100000 + rps.stop_sequence) as id,
    v_ida_ruta_id,
    p.lat::double precision,
    p.lng::double precision,
    rps.stop_sequence,
    st_setsrid(st_makepoint(p.lng::double precision, p.lat::double precision), 4326)::geography,
    1
  from public.route_patterns rp
  join public.route_pattern_stops rps
    on rps.pattern_id = rp.id
  join public.paradas p
    on p.id = rps.parada_id
  where rp.ruta_id = v_ida_ruta_id
    and coalesce(rp.metadata ->> 'seed_source', '') = v_seed_source
  order by rps.stop_sequence;

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
    -1 * (v_vuelta_ruta_id * 100000 + rps.stop_sequence) as id,
    v_vuelta_ruta_id,
    p.lat::double precision,
    p.lng::double precision,
    rps.stop_sequence,
    st_setsrid(st_makepoint(p.lng::double precision, p.lat::double precision), 4326)::geography,
    1
  from public.route_patterns rp
  join public.route_pattern_stops rps
    on rps.pattern_id = rp.id
  join public.paradas p
    on p.id = rps.parada_id
  where rp.ruta_id = v_vuelta_ruta_id
    and coalesce(rp.metadata ->> 'seed_source', '') = v_seed_source
  order by rps.stop_sequence;

  with seeded_patterns as (
    select id, ruta_id
    from public.route_patterns
    where ruta_id in (v_ida_ruta_id, v_vuelta_ruta_id)
      and coalesce(metadata ->> 'seed_source', '') = v_seed_source
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
    sp.id,
    sw.dia_tipo,
    sw.hora_inicio,
    sw.hora_fin,
    sw.frecuencia_promedio_min,
    true,
    sw.notas,
    jsonb_build_object(
      'seed_source', v_seed_source,
      'seed_kind', 'moovit_service_window',
      'seed_ruta_id', sp.ruta_id,
      'external_baseline', sw.external_baseline
    )
  from seeded_patterns sp
  join lateral (
    values
      -- IDA: weekday single departure 07:10. A one-minute window plus a
      -- large headway yields one synthetic departure in the snapshot.
      ('ida'::text, 'habil'::text, '07:10'::time, '07:11'::time, 240, 'Moovit weekday single departure 07:10', 'Moovit line CARTAGO - TOBOSI, Cartago -> Tobosi Contiguo'),
      -- IDA: weekend 06:05-22:05 every 20 minutes.
      ('ida'::text, 'sabado'::text, '06:05'::time, '22:05'::time, 20, 'Moovit weekend 06:05-22:05 every 20 min', 'Moovit line CARTAGO - TOBOSI, Cartago -> Tobosi Contiguo'),
      ('ida'::text, 'domingo'::text, '06:05'::time, '22:05'::time, 20, 'Moovit weekend 06:05-22:05 every 20 min', 'Moovit line CARTAGO - TOBOSI, Cartago -> Tobosi Contiguo'),
      ('ida'::text, 'feriado'::text, '06:05'::time, '22:05'::time, 20, 'Assume domingo service for holidays pending operator source', 'Moovit line CARTAGO - TOBOSI, Cartago -> Tobosi Contiguo'),
      -- VUELTA: weekday exact departures from Moovit.
      ('vuelta'::text, 'habil'::text, '05:50'::time, '05:51'::time, 240, 'Moovit weekday single departure 05:50', 'Moovit line CARTAGO - TOBOSI, Tobosi Contiguo -> Cartago'),
      ('vuelta'::text, 'habil'::text, '06:30'::time, '06:31'::time, 240, 'Moovit weekday single departure 06:30', 'Moovit line CARTAGO - TOBOSI, Tobosi Contiguo -> Cartago'),
      ('vuelta'::text, 'habil'::text, '16:30'::time, '16:31'::time, 240, 'Moovit weekday single departure 16:30', 'Moovit line CARTAGO - TOBOSI, Tobosi Contiguo -> Cartago'),
      ('vuelta'::text, 'habil'::text, '17:30'::time, '17:31'::time, 240, 'Moovit weekday single departure 17:30', 'Moovit line CARTAGO - TOBOSI, Tobosi Contiguo -> Cartago'),
      ('vuelta'::text, 'habil'::text, '20:15'::time, '20:16'::time, 240, 'Moovit weekday single departure 20:15', 'Moovit line CARTAGO - TOBOSI, Tobosi Contiguo -> Cartago')
  ) as sw(sentido, dia_tipo, hora_inicio, hora_fin, frecuencia_promedio_min, notas, external_baseline)
    on (
      (sp.ruta_id = v_ida_ruta_id and sw.sentido = 'ida')
      or (sp.ruta_id = v_vuelta_ruta_id and sw.sentido = 'vuelta')
    );

  update public.rutas r
  set geometry = route_geometry.geometry
  from (
    select
      rp.ruta_id,
      st_asgeojson(
        st_makeline(
          st_setsrid(st_makepoint(p.lng::double precision, p.lat::double precision), 4326)
          order by rps.stop_sequence
        )
      )::jsonb as geometry
    from public.route_patterns rp
    join public.route_pattern_stops rps
      on rps.pattern_id = rp.id
    join public.paradas p
      on p.id = rps.parada_id
    where rp.ruta_id in (v_ida_ruta_id, v_vuelta_ruta_id)
      and coalesce(rp.metadata ->> 'seed_source', '') = v_seed_source
    group by rp.ruta_id
  ) route_geometry
  where r.id = route_geometry.ruta_id;
end $$;
