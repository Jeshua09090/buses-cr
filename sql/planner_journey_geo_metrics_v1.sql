set search_path = public, extensions;

create or replace function public.planner_route_stop_shape_distance_m(
  p_ruta_id bigint,
  p_parada_id bigint
)
returns integer
language sql
stable
set search_path = public, extensions
as $$
with route_shape as (
  select
    case
      when r.geometry is null then null::geography
      else st_setsrid(st_geomfromgeojson(r.geometry::text), 4326)::geography
    end as geo
  from public.rutas r
  where r.id = p_ruta_id
),
stop_point as (
  select p.geo
  from public.paradas p
  where p.id = p_parada_id
)
select
  case
    when route_shape.geo is null or stop_point.geo is null then null::integer
    else st_distance(stop_point.geo, route_shape.geo)::integer
  end
from route_shape
cross join stop_point;
$$;

comment on function public.planner_route_stop_shape_distance_m(bigint, bigint) is
  'Calcula distancia PostGIS entre una parada runtime y el shape GeoJSON de una ruta.';

create or replace function public.planner_calculate_journey_geo_metrics(
  p_origin_lat double precision,
  p_origin_lng double precision,
  p_destination_lat double precision,
  p_destination_lng double precision,
  p_route_1_id bigint,
  p_board_1_stop_id bigint,
  p_alight_1_stop_id bigint,
  p_route_2_id bigint default null,
  p_board_2_stop_id bigint default null,
  p_alight_2_stop_id bigint default null,
  p_transfer_type text default null,
  p_transfer_confidence numeric default null,
  p_transfer_distance_m integer default null
)
returns table (
  straight_line_m integer,
  origin_walk_m integer,
  transfer_walk_m integer,
  final_walk_m integer,
  total_walk_m integer,
  first_leg_destination_distance_m integer,
  final_stop_destination_distance_m integer,
  first_leg_progress_m integer,
  first_leg_progress_ratio numeric,
  final_stop_progress_m integer,
  final_stop_progress_ratio numeric,
  first_leg_backtrack_m integer,
  final_stop_backtrack_m integer,
  transfer_gain_m integer,
  transfer_gain_ratio numeric,
  total_walk_ratio numeric,
  transfer_walk_ratio numeric,
  board_shape_distance_m integer,
  first_alight_shape_distance_m integer,
  second_board_shape_distance_m integer,
  final_alight_shape_distance_m integer,
  max_shape_stop_distance_m integer,
  route_destination_alignment numeric,
  transfer_quality_label text,
  transfer_quality_score numeric,
  geo_confidence_score numeric,
  score_adjustment numeric,
  quality_flags text[]
)
language sql
stable
set search_path = public, extensions
as $$
with input_geos as (
  select
    st_setsrid(st_makepoint(p_origin_lng, p_origin_lat), 4326)::geography as origin_geo,
    st_setsrid(st_makepoint(p_destination_lng, p_destination_lat), 4326)::geography as destination_geo
),
stop_geos as (
  select
    b1.geo as board_1_geo,
    a1.geo as alight_1_geo,
    b2.geo as board_2_geo,
    a2.geo as alight_2_geo,
    coalesce(a2.geo, a1.geo) as final_alight_geo
  from (select 1) seed
  left join public.paradas b1
    on b1.id = p_board_1_stop_id
  left join public.paradas a1
    on a1.id = p_alight_1_stop_id
  left join public.paradas b2
    on b2.id = p_board_2_stop_id
  left join public.paradas a2
    on a2.id = p_alight_2_stop_id
),
shape_distances as (
  select
    public.planner_route_stop_shape_distance_m(p_route_1_id, p_board_1_stop_id) as board_shape_distance_m,
    public.planner_route_stop_shape_distance_m(p_route_1_id, p_alight_1_stop_id) as first_alight_shape_distance_m,
    case
      when p_route_2_id is null or p_board_2_stop_id is null then null::integer
      else public.planner_route_stop_shape_distance_m(p_route_2_id, p_board_2_stop_id)
    end as second_board_shape_distance_m,
    case
      when p_route_2_id is null or p_alight_2_stop_id is null then null::integer
      else public.planner_route_stop_shape_distance_m(p_route_2_id, p_alight_2_stop_id)
    end as final_alight_shape_distance_m
),
base as (
  select
    st_distance(i.origin_geo, i.destination_geo)::integer as straight_line_m,
    case
      when s.board_1_geo is null then null::integer
      else st_distance(i.origin_geo, s.board_1_geo)::integer
    end as origin_walk_m,
    case
      when p_route_2_id is null then 0
      when p_transfer_distance_m is not null then p_transfer_distance_m
      when s.alight_1_geo is not null and s.board_2_geo is not null then st_distance(s.alight_1_geo, s.board_2_geo)::integer
      else null::integer
    end as transfer_walk_m,
    case
      when s.final_alight_geo is null then null::integer
      else st_distance(s.final_alight_geo, i.destination_geo)::integer
    end as final_walk_m,
    case
      when s.alight_1_geo is null then null::integer
      else st_distance(s.alight_1_geo, i.destination_geo)::integer
    end as first_leg_destination_distance_m,
    case
      when s.final_alight_geo is null then null::integer
      else st_distance(s.final_alight_geo, i.destination_geo)::integer
    end as final_stop_destination_distance_m,
    sd.board_shape_distance_m,
    sd.first_alight_shape_distance_m,
    sd.second_board_shape_distance_m,
    sd.final_alight_shape_distance_m
  from input_geos i
  cross join stop_geos s
  cross join shape_distances sd
),
measured as (
  select
    b.*,
    case
      when b.origin_walk_m is null or b.transfer_walk_m is null or b.final_walk_m is null then null::integer
      else (b.origin_walk_m + b.transfer_walk_m + b.final_walk_m)::integer
    end as total_walk_m,
    case
      when b.first_leg_destination_distance_m is null then null::integer
      else (b.straight_line_m - b.first_leg_destination_distance_m)::integer
    end as first_leg_progress_m,
    case
      when b.final_stop_destination_distance_m is null then null::integer
      else (b.straight_line_m - b.final_stop_destination_distance_m)::integer
    end as final_stop_progress_m,
    case
      when b.first_leg_destination_distance_m is null then 0
      else greatest(0, b.first_leg_destination_distance_m - b.straight_line_m)::integer
    end as first_leg_backtrack_m,
    case
      when b.final_stop_destination_distance_m is null then 0
      else greatest(0, b.final_stop_destination_distance_m - b.straight_line_m)::integer
    end as final_stop_backtrack_m,
    case
      when p_route_2_id is null
        or b.first_leg_destination_distance_m is null
        or b.final_stop_destination_distance_m is null
        then null::integer
      else (b.first_leg_destination_distance_m - b.final_stop_destination_distance_m)::integer
    end as transfer_gain_m,
    case
      when b.board_shape_distance_m is null
        and b.first_alight_shape_distance_m is null
        and b.second_board_shape_distance_m is null
        and b.final_alight_shape_distance_m is null
        then null::integer
      else greatest(
        coalesce(b.board_shape_distance_m, 0),
        coalesce(b.first_alight_shape_distance_m, 0),
        coalesce(b.second_board_shape_distance_m, 0),
        coalesce(b.final_alight_shape_distance_m, 0)
      )::integer
    end as max_shape_stop_distance_m
  from base b
),
ratios as (
  select
    m.*,
    case
      when m.straight_line_m <= 0 or m.first_leg_progress_m is null then null::numeric
      else round((m.first_leg_progress_m::numeric / m.straight_line_m::numeric), 4)
    end as first_leg_progress_ratio,
    case
      when m.straight_line_m <= 0 or m.final_stop_progress_m is null then null::numeric
      else round((m.final_stop_progress_m::numeric / m.straight_line_m::numeric), 4)
    end as final_stop_progress_ratio,
    case
      when m.straight_line_m <= 0 or m.transfer_gain_m is null then null::numeric
      else round((m.transfer_gain_m::numeric / m.straight_line_m::numeric), 4)
    end as transfer_gain_ratio,
    case
      when m.straight_line_m <= 0 or m.total_walk_m is null then null::numeric
      else round((m.total_walk_m::numeric / m.straight_line_m::numeric), 4)
    end as total_walk_ratio,
    case
      when m.straight_line_m <= 0 or m.transfer_walk_m is null then null::numeric
      else round((m.transfer_walk_m::numeric / m.straight_line_m::numeric), 4)
    end as transfer_walk_ratio
  from measured m
),
quality as (
  select
    r.*,
    case
      when p_route_2_id is null then 'direct'
      when p_transfer_type = 'same_macro' then 'same_macro'
      when p_transfer_type = 'hub_walk' then 'hub_walk'
      when p_transfer_type = 'nearby_walk' then 'nearby_walk'
      when p_transfer_type is not null then p_transfer_type
      else 'walk'
    end as transfer_quality_label,
    case
      when p_route_2_id is null then 1.0::numeric
      else least(
        1.0,
        greatest(
          0.0,
          (
            case
              when p_transfer_type = 'same_macro' then 0.92
              when p_transfer_type = 'hub_walk' then 0.82
              when p_transfer_type = 'nearby_walk' then 0.64
              when p_transfer_type = 'manual' then 0.76
              else 0.52
            end
            + coalesce(p_transfer_confidence, 0.55) * 0.28
            + greatest(0.0, 1.0 - (coalesce(r.transfer_walk_m, 250)::numeric / 500.0)) * 0.20
          )
        )
      )::numeric(5, 4)
    end as transfer_quality_score
  from ratios r
),
penalty_parts as (
  select
    q.*,
    (
      case
        when q.max_shape_stop_distance_m is null then 0
        when q.max_shape_stop_distance_m > 180 then 260
        when q.max_shape_stop_distance_m > 120 then 150
        when q.max_shape_stop_distance_m > 80 then 70
        else 0
      end
    )::numeric as shape_penalty_m,
    (
      case
        when q.final_stop_progress_ratio is null then 0
        when q.final_stop_progress_ratio < 0.25 then 340
        when q.final_stop_progress_ratio < 0.45 then 180
        when q.final_stop_progress_ratio < 0.60 then 80
        else 0
      end
    )::numeric as final_progress_penalty_m,
    (
      case
        when q.first_leg_backtrack_m >= 450 then 220
        when q.first_leg_backtrack_m >= 250 then 120
        else 0
      end
      + case
        when q.final_stop_backtrack_m >= 300 then 160
        when q.final_stop_backtrack_m >= 160 then 80
        else 0
      end
    )::numeric as backtrack_penalty_m,
    (
      case
        when p_route_2_id is null then 0
        when q.transfer_gain_m is null then 80
        when q.transfer_gain_m <= greatest(140, round(q.straight_line_m::numeric * 0.10)::integer) then 260
        when q.transfer_gain_m <= greatest(240, round(q.straight_line_m::numeric * 0.18)::integer) then 130
        else 0
      end
    )::numeric as transfer_value_penalty_m,
    (
      case
        when p_route_2_id is null then 0
        else round((1 - coalesce(q.transfer_quality_score, 0.55)) * 180)
      end
    )::numeric as transfer_quality_penalty_m,
    (
      case
        when q.total_walk_ratio is null then 0
        when q.total_walk_ratio > 0.55 and coalesce(q.total_walk_m, 0) >= 650 then 160
        when q.total_walk_ratio > 0.42 and coalesce(q.total_walk_m, 0) >= 550 then 80
        else 0
      end
    )::numeric as walk_ratio_penalty_m,
    (
      case
        when p_route_2_id is null
          and q.final_stop_progress_ratio >= 0.78
          and coalesce(q.final_walk_m, 99999) <= 420
          then 80
        else 0
      end
    )::numeric as direct_alignment_bonus_m
  from quality q
),
scored as (
  select
    p.*,
    least(
      1.0,
      greatest(
        0.0,
        1.0
        - case when p.shape_penalty_m >= 150 then 0.16 when p.shape_penalty_m > 0 then 0.08 else 0 end
        - case when p.final_progress_penalty_m >= 180 then 0.18 when p.final_progress_penalty_m > 0 then 0.08 else 0 end
        - case when p.backtrack_penalty_m >= 160 then 0.14 when p.backtrack_penalty_m > 0 then 0.07 else 0 end
        - case when p.transfer_value_penalty_m >= 260 then 0.18 when p.transfer_value_penalty_m > 0 then 0.09 else 0 end
        - case when coalesce(p.transfer_quality_score, 1) < 0.60 then 0.10 else 0 end
        - case when p.walk_ratio_penalty_m > 0 then 0.07 else 0 end
      )
    )::numeric(5, 4) as geo_confidence_score,
    (
      p.shape_penalty_m
      + p.final_progress_penalty_m
      + p.backtrack_penalty_m
      + p.transfer_value_penalty_m
      + p.transfer_quality_penalty_m
      + p.walk_ratio_penalty_m
      - p.direct_alignment_bonus_m
    )::numeric as score_adjustment,
    array_remove(array[
      case when p.max_shape_stop_distance_m > 120 then 'shape_stop_distance_high' end,
      case when p.final_stop_progress_ratio < 0.45 then 'final_drop_progress_low' end,
      case when p.first_leg_backtrack_m >= 250 then 'first_leg_backtrack_high' end,
      case when p.final_stop_backtrack_m >= 160 then 'final_stop_backtrack_high' end,
      case
        when p_route_2_id is not null
          and p.transfer_gain_m <= greatest(140, round(p.straight_line_m::numeric * 0.10)::integer)
          then 'transfer_gain_tiny'
      end,
      case
        when p_route_2_id is not null
          and coalesce(p.transfer_quality_score, 1) < 0.60
          then 'transfer_quality_low'
      end,
      case when p.total_walk_ratio > 0.42 and coalesce(p.total_walk_m, 0) >= 550 then 'walk_ratio_high' end
    ]::text[], null) as quality_flags
  from penalty_parts p
)
select
  s.straight_line_m,
  s.origin_walk_m,
  s.transfer_walk_m,
  s.final_walk_m,
  s.total_walk_m,
  s.first_leg_destination_distance_m,
  s.final_stop_destination_distance_m,
  s.first_leg_progress_m,
  s.first_leg_progress_ratio,
  s.final_stop_progress_m,
  s.final_stop_progress_ratio,
  s.first_leg_backtrack_m,
  s.final_stop_backtrack_m,
  s.transfer_gain_m,
  s.transfer_gain_ratio,
  s.total_walk_ratio,
  s.transfer_walk_ratio,
  s.board_shape_distance_m,
  s.first_alight_shape_distance_m,
  s.second_board_shape_distance_m,
  s.final_alight_shape_distance_m,
  s.max_shape_stop_distance_m,
  s.final_stop_progress_ratio as route_destination_alignment,
  s.transfer_quality_label,
  s.transfer_quality_score,
  s.geo_confidence_score,
  s.score_adjustment,
  s.quality_flags
