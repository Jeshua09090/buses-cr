set search_path = public, extensions;

with terminal_stop as (
  select
    p.id as parada_id,
    p.geo as stop_geo
  from public.paradas p
  where p.id = -200005450
),
target_pattern as (
  select
    rp.id as pattern_id,
    ts.parada_id,
    st_distance(ts.stop_geo, first_stop.stop_geo)::integer as first_segment_m
  from public.route_patterns rp
  cross join terminal_stop ts
  join lateral (
    select p.geo as stop_geo
    from public.route_pattern_stops rps
    join public.paradas p
      on p.id = rps.parada_id
    where rps.pattern_id = rp.id
    order by rps.stop_sequence asc
    limit 1
  ) first_stop on true
  where rp.ruta_id = 4434
    and rp.fuente = 'importacion'
    and coalesce(rp.metadata ->> 'seed_source', '') = 'preview_cartago_oreamuno_irazu_modern_v1'
    and not exists (
      select 1
      from public.route_pattern_stops existing
      where existing.pattern_id = rp.id
        and existing.parada_id = ts.parada_id
    )
),
bumped_existing as (
  update public.route_pattern_stops rps
  set distancia_acumulada_m = coalesce(rps.distancia_acumulada_m, 0) + tp.first_segment_m,
      tiempo_estimado_desde_inicio_min = coalesce(rps.tiempo_estimado_desde_inicio_min, 0)
        + greatest(1, round(tp.first_segment_m::numeric / 380.0)::integer),
      updated_at = timezone('utc', now())
  from target_pattern tp
  where rps.pattern_id = tp.pattern_id
  returning rps.pattern_id
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
select distinct
  tp.pattern_id,
  tp.parada_id,
  0,
  true,
  true,
  0,
  0,
  0,
  0
from target_pattern tp
where exists (
  select 1
  from bumped_existing be
  where be.pattern_id = tp.pattern_id
);

with terminal_stop as (
  select
    p.id as parada_id,
    p.geo as stop_geo
  from public.paradas p
  where p.id = -200005450
),
target_pattern as (
  select
    rp.id as pattern_id,
    ts.parada_id,
    last_stop.stop_sequence + 1 as stop_sequence,
    coalesce(last_stop.distancia_acumulada_m, 0)
      + st_distance(last_stop.stop_geo, ts.stop_geo)::integer as distancia_acumulada_m,
    coalesce(last_stop.tiempo_estimado_desde_inicio_min, 0)
      + greatest(1, round(st_distance(last_stop.stop_geo, ts.stop_geo)::numeric / 380.0)::integer) as tiempo_estimado_desde_inicio_min
  from public.route_patterns rp
  cross join terminal_stop ts
  join lateral (
    select
      rps.stop_sequence,
      rps.distancia_acumulada_m,
      rps.tiempo_estimado_desde_inicio_min,
      p.geo as stop_geo
    from public.route_pattern_stops rps
    join public.paradas p
      on p.id = rps.parada_id
    where rps.pattern_id = rp.id
    order by rps.stop_sequence desc
    limit 1
  ) last_stop on true
  where rp.ruta_id = 4435
    and rp.fuente = 'importacion'
    and coalesce(rp.metadata ->> 'seed_source', '') = 'preview_cartago_oreamuno_irazu_modern_v1'
    and not exists (
      select 1
      from public.route_pattern_stops existing
      where existing.pattern_id = rp.id
        and existing.parada_id = ts.parada_id
    )
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
  pattern_id,
  parada_id,
  stop_sequence,
  true,
  true,
  0,
  0,
  distancia_acumulada_m,
  tiempo_estimado_desde_inicio_min
from target_pattern;

with pattern_summary as (
  select
    rp.id as pattern_id,
    (array_agg(rps.parada_id order by rps.stop_sequence asc))[1] as parada_inicial_id,
    (array_agg(rps.parada_id order by rps.stop_sequence desc))[1] as parada_final_id,
    (array_agg(p.nombre order by rps.stop_sequence desc))[1] as headsign,
    count(*)::integer as parada_count,
    max(rps.distancia_acumulada_m)::integer as distancia_total_m,
    md5(
      string_agg(
        concat_ws(':', rps.parada_id::text, rps.stop_sequence::text),
        '|'
        order by rps.stop_sequence
      )
    ) as stop_signature
  from public.route_patterns rp
  join public.route_pattern_stops rps
    on rps.pattern_id = rp.id
  join public.paradas p
    on p.id = rps.parada_id
  where rp.ruta_id in (4434, 4435)
    and rp.fuente = 'importacion'
    and coalesce(rp.metadata ->> 'seed_source', '') = 'preview_cartago_oreamuno_irazu_modern_v1'
  group by rp.id
)
update public.route_patterns rp
set parada_inicial_id = ps.parada_inicial_id,
    parada_final_id = ps.parada_final_id,
    headsign = ps.headsign,
    parada_count = ps.parada_count,
    distancia_total_m = ps.distancia_total_m,
    stop_signature = ps.stop_signature,
    metadata = coalesce(rp.metadata, '{}'::jsonb) || jsonb_build_object(
      'terminal_endpoint_fix', 'prueba_cartago_irazu_terminal_endpoint_fix_v1',
      'terminal_stop_id', -200005450
    ),
    updated_at = timezone('utc', now())
from pattern_summary ps
where rp.id = ps.pattern_id;
