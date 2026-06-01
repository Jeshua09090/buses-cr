set search_path = public, extensions;

-- The first broad Cartago seed surfaced a runtime bottleneck: v2 was expanding
-- every nearby origin/destination stop before ranking. Keep the same public
-- contract and score shape, but prune candidates per pattern and globally
-- before direct/transfer expansion.

create or replace function public.buscar_viajes_0_1_transbordo_v2(
  p_origen_lat double precision,
  p_origen_lng double precision,
  p_destino_lat double precision,
  p_destino_lng double precision,
  p_radio_origen_m integer default 600,
  p_radio_destino_m integer default 600,
  p_max_caminar_transbordo_m integer default 180,
  p_max_resultados integer default 12,
  p_sentido text default null,
  p_fecha_hora timestamptz default timezone('utc', now()),
  p_es_feriado boolean default false,
  p_espera_default_min integer default 12
)
returns table (
  tipo_viaje text,
  transbordos integer,
  score numeric,
  ruta_1_id bigint,
  ruta_1_nombre text,
  ruta_1_codigo text,
  ruta_1_operador text,
  sentido_1 text,
  subida_1_parada_id bigint,
  subida_1_parada_nombre text,
  subida_1_distancia_m integer,
  bajada_1_parada_id bigint,
  bajada_1_parada_nombre text,
  ruta_2_id bigint,
  ruta_2_nombre text,
  ruta_2_codigo text,
  ruta_2_operador text,
  sentido_2 text,
  subida_2_parada_id bigint,
  subida_2_parada_nombre text,
  bajada_2_parada_id bigint,
  bajada_2_parada_nombre text,
  transbordo_distancia_m integer,
  destino_distancia_final_m integer,
  caminata_total_m integer,
  tiempo_caminando_total_min integer,
  espera_1_min integer,
  espera_2_min integer,
  espera_total_min integer,
  frecuencia_1_min integer,
  frecuencia_2_min integer,
  dia_tipo_aplicado text,
  hora_local_aplicada time,
  tarifa_total numeric
)
language sql
stable
set search_path = public, extensions
as $$
with
contexto as (
  select
    st_setsrid(st_makepoint(p_origen_lng, p_origen_lat), 4326)::geography as origen_geo,
    st_setsrid(st_makepoint(p_destino_lng, p_destino_lat), 4326)::geography as destino_geo,
    (p_fecha_hora at time zone 'America/Costa_Rica')::time as hora_local,
    case
      when p_es_feriado then 'feriado'
      when extract(dow from (p_fecha_hora at time zone 'America/Costa_Rica')) = 0 then 'domingo'
      when extract(dow from (p_fecha_hora at time zone 'America/Costa_Rica')) = 6 then 'sabado'
      else 'habil'
    end::text as dia_tipo_actual
),
latest_fares as (
  select distinct on (upper(trim(t.codigo_ruta)))
    upper(trim(t.codigo_ruta)) as codigo_ruta_key,
    t.tarifa_regular
  from public.tarifas t
  where t.codigo_ruta is not null
  order by upper(trim(t.codigo_ruta)), t.fecha_vigencia desc nulls last, t.id desc
),
active_patterns as (
  select
    rp.id as pattern_id,
    rp.ruta_id,
    rp.sentido,
    r.nombre_ruta as ruta_nombre,
    r.codigo_ctp as ruta_codigo,
    r.operador as ruta_operador,
    coalesce(rp.categoria_operativa, 'desconocida') as categoria_operativa
  from public.route_patterns rp
  join public.rutas r
    on r.id = rp.ruta_id
  where rp.activo = true
    and (p_sentido is null or rp.sentido = p_sentido)
),
origin_nearby_stops as (
  select
    ns.parada_id,
    ns.parada_nombre,
    ns.distance_m as origen_distancia_m,
    ns.source as nearby_source
  from contexto c
  join public.planner_nearby_runtime_stops(
    p_origen_lat,
    p_origen_lng,
    p_radio_origen_m
  ) ns
    on true
),
destination_nearby_stops as (
  select
    ns.parada_id,
    ns.parada_nombre,
    ns.distance_m as destino_distancia_m,
    ns.source as nearby_source
  from contexto c
  join public.planner_nearby_runtime_stops(
    p_destino_lat,
    p_destino_lng,
    p_radio_destino_m
  ) ns
    on true
),
origin_candidates_raw as (
  select
    ap.pattern_id,
    ap.ruta_id,
    ap.sentido,
    ap.ruta_nombre,
    ap.ruta_codigo,
    ap.ruta_operador,
    ap.categoria_operativa,
    rps.parada_id,
    rps.stop_sequence,
    ons.parada_nombre,
    ons.origen_distancia_m,
    ons.nearby_source,
    row_number() over (
      partition by ap.pattern_id
      order by ons.origen_distancia_m asc, rps.stop_sequence asc, rps.parada_id asc
    ) as rn_pattern,
    row_number() over (
      order by ons.origen_distancia_m asc, ap.pattern_id asc, rps.stop_sequence asc
    ) as rn_global
  from origin_nearby_stops ons
  join public.route_pattern_stops rps
    on rps.parada_id = ons.parada_id
   and rps.es_subida = true
  join active_patterns ap
    on ap.pattern_id = rps.pattern_id
),
origin_candidates as (
  select
    ocr.pattern_id,
    ocr.ruta_id,
    ocr.sentido,
    ocr.ruta_nombre,
    ocr.ruta_codigo,
    ocr.ruta_operador,
    ocr.categoria_operativa,
    ocr.parada_id,
    ocr.stop_sequence,
    ocr.parada_nombre,
    ocr.origen_distancia_m,
    ocr.nearby_source
  from origin_candidates_raw ocr
  where ocr.rn_pattern <= 3
    and ocr.rn_global <= 80
),
destination_candidates_raw as (
  select
    ap.pattern_id,
    ap.ruta_id,
    ap.sentido,
    ap.ruta_nombre,
    ap.ruta_codigo,
    ap.ruta_operador,
    rps.parada_id,
    rps.stop_sequence,
    dns.parada_nombre,
    dns.destino_distancia_m,
    dns.nearby_source,
    row_number() over (
      partition by ap.pattern_id
      order by dns.destino_distancia_m asc, rps.stop_sequence asc, rps.parada_id asc
    ) as rn_pattern,
    row_number() over (
      order by dns.destino_distancia_m asc, ap.pattern_id asc, rps.stop_sequence asc
    ) as rn_global
  from destination_nearby_stops dns
  join public.route_pattern_stops rps
    on rps.parada_id = dns.parada_id
   and rps.es_bajada = true
  join active_patterns ap
    on ap.pattern_id = rps.pattern_id
),
destination_candidates as (
  select
    dcr.pattern_id,
    dcr.ruta_id,
    dcr.sentido,
    dcr.ruta_nombre,
    dcr.ruta_codigo,
    dcr.ruta_operador,
    dcr.parada_id,
    dcr.stop_sequence,
    dcr.parada_nombre,
    dcr.destino_distancia_m,
    dcr.nearby_source
  from destination_candidates_raw dcr
  where dcr.rn_pattern <= 3
    and dcr.rn_global <= 80
),
transbordos_expandido as (
  select
    tx.parada_origen_id,
    tx.parada_destino_id,
    tx.distancia_caminando_m,
    tx.transfer_type,
    tx.transfer_confidence,
    tx.transfer_source
  from public.planner_runtime_transfer_links(p_max_caminar_transbordo_m) tx
),
waits as (
  select
    ap.pattern_id,
    c.dia_tipo_actual,
    c.hora_local,
    coalesce((
      select sw.espera_promedio_min
      from public.service_windows sw
      where sw.pattern_id = ap.pattern_id
        and sw.activo = true
        and sw.dia_tipo = c.dia_tipo_actual
        and c.hora_local >= sw.hora_inicio
        and c.hora_local < sw.hora_fin
      order by sw.hora_inicio desc, sw.id desc
      limit 1
    ), p_espera_default_min) as espera_min,
    coalesce((
      select sw.frecuencia_promedio_min
      from public.service_windows sw
      where sw.pattern_id = ap.pattern_id
        and sw.activo = true
        and sw.dia_tipo = c.dia_tipo_actual
        and c.hora_local >= sw.hora_inicio
        and c.hora_local < sw.hora_fin
      order by sw.hora_inicio desc, sw.id desc
      limit 1
    ), p_espera_default_min * 2) as frecuencia_min
  from active_patterns ap
  cross join contexto c
),
direct_ranked as (
  select
    'directo'::text as tipo_viaje,
    0 as transbordos,
    (
      oc.origen_distancia_m
      + dc.destino_distancia_m
      + (coalesce(w1.espera_min, p_espera_default_min) * 80)
      + case when oc.nearby_source = 'raw_parada' then 25 else 0 end
      + case when dc.nearby_source = 'raw_parada' then 25 else 0 end
      + case
          when oc.categoria_operativa = 'expreso' and dc.destino_distancia_m <= 450 then 220
          when oc.categoria_operativa = 'troncal' and dc.destino_distancia_m <= 450 then 160
          else 0
        end
    )::numeric as score,
    oc.ruta_id as ruta_1_id,
    oc.ruta_nombre as ruta_1_nombre,
    oc.ruta_codigo as ruta_1_codigo,
    oc.ruta_operador as ruta_1_operador,
    oc.sentido as sentido_1,
    oc.parada_id as subida_1_parada_id,
    oc.parada_nombre as subida_1_parada_nombre,
    oc.origen_distancia_m as subida_1_distancia_m,
    dc.parada_id as bajada_1_parada_id,
    dc.parada_nombre as bajada_1_parada_nombre,
    null::bigint as ruta_2_id,
    null::text as ruta_2_nombre,
    null::text as ruta_2_codigo,
    null::text as ruta_2_operador,
    null::text as sentido_2,
    null::bigint as subida_2_parada_id,
    null::text as subida_2_parada_nombre,
    null::bigint as bajada_2_parada_id,
    null::text as bajada_2_parada_nombre,
    null::integer as transbordo_distancia_m,
    dc.destino_distancia_m as destino_distancia_final_m,
    (oc.origen_distancia_m + dc.destino_distancia_m)::integer as caminata_total_m,
    greatest(1, round((oc.origen_distancia_m + dc.destino_distancia_m)::numeric / 80.0))::integer as tiempo_caminando_total_min,
    coalesce(w1.espera_min, p_espera_default_min) as espera_1_min,
    null::integer as espera_2_min,
    coalesce(w1.espera_min, p_espera_default_min) as espera_total_min,
    coalesce(w1.frecuencia_min, p_espera_default_min * 2) as frecuencia_1_min,
    null::integer as frecuencia_2_min,
    c.dia_tipo_actual as dia_tipo_aplicado,
    c.hora_local as hora_local_aplicada,
    coalesce(f1.tarifa_regular, 0)::numeric as tarifa_total,
    row_number() over (
      partition by oc.pattern_id
      order by
        (
          oc.origen_distancia_m
          + dc.destino_distancia_m
          + (coalesce(w1.espera_min, p_espera_default_min) * 80)
        ) asc,
        dc.stop_sequence desc,
        oc.stop_sequence asc
    ) as candidate_rank
  from contexto c
  join origin_candidates oc
    on true
  join destination_candidates dc
    on dc.pattern_id = oc.pattern_id
   and dc.stop_sequence > oc.stop_sequence
  left join waits w1
    on w1.pattern_id = oc.pattern_id
  left join latest_fares f1
    on f1.codigo_ruta_key = upper(trim(coalesce(oc.ruta_codigo, '')))
),
direct_best as (
  select *
  from direct_ranked
  where candidate_rank <= 3
),
allow_transfer_search as (
  select count(*) < 3 as run_transfer
  from direct_best
),
destination_pattern_scope as (
  select distinct d.pattern_id
  from destination_candidates d
),
transfer_ranked as (
  select
    'transbordo'::text as tipo_viaje,
    1 as transbordos,
    (
      oc.origen_distancia_m
      + tx.distancia_caminando_m
      + dc2.destino_distancia_m
      + (coalesce(w1.espera_min, p_espera_default_min) * 80)
      + (coalesce(w2.espera_min, p_espera_default_min) * 90)
      + 220
      + case when oc.nearby_source = 'raw_parada' then 25 else 0 end
      + case when dc2.nearby_source = 'raw_parada' then 25 else 0 end
      + case when tx.transfer_source = 'transbordos' then 40 else 0 end
      - case
          when tx.transfer_type = 'same_stop' then 130
          when tx.transfer_type = 'same_macro' then 110
          when tx.transfer_type = 'hub_walk' then 80
          when tx.transfer_type = 'nearby_walk' then 20
          else 0
        end
      - greatest(0, floor(coalesce(tx.transfer_confidence, 0.5) * 30))::integer
    )::numeric as score,
    oc.ruta_id as ruta_1_id,
    oc.ruta_nombre as ruta_1_nombre,
    oc.ruta_codigo as ruta_1_codigo,
    oc.ruta_operador as ruta_1_operador,
    oc.sentido as sentido_1,
    oc.parada_id as subida_1_parada_id,
    oc.parada_nombre as subida_1_parada_nombre,
    oc.origen_distancia_m as subida_1_distancia_m,
    rp1_alight.parada_id as bajada_1_parada_id,
    coalesce(nullif(trim(p1_display.parada_nombre), ''), nullif(trim(p1_alight.nombre), ''), 'Parada de buses') as bajada_1_parada_nombre,
    ap2.ruta_id as ruta_2_id,
    ap2.ruta_nombre as ruta_2_nombre,
    ap2.ruta_codigo as ruta_2_codigo,
    ap2.ruta_operador as ruta_2_operador,
    ap2.sentido as sentido_2,
    rp2_board.parada_id as subida_2_parada_id,
    coalesce(nullif(trim(p2_display.parada_nombre), ''), nullif(trim(p2_board.nombre), ''), 'Parada de buses') as subida_2_parada_nombre,
    dc2.parada_id as bajada_2_parada_id,
    dc2.parada_nombre as bajada_2_parada_nombre,
    tx.distancia_caminando_m as transbordo_distancia_m,
    dc2.destino_distancia_m as destino_distancia_final_m,
    (oc.origen_distancia_m + tx.distancia_caminando_m + dc2.destino_distancia_m)::integer as caminata_total_m,
    greatest(1, round((oc.origen_distancia_m + tx.distancia_caminando_m + dc2.destino_distancia_m)::numeric / 80.0))::integer as tiempo_caminando_total_min,
    coalesce(w1.espera_min, p_espera_default_min) as espera_1_min,
    coalesce(w2.espera_min, p_espera_default_min) as espera_2_min,
    (coalesce(w1.espera_min, p_espera_default_min) + coalesce(w2.espera_min, p_espera_default_min))::integer as espera_total_min,
    coalesce(w1.frecuencia_min, p_espera_default_min * 2) as frecuencia_1_min,
    coalesce(w2.frecuencia_min, p_espera_default_min * 2) as frecuencia_2_min,
    c.dia_tipo_actual as dia_tipo_aplicado,
    c.hora_local as hora_local_aplicada,
    (coalesce(f1.tarifa_regular, 0) + coalesce(f2.tarifa_regular, 0))::numeric as tarifa_total,
    row_number() over (
      partition by oc.pattern_id, ap2.pattern_id
      order by
        (
          oc.origen_distancia_m
          + tx.distancia_caminando_m
          + dc2.destino_distancia_m
          + (coalesce(w1.espera_min, p_espera_default_min) * 80)
          + (coalesce(w2.espera_min, p_espera_default_min) * 90)
          + case when tx.transfer_source = 'transbordos' then 40 else 0 end
          - case
              when tx.transfer_type = 'same_stop' then 130
              when tx.transfer_type = 'same_macro' then 110
              when tx.transfer_type = 'hub_walk' then 80
              when tx.transfer_type = 'nearby_walk' then 20
              else 0
            end
        ) asc,
        dc2.stop_sequence desc,
        oc.stop_sequence asc
    ) as candidate_rank
  from contexto c
  join allow_transfer_search ats
    on ats.run_transfer
  join origin_candidates oc
    on true
  join public.route_pattern_stops rp1_alight
    on rp1_alight.pattern_id = oc.pattern_id
   and rp1_alight.es_bajada = true
   and rp1_alight.stop_sequence > oc.stop_sequence
  join public.paradas p1_alight
    on p1_alight.id = rp1_alight.parada_id
  left join public.planner_linked_parada_display_names p1_display
    on p1_display.parada_id = rp1_alight.parada_id
  join transbordos_expandido tx
    on tx.parada_origen_id = rp1_alight.parada_id
   and tx.distancia_caminando_m <= p_max_caminar_transbordo_m
  join public.route_pattern_stops rp2_board
    on rp2_board.parada_id = tx.parada_destino_id
   and rp2_board.es_subida = true
  join active_patterns ap2
    on ap2.pattern_id = rp2_board.pattern_id
   and ap2.ruta_id <> oc.ruta_id
  join public.paradas p2_board
    on p2_board.id = rp2_board.parada_id
  left join public.planner_linked_parada_display_names p2_display
    on p2_display.parada_id = rp2_board.parada_id
  join destination_pattern_scope dps
    on dps.pattern_id = ap2.pattern_id
  join destination_candidates dc2
    on dc2.pattern_id = ap2.pattern_id
   and dc2.stop_sequence > rp2_board.stop_sequence
  left join waits w1
    on w1.pattern_id = oc.pattern_id
  left join waits w2
    on w2.pattern_id = ap2.pattern_id
  left join latest_fares f1
    on f1.codigo_ruta_key = upper(trim(coalesce(oc.ruta_codigo, '')))
  left join latest_fares f2
    on f2.codigo_ruta_key = upper(trim(coalesce(ap2.ruta_codigo, '')))
),
transfer_best as (
  select *
  from transfer_ranked
  where candidate_rank <= 2
)
select
  results.tipo_viaje,
  results.transbordos,
  (results.score + public.planner_short_walk_ratio_penalty(st_distance(
    st_setsrid(st_makepoint(p_origen_lng, p_origen_lat), 4326)::geography,
    st_setsrid(st_makepoint(p_destino_lng, p_destino_lat), 4326)::geography
  )::integer, results.caminata_total_m))::numeric as score,
  results.ruta_1_id,
  results.ruta_1_nombre,
  results.ruta_1_codigo,
  results.ruta_1_operador,
  results.sentido_1,
  results.subida_1_parada_id,
  results.subida_1_parada_nombre,
  results.subida_1_distancia_m,
  results.bajada_1_parada_id,
  results.bajada_1_parada_nombre,
  results.ruta_2_id,
  results.ruta_2_nombre,
  results.ruta_2_codigo,
  results.ruta_2_operador,
  results.sentido_2,
  results.subida_2_parada_id,
  results.subida_2_parada_nombre,
  results.bajada_2_parada_id,
  results.bajada_2_parada_nombre,
  results.transbordo_distancia_m,
  results.destino_distancia_final_m,
  results.caminata_total_m,
  results.tiempo_caminando_total_min,
  results.espera_1_min,
  results.espera_2_min,
  results.espera_total_min,
  results.frecuencia_1_min,
  results.frecuencia_2_min,
  results.dia_tipo_aplicado,
  results.hora_local_aplicada,
  results.tarifa_total
from (
  select * from direct_best
  union all
  select * from transfer_best
) results
order by
  (results.score + public.planner_short_walk_ratio_penalty(st_distance(
    st_setsrid(st_makepoint(p_origen_lng, p_origen_lat), 4326)::geography,
    st_setsrid(st_makepoint(p_destino_lng, p_destino_lat), 4326)::geography
  )::integer, results.caminata_total_m)) asc,
  results.transbordos asc,
  results.caminata_total_m asc
limit greatest(1, p_max_resultados);
$$;

grant execute on function public.buscar_viajes_0_1_transbordo_v2(
  double precision,
  double precision,
  double precision,
  double precision,
  integer,
  integer,
  integer,
  integer,
  text,
  timestamptz,
  boolean,
  integer
) to anon, authenticated;

comment on function public.buscar_viajes_0_1_transbordo_v2(
  double precision,
  double precision,
  double precision,
  double precision,
  integer,
  integer,
  integer,
  integer,
  text,
  timestamptz,
  boolean,
  integer
) is
  'Version 2 del buscador de viajes con candidate pruning antes de expandir directos/transbordos.';