from scored s;
$$;

comment on function public.planner_calculate_journey_geo_metrics(
  double precision,
  double precision,
  double precision,
  double precision,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  text,
  numeric,
  integer
) is
  'Capa PostGIS de metricas objetivas por journey/candidato: caminata, progreso, backtracking, distancia al shape, calidad de transbordo, confianza geografica y ajuste de score.';

drop function if exists public.buscar_viajes_0_1_transbordo_v3(
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
);

create or replace function public.buscar_viajes_0_1_transbordo_v3(
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
  tarifa_total numeric,
  base_score numeric,
  geo_score_adjustment numeric,
  geo_confidence_score numeric,
  quality_flags text[],
  straight_line_m integer,
  origin_walk_m integer,
  transfer_walk_m integer,
  final_walk_m integer,
  total_walk_m integer,
  first_leg_destination_distance_m integer,
  final_stop_destination_distance_m integer,
  first_leg_progress_m integer,
  first_leg_progress_ratio numeric,
  final_stop_progress_m integer,
  final_stop_progress_ratio numeric,
  first_leg_backtrack_m integer,
  final_stop_backtrack_m integer,
  transfer_gain_m integer,
  transfer_gain_ratio numeric,
  total_walk_ratio numeric,
  transfer_walk_ratio numeric,
  board_shape_distance_m integer,
  first_alight_shape_distance_m integer,
  second_board_shape_distance_m integer,
  final_alight_shape_distance_m integer,
  max_shape_stop_distance_m integer,
  route_destination_alignment numeric,
  transfer_quality_label text,
  transfer_quality_score numeric
)
language sql
stable
set search_path = public, extensions
as $$
with base_results as (
  select *
  from public.buscar_viajes_0_1_transbordo_v2(
    p_origen_lat,
    p_origen_lng,
    p_destino_lat,
    p_destino_lng,
    p_radio_origen_m,
    p_radio_destino_m,
    p_max_caminar_transbordo_m,
    least(50, greatest(1, p_max_resultados) * 4),
    p_sentido,
    p_fecha_hora,
    p_es_feriado,
    p_espera_default_min
  )
),
measured as (
  select
    b.*,
    b.score as base_score,
    gm.score_adjustment as geo_score_adjustment,
    gm.geo_confidence_score,
    gm.quality_flags,
    gm.straight_line_m,
    gm.origin_walk_m,
    gm.transfer_walk_m,
    gm.final_walk_m,
    gm.total_walk_m,
    gm.first_leg_destination_distance_m,
    gm.final_stop_destination_distance_m,
    gm.first_leg_progress_m,
    gm.first_leg_progress_ratio,
    gm.final_stop_progress_m,
    gm.final_stop_progress_ratio,
    gm.first_leg_backtrack_m,
    gm.final_stop_backtrack_m,
    gm.transfer_gain_m,
    gm.transfer_gain_ratio,
    gm.total_walk_ratio,
    gm.transfer_walk_ratio,
    gm.board_shape_distance_m,
    gm.first_alight_shape_distance_m,
    gm.second_board_shape_distance_m,
    gm.final_alight_shape_distance_m,
    gm.max_shape_stop_distance_m,
    gm.route_destination_alignment,
    gm.transfer_quality_label,
    gm.transfer_quality_score
  from base_results b
  left join lateral public.planner_calculate_journey_geo_metrics(
    p_origen_lat,
    p_origen_lng,
    p_destino_lat,
    p_destino_lng,
    b.ruta_1_id,
    b.subida_1_parada_id,
    b.bajada_1_parada_id,
    b.ruta_2_id,
    b.subida_2_parada_id,
    b.bajada_2_parada_id,
    null,
    null,
    b.transbordo_distancia_m
  ) gm on true
)
select
  m.tipo_viaje,
  m.transbordos,
  (m.base_score + coalesce(m.geo_score_adjustment, 0))::numeric as score,
  m.ruta_1_id,
  m.ruta_1_nombre,
  m.ruta_1_codigo,
  m.ruta_1_operador,
  m.sentido_1,
  m.subida_1_parada_id,
  m.subida_1_parada_nombre,
  m.subida_1_distancia_m,
  m.bajada_1_parada_id,
  m.bajada_1_parada_nombre,
  m.ruta_2_id,
  m.ruta_2_nombre,
  m.ruta_2_codigo,
  m.ruta_2_operador,
  m.sentido_2,
  m.subida_2_parada_id,
  m.subida_2_parada_nombre,
  m.bajada_2_parada_id,
  m.bajada_2_parada_nombre,
  m.transbordo_distancia_m,
  m.destino_distancia_final_m,
  m.caminata_total_m,
  m.tiempo_caminando_total_min,
  m.espera_1_min,
  m.espera_2_min,
  m.espera_total_min,
  m.frecuencia_1_min,
  m.frecuencia_2_min,
  m.dia_tipo_aplicado,
  m.hora_local_aplicada,
  m.tarifa_total,
  m.base_score,
  m.geo_score_adjustment,
  m.geo_confidence_score,
  m.quality_flags,
  m.straight_line_m,
  m.origin_walk_m,
  m.transfer_walk_m,
  m.final_walk_m,
  m.total_walk_m,
  m.first_leg_destination_distance_m,
  m.final_stop_destination_distance_m,
  m.first_leg_progress_m,
  m.first_leg_progress_ratio,
  m.final_stop_progress_m,
  m.final_stop_progress_ratio,
  m.first_leg_backtrack_m,
  m.final_stop_backtrack_m,
  m.transfer_gain_m,
  m.transfer_gain_ratio,
  m.total_walk_ratio,
  m.transfer_walk_ratio,
  m.board_shape_distance_m,
  m.first_alight_shape_distance_m,
  m.second_board_shape_distance_m,
  m.final_alight_shape_distance_m,
  m.max_shape_stop_distance_m,
  m.route_destination_alignment,
  m.transfer_quality_label,
  m.transfer_quality_score
from measured m
order by
  (m.base_score + coalesce(m.geo_score_adjustment, 0)) asc,
  m.transbordos asc,
  coalesce(m.geo_confidence_score, 0) desc,
  m.caminata_total_m asc
limit greatest(1, least(p_max_resultados, 50));
$$;

grant execute on function public.planner_route_stop_shape_distance_m(bigint, bigint)
to anon, authenticated;

grant execute on function public.planner_calculate_journey_geo_metrics(
  double precision,
  double precision,
  double precision,
  double precision,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  text,
  numeric,
  integer
) to anon, authenticated;

grant execute on function public.buscar_viajes_0_1_transbordo_v3(
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

comment on function public.buscar_viajes_0_1_transbordo_v3(
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
  'Planner moderno v3: reordena resultados de v2 con metricas PostGIS objetivas por journey/candidato y expone el debug geografico al cliente.';
