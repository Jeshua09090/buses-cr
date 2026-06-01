set search_path = public, extensions;

-- Adaptador fase 1 GTFS-like v2:
-- Usa route_patterns/route_pattern_stops/service_windows y penaliza suavemente
-- patrones interurbanos/expresos en viajes cortos locales.
-- Requiere haber corrido:
-- 1) route_patterns_and_service_windows_v1.sql
-- 2) route_patterns_classification_v2.sql

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
    st_distance(
      st_setsrid(st_makepoint(p_origen_lng, p_origen_lat), 4326)::geography,
      st_setsrid(st_makepoint(p_destino_lng, p_destino_lat), 4326)::geography
    )::integer as viaje_lineal_m,
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
    rp.nombre as pattern_nombre,
    rp.headsign,
    coalesce(rp.categoria_operativa, 'desconocida') as categoria_operativa,
    coalesce(rp.clasificacion_fuente, 'sin_clasificar') as clasificacion_fuente,
    coalesce(rp.clasificacion_confianza, 0)::numeric as clasificacion_confianza
  from public.route_patterns rp
  join public.rutas r
    on r.id = rp.ruta_id
  where rp.activo = true
    and (p_sentido is null or rp.sentido = p_sentido)
),
origin_nearby_stops as (
  select
    p.id as parada_id,
    p.nombre as parada_nombre,
    st_distance(p.geo, c.origen_geo)::integer as origen_distancia_m
  from contexto c
  join public.paradas p
    on p.activo = true
   and st_dwithin(p.geo, c.origen_geo, p_radio_origen_m)
),
origin_candidates_raw as (
  select
    ap.pattern_id,
    ap.ruta_id,
    ap.sentido,
    ap.categoria_operativa,
    ap.clasificacion_fuente,
    ap.clasificacion_confianza,
    rps.parada_id,
    rps.stop_sequence,
    ap.ruta_nombre,
    ap.ruta_codigo,
    ap.ruta_operador,
    ons.parada_nombre,
    ons.origen_distancia_m,
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
    ocr.categoria_operativa,
    ocr.clasificacion_fuente,
    ocr.clasificacion_confianza,
    ocr.parada_id,
    ocr.stop_sequence,
    ocr.ruta_nombre,
    ocr.ruta_codigo,
    ocr.ruta_operador,
    ocr.parada_nombre,
    ocr.origen_distancia_m
  from origin_candidates_raw ocr
  where ocr.rn_pattern <= 3
    and ocr.rn_global <= 80
),
destination_nearby_stops as (
  select
    p.id as parada_id,
    p.nombre as parada_nombre,
    st_distance(p.geo, c.destino_geo)::integer as destino_distancia_m
  from contexto c
  join public.paradas p
    on p.activo = true
   and st_dwithin(p.geo, c.destino_geo, p_radio_destino_m)
),
destination_candidates_raw as (
  select
    ap.pattern_id,
    ap.ruta_id,
    ap.sentido,
    rps.parada_id,
    rps.stop_sequence,
    ap.ruta_nombre,
    ap.ruta_codigo,
    ap.ruta_operador,
    dns.parada_nombre,
    dns.destino_distancia_m,
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
    dcr.parada_id,
    dcr.stop_sequence,
    dcr.ruta_nombre,
    dcr.ruta_codigo,
    dcr.ruta_operador,
    dcr.parada_nombre,
    dcr.destino_distancia_m
  from destination_candidates_raw dcr
  where dcr.rn_pattern <= 3
    and dcr.rn_global <= 80
),
transbordos_expandido as (
  select
    t.parada_origen_id,
    t.parada_destino_id,
    t.distancia_caminando_m
  from public.transbordos t
  where t.activo = true
    and t.distancia_caminando_m <= p_max_caminar_transbordo_m

  union all

  select
    t.parada_destino_id as parada_origen_id,
    t.parada_origen_id as parada_destino_id,
    t.distancia_caminando_m
  from public.transbordos t
  where t.activo = true
    and t.bidireccional = true
    and t.distancia_caminando_m <= p_max_caminar_transbordo_m
),
direct_ranked as (
  select
    'directo'::text as tipo_viaje,
    0 as transbordos,
    (
      greatest(1, round((o.origen_distancia_m + d.destino_distancia_m) / 80.0))
      + coalesce(freq1.espera_promedio_min, p_espera_default_min)
      + coalesce(f1.tarifa_regular / 150.0, 0)
      + (
        case
          when o.categoria_operativa = 'interurbana' then
            case
              when c.viaje_lineal_m <= 3500 then 6
              when c.viaje_lineal_m <= 7000 then 3
              else 1
            end
          when o.categoria_operativa = 'expreso' then
            case
              when c.viaje_lineal_m <= 3500 then 5
              when c.viaje_lineal_m <= 7000 then 2
              else 0
            end
          when o.categoria_operativa = 'troncal' then
            case
              when c.viaje_lineal_m <= 2500 then 1
              else 0
            end
          else 0
        end
      ) * greatest(0.35, o.clasificacion_confianza)
    )::numeric as score,
    o.pattern_id,
    o.ruta_id as ruta_1_id,
    o.ruta_nombre as ruta_1_nombre,
    o.ruta_codigo as ruta_1_codigo,
    o.ruta_operador as ruta_1_operador,
    o.sentido as sentido_1,
    o.parada_id as subida_1_parada_id,
    coalesce(o.parada_nombre, 'Parada de buses') as subida_1_parada_nombre,
    o.origen_distancia_m as subida_1_distancia_m,
    d.parada_id as bajada_1_parada_id,
    coalesce(d.parada_nombre, 'Parada de buses') as bajada_1_parada_nombre,
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
    d.destino_distancia_m as destino_distancia_final_m,
    (o.origen_distancia_m + d.destino_distancia_m)::integer as caminata_total_m,
    greatest(1, round((o.origen_distancia_m + d.destino_distancia_m) / 80.0))::integer as tiempo_caminando_total_min,
    coalesce(freq1.espera_promedio_min, p_espera_default_min)::integer as espera_1_min,
    null::integer as espera_2_min,
    coalesce(freq1.espera_promedio_min, p_espera_default_min)::integer as espera_total_min,
    freq1.frecuencia_promedio_min::integer as frecuencia_1_min,
    null::integer as frecuencia_2_min,
    c.dia_tipo_actual as dia_tipo_aplicado,
    c.hora_local as hora_local_aplicada,
    f1.tarifa_regular::numeric as tarifa_total,
    row_number() over (
      partition by o.pattern_id
      order by
        (
          greatest(1, round((o.origen_distancia_m + d.destino_distancia_m) / 80.0))
          + coalesce(freq1.espera_promedio_min, p_espera_default_min)
          + coalesce(f1.tarifa_regular / 150.0, 0)
          + (
            case
              when o.categoria_operativa = 'interurbana' then
                case
                  when c.viaje_lineal_m <= 3500 then 6
                  when c.viaje_lineal_m <= 7000 then 3
                  else 1
                end
              when o.categoria_operativa = 'expreso' then
                case
                  when c.viaje_lineal_m <= 3500 then 5
                  when c.viaje_lineal_m <= 7000 then 2
                  else 0
                end
              when o.categoria_operativa = 'troncal' then
                case
                  when c.viaje_lineal_m <= 2500 then 1
                  else 0
                end
              else 0
            end
          ) * greatest(0.35, o.clasificacion_confianza)
        ) asc,
        (d.stop_sequence - o.stop_sequence) desc
    ) as rn
  from contexto c
  join origin_candidates o on true
  join destination_candidates d
    on d.pattern_id = o.pattern_id
   and d.stop_sequence > o.stop_sequence
  left join latest_fares f1
    on f1.codigo_ruta_key = upper(trim(o.ruta_codigo))
  left join lateral (
    select
      sw.frecuencia_promedio_min,
      sw.espera_promedio_min
    from public.service_windows sw
    where sw.pattern_id = o.pattern_id
      and sw.activo = true
      and sw.dia_tipo = c.dia_tipo_actual
      and c.hora_local >= sw.hora_inicio
      and c.hora_local < sw.hora_fin
    order by sw.hora_inicio desc
    limit 1
  ) freq1 on true
),
direct_best as (
  select
    tipo_viaje,
    transbordos,
    score,
    pattern_id,
    ruta_1_id,
    ruta_1_nombre,
    ruta_1_codigo,
    ruta_1_operador,
    sentido_1,
    subida_1_parada_id,
    subida_1_parada_nombre,
    subida_1_distancia_m,
    bajada_1_parada_id,
    bajada_1_parada_nombre,
    ruta_2_id,
    ruta_2_nombre,
    ruta_2_codigo,
    ruta_2_operador,
    sentido_2,
    subida_2_parada_id,
    subida_2_parada_nombre,
    bajada_2_parada_id,
    bajada_2_parada_nombre,
    transbordo_distancia_m,
    destino_distancia_final_m,
    caminata_total_m,
    tiempo_caminando_total_min,
    espera_1_min,
    espera_2_min,
    espera_total_min,
    frecuencia_1_min,
    frecuencia_2_min,
    dia_tipo_aplicado,
    hora_local_aplicada,
    tarifa_total
  from direct_ranked
  where rn = 1
),
allow_transfer_search as (
  select count(*) < 3 as run_transfer
  from direct_best
),
destination_pattern_scope as (
  select distinct
    d.pattern_id
  from destination_candidates d
),
transfer_ranked as (
  select
    'transbordo'::text as tipo_viaje,
    1 as transbordos,
    (
      greatest(1, round((o.origen_distancia_m + tx.distancia_caminando_m + d.destino_distancia_m) / 80.0))
      + coalesce(freq1.espera_promedio_min, p_espera_default_min)
      + coalesce(freq2.espera_promedio_min, p_espera_default_min)
      + 4
      + coalesce(f1.tarifa_regular / 150.0, 0)
      + coalesce(f2.tarifa_regular / 150.0, 0)
      + (
        case
          when o.categoria_operativa = 'interurbana' then
            case
              when c.viaje_lineal_m <= 3500 then 6
              when c.viaje_lineal_m <= 7000 then 3
              else 1
            end
          when o.categoria_operativa = 'expreso' then
            case
              when c.viaje_lineal_m <= 3500 then 5
              when c.viaje_lineal_m <= 7000 then 2
              else 0
            end
          when o.categoria_operativa = 'troncal' then
            case
              when c.viaje_lineal_m <= 2500 then 1
              else 0
            end
          else 0
        end
      ) * greatest(0.35, o.clasificacion_confianza)
      + (
        case
          when ap2.categoria_operativa = 'interurbana' then
            case
              when c.viaje_lineal_m <= 3500 then 6
              when c.viaje_lineal_m <= 7000 then 3
              else 1
            end
          when ap2.categoria_operativa = 'expreso' then
            case
              when c.viaje_lineal_m <= 3500 then 5
              when c.viaje_lineal_m <= 7000 then 2
              else 0
            end
          when ap2.categoria_operativa = 'troncal' then
            case
              when c.viaje_lineal_m <= 2500 then 1
              else 0
            end
          else 0
        end
      ) * greatest(0.35, ap2.clasificacion_confianza)
    )::numeric as score,
    o.ruta_id as ruta_1_id,
    o.ruta_nombre as ruta_1_nombre,
    o.ruta_codigo as ruta_1_codigo,
    o.ruta_operador as ruta_1_operador,
    o.sentido as sentido_1,
    o.parada_id as subida_1_parada_id,
    coalesce(o.parada_nombre, 'Parada de buses') as subida_1_parada_nombre,
    o.origen_distancia_m as subida_1_distancia_m,
    rp1_alight.parada_id as bajada_1_parada_id,
    coalesce(p1_alight.nombre, 'Parada de buses') as bajada_1_parada_nombre,
    ap2.ruta_id as ruta_2_id,
    ap2.ruta_nombre as ruta_2_nombre,
    ap2.ruta_codigo as ruta_2_codigo,
    ap2.ruta_operador as ruta_2_operador,
    ap2.sentido as sentido_2,
    rp2_board.parada_id as subida_2_parada_id,
    coalesce(p2_board.nombre, 'Parada de buses') as subida_2_parada_nombre,
    d.parada_id as bajada_2_parada_id,
    coalesce(d.parada_nombre, 'Parada de buses') as bajada_2_parada_nombre,
    tx.distancia_caminando_m as transbordo_distancia_m,
    d.destino_distancia_m as destino_distancia_final_m,
    (o.origen_distancia_m + tx.distancia_caminando_m + d.destino_distancia_m)::integer as caminata_total_m,
    greatest(1, round((o.origen_distancia_m + tx.distancia_caminando_m + d.destino_distancia_m) / 80.0))::integer as tiempo_caminando_total_min,
    coalesce(freq1.espera_promedio_min, p_espera_default_min)::integer as espera_1_min,
    coalesce(freq2.espera_promedio_min, p_espera_default_min)::integer as espera_2_min,
    (
      coalesce(freq1.espera_promedio_min, p_espera_default_min)
      + coalesce(freq2.espera_promedio_min, p_espera_default_min)
    )::integer as espera_total_min,
    freq1.frecuencia_promedio_min::integer as frecuencia_1_min,
    freq2.frecuencia_promedio_min::integer as frecuencia_2_min,
    c.dia_tipo_actual as dia_tipo_aplicado,
    c.hora_local as hora_local_aplicada,
    case
      when f1.tarifa_regular is null and f2.tarifa_regular is null then null
      else (coalesce(f1.tarifa_regular, 0) + coalesce(f2.tarifa_regular, 0))::numeric
    end as tarifa_total,
    row_number() over (
      partition by o.pattern_id, ap2.pattern_id
      order by
        (
          greatest(1, round((o.origen_distancia_m + tx.distancia_caminando_m + d.destino_distancia_m) / 80.0))
          + coalesce(freq1.espera_promedio_min, p_espera_default_min)
          + coalesce(freq2.espera_promedio_min, p_espera_default_min)
          + 4
          + coalesce(f1.tarifa_regular / 150.0, 0)
          + coalesce(f2.tarifa_regular / 150.0, 0)
          + (
            case
              when o.categoria_operativa = 'interurbana' then
                case
                  when c.viaje_lineal_m <= 3500 then 6
                  when c.viaje_lineal_m <= 7000 then 3
                  else 1
                end
              when o.categoria_operativa = 'expreso' then
                case
                  when c.viaje_lineal_m <= 3500 then 5
                  when c.viaje_lineal_m <= 7000 then 2
                  else 0
                end
              when o.categoria_operativa = 'troncal' then
                case
                  when c.viaje_lineal_m <= 2500 then 1
                  else 0
                end
              else 0
            end
          ) * greatest(0.35, o.clasificacion_confianza)
          + (
            case
              when ap2.categoria_operativa = 'interurbana' then
                case
                  when c.viaje_lineal_m <= 3500 then 6
                  when c.viaje_lineal_m <= 7000 then 3
                  else 1
                end
              when ap2.categoria_operativa = 'expreso' then
                case
                  when c.viaje_lineal_m <= 3500 then 5
                  when c.viaje_lineal_m <= 7000 then 2
                  else 0
                end
              when ap2.categoria_operativa = 'troncal' then
                case
                  when c.viaje_lineal_m <= 2500 then 1
                  else 0
                end
              else 0
            end
          ) * greatest(0.35, ap2.clasificacion_confianza)
        ) asc,
        (rp1_alight.stop_sequence - o.stop_sequence) desc,
        (d.stop_sequence - rp2_board.stop_sequence) desc
    ) as rn
  from contexto c
  join allow_transfer_search ats
    on ats.run_transfer
  join origin_candidates o on true
  join public.route_pattern_stops rp1_alight
    on rp1_alight.pattern_id = o.pattern_id
   and rp1_alight.es_bajada = true
   and rp1_alight.stop_sequence > o.stop_sequence
  join public.paradas p1_alight
    on p1_alight.id = rp1_alight.parada_id
   and p1_alight.activo = true
  join transbordos_expandido tx
    on tx.parada_origen_id = rp1_alight.parada_id
  join public.route_pattern_stops rp2_board
    on rp2_board.parada_id = tx.parada_destino_id
   and rp2_board.es_subida = true
  join active_patterns ap2
    on ap2.pattern_id = rp2_board.pattern_id
   and ap2.ruta_id <> o.ruta_id
  join public.paradas p2_board
    on p2_board.id = rp2_board.parada_id
   and p2_board.activo = true
  join destination_pattern_scope dps
    on dps.pattern_id = ap2.pattern_id
  join destination_candidates d
    on d.pattern_id = ap2.pattern_id
   and d.stop_sequence > rp2_board.stop_sequence
  left join latest_fares f1
    on f1.codigo_ruta_key = upper(trim(o.ruta_codigo))
  left join latest_fares f2
    on f2.codigo_ruta_key = upper(trim(ap2.ruta_codigo))
  left join lateral (
    select
      sw.frecuencia_promedio_min,
      sw.espera_promedio_min
    from public.service_windows sw
    where sw.pattern_id = o.pattern_id
      and sw.activo = true
      and sw.dia_tipo = c.dia_tipo_actual
      and c.hora_local >= sw.hora_inicio
      and c.hora_local < sw.hora_fin
    order by sw.hora_inicio desc
    limit 1
  ) freq1 on true
  left join lateral (
    select
      sw.frecuencia_promedio_min,
      sw.espera_promedio_min
    from public.service_windows sw
    where sw.pattern_id = ap2.pattern_id
      and sw.activo = true
      and sw.dia_tipo = c.dia_tipo_actual
      and c.hora_local >= sw.hora_inicio
      and c.hora_local < sw.hora_fin
    order by sw.hora_inicio desc
    limit 1
  ) freq2 on true
),
plans as (
  select
    tipo_viaje,
    transbordos,
    score,
    ruta_1_id,
    ruta_1_nombre,
    ruta_1_codigo,
    ruta_1_operador,
    sentido_1,
    subida_1_parada_id,
    subida_1_parada_nombre,
    subida_1_distancia_m,
    bajada_1_parada_id,
    bajada_1_parada_nombre,
    ruta_2_id,
    ruta_2_nombre,
    ruta_2_codigo,
    ruta_2_operador,
    sentido_2,
    subida_2_parada_id,
    subida_2_parada_nombre,
    bajada_2_parada_id,
    bajada_2_parada_nombre,
    transbordo_distancia_m,
    destino_distancia_final_m,
    caminata_total_m,
    tiempo_caminando_total_min,
    espera_1_min,
    espera_2_min,
    espera_total_min,
    frecuencia_1_min,
    frecuencia_2_min,
    dia_tipo_aplicado,
    hora_local_aplicada,
    tarifa_total
  from direct_best

  union all

  select
    tipo_viaje,
    transbordos,
    score,
    ruta_1_id,
    ruta_1_nombre,
    ruta_1_codigo,
    ruta_1_operador,
    sentido_1,
    subida_1_parada_id,
    subida_1_parada_nombre,
    subida_1_distancia_m,
    bajada_1_parada_id,
    bajada_1_parada_nombre,
    ruta_2_id,
    ruta_2_nombre,
    ruta_2_codigo,
    ruta_2_operador,
    sentido_2,
    subida_2_parada_id,
    subida_2_parada_nombre,
    bajada_2_parada_id,
    bajada_2_parada_nombre,
    transbordo_distancia_m,
    destino_distancia_final_m,
    caminata_total_m,
    tiempo_caminando_total_min,
    espera_1_min,
    espera_2_min,
    espera_total_min,
    frecuencia_1_min,
    frecuencia_2_min,
    dia_tipo_aplicado,
    hora_local_aplicada,
    tarifa_total
  from transfer_ranked
  where rn = 1
)
select *
from plans
order by
  score asc,
  transbordos asc,
  espera_total_min asc,
  caminata_total_m asc
limit greatest(1, least(p_max_resultados, 50));
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
  'Version 2 del buscador de viajes con 0 o 1 transbordo. Lee patrones GTFS-like y penaliza suavemente rutas interurbanas/expreso en viajes cortos.';
