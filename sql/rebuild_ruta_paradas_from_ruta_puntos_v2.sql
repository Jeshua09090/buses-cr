set search_path = public, extensions;

create extension if not exists postgis with schema extensions;

create index if not exists ruta_puntos_ruta_segmento_orden_idx
  on public.ruta_puntos (ruta_id, segmento_id, orden);

create index if not exists ruta_puntos_geo_gix
  on public.ruta_puntos
  using gist ((st_setsrid(st_makepoint(lng, lat), 4326)::geography));

create or replace function public.reconstruir_ruta_paradas_desde_puntos_v2(
  p_max_snap_m integer default 25,
  p_min_stops_per_route integer default 4,
  p_progress_bucket_m integer default 40,
  p_reemplazar boolean default true,
  p_generar_vuelta boolean default true
)
returns table (
  ruta_id bigint,
  sentido text,
  inserted_count bigint
)
language plpgsql
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  if p_max_snap_m < 5 or p_max_snap_m > 250 then
    raise exception 'p_max_snap_m fuera de rango (%). Usa un valor entre 5 y 250 metros.', p_max_snap_m;
  end if;

  if p_min_stops_per_route < 1 then
    raise exception 'p_min_stops_per_route debe ser >= 1';
  end if;

  if p_progress_bucket_m < 5 or p_progress_bucket_m > 300 then
    raise exception 'p_progress_bucket_m fuera de rango (%). Usa un valor entre 5 y 300 metros.', p_progress_bucket_m;
  end if;

  if p_reemplazar then
    delete from public.ruta_paradas;
  end if;

  return query
  with route_shapes as (
    select
      rp.ruta_id,
      st_makeline(
        st_setsrid(st_makepoint(rp.lng, rp.lat), 4326)
        order by coalesce(rp.segmento_id, 0), coalesce(rp.orden, 0)
      ) as geom
    from public.ruta_puntos rp
    where rp.lat is not null
      and rp.lng is not null
    group by rp.ruta_id
    having count(*) >= 2
  ),
  route_metrics as (
    select
      rs.ruta_id,
      st_removerepeatedpoints(rs.geom) as geom,
      st_length(rs.geom::geography) as line_length_m
    from route_shapes rs
    where st_npoints(rs.geom) >= 2
  ),
  candidate_stops as (
    select
      rm.ruta_id,
      p.id as parada_id,
      p.nombre,
      rm.line_length_m,
      st_distance(p.geo, rm.geom::geography)::integer as snap_distance_m,
      st_linelocatepoint(rm.geom, p.geo::geometry) as line_fraction,
      (st_linelocatepoint(rm.geom, p.geo::geometry) * rm.line_length_m) as progress_m
    from route_metrics rm
    join public.paradas p
      on p.activo = true
     and st_dwithin(p.geo, rm.geom::geography, p_max_snap_m)
  ),
  best_per_stop as (
    select
      cs.ruta_id,
      cs.parada_id,
      cs.nombre,
      cs.line_length_m,
      cs.snap_distance_m,
      cs.line_fraction,
      cs.progress_m,
      floor(cs.progress_m / p_progress_bucket_m)::integer as progress_bucket,
      row_number() over (
        partition by cs.ruta_id, cs.parada_id
        order by
          cs.snap_distance_m asc,
          cs.line_fraction asc,
          cs.parada_id asc
      ) as rn_stop
    from candidate_stops cs
    where cs.line_fraction between 0 and 1
  ),
  selected_stop_matches as (
    select
      bps.ruta_id,
      bps.parada_id,
      bps.nombre,
      bps.line_length_m,
      bps.snap_distance_m,
      bps.line_fraction,
      bps.progress_m,
      bps.progress_bucket
    from best_per_stop bps
    where bps.rn_stop = 1
  ),
  bucket_deduped as (
    select
      ssm.ruta_id,
      ssm.parada_id,
      ssm.nombre,
      ssm.line_length_m,
      ssm.snap_distance_m,
      ssm.line_fraction,
      ssm.progress_m,
      row_number() over (
        partition by ssm.ruta_id, ssm.progress_bucket
        order by
          ssm.snap_distance_m asc,
          ssm.line_fraction asc,
          ssm.parada_id asc
      ) as rn_bucket
    from selected_stop_matches ssm
  ),
  filtered_stops as (
    select
      bd.ruta_id,
      bd.parada_id,
      bd.nombre,
      bd.line_length_m,
      bd.snap_distance_m,
      bd.line_fraction,
      bd.progress_m
    from bucket_deduped bd
    where bd.rn_bucket = 1
  ),
  ordered_stops as (
    select
      fs.ruta_id,
      fs.parada_id,
      fs.nombre,
      fs.line_length_m,
      fs.snap_distance_m,
      fs.line_fraction,
      fs.progress_m,
      count(*) over (partition by fs.ruta_id) as total_en_ruta,
      row_number() over (
        partition by fs.ruta_id
        order by fs.line_fraction asc, fs.snap_distance_m asc, fs.parada_id asc
      ) as orden_ida
    from filtered_stops fs
  ),
  usable_stops as (
    select
      os.ruta_id,
      os.parada_id,
      os.nombre,
      os.line_length_m,
      os.snap_distance_m,
      os.line_fraction,
      os.progress_m,
      os.orden_ida,
      row_number() over (
        partition by os.ruta_id
        order by os.orden_ida desc, os.parada_id asc
      ) as orden_vuelta
    from ordered_stops os
    where os.total_en_ruta >= p_min_stops_per_route
  ),
  insert_ida as (
    insert into public.ruta_paradas as rp (
      ruta_id,
      parada_id,
      sentido,
      orden,
      es_subida,
      es_bajada,
      distancia_acumulada_m,
      tiempo_estimado_desde_inicio_min,
      created_at,
      updated_at
    )
    select
      us.ruta_id,
      us.parada_id,
      'ida'::text,
      us.orden_ida,
      true,
      true,
      round(us.progress_m)::integer,
      null,
      timezone('utc', now()),
      timezone('utc', now())
    from usable_stops us
    on conflict (ruta_id, sentido, orden)
    do update set
      parada_id = excluded.parada_id,
      es_subida = excluded.es_subida,
      es_bajada = excluded.es_bajada,
      distancia_acumulada_m = excluded.distancia_acumulada_m,
      tiempo_estimado_desde_inicio_min = excluded.tiempo_estimado_desde_inicio_min,
      updated_at = timezone('utc', now())
    returning rp.ruta_id, rp.sentido
  ),
  insert_vuelta as (
    insert into public.ruta_paradas as rp (
      ruta_id,
      parada_id,
      sentido,
      orden,
      es_subida,
      es_bajada,
      distancia_acumulada_m,
      tiempo_estimado_desde_inicio_min,
      created_at,
      updated_at
    )
    select
      us.ruta_id,
      us.parada_id,
      'vuelta'::text,
      us.orden_vuelta,
      true,
      true,
      round(greatest(0, us.line_length_m - us.progress_m))::integer,
      null,
      timezone('utc', now()),
      timezone('utc', now())
    from usable_stops us
    where p_generar_vuelta
    on conflict (ruta_id, sentido, orden)
    do update set
      parada_id = excluded.parada_id,
      es_subida = excluded.es_subida,
      es_bajada = excluded.es_bajada,
      distancia_acumulada_m = excluded.distancia_acumulada_m,
      tiempo_estimado_desde_inicio_min = excluded.tiempo_estimado_desde_inicio_min,
      updated_at = timezone('utc', now())
    returning rp.ruta_id, rp.sentido
  )
  select
    ins.ruta_id,
    ins.sentido,
    count(*)::bigint as inserted_count
  from (
    select * from insert_ida
    union all
    select * from insert_vuelta
  ) ins
  group by ins.ruta_id, ins.sentido
  order by ins.ruta_id, ins.sentido;
end;
$$;

comment on function public.reconstruir_ruta_paradas_desde_puntos_v2(integer, integer, integer, boolean, boolean) is
  'Reconstruye ruta_paradas con una heuristica mas estricta: menor radio, orden sobre la linea real y deduplicacion por progreso en la ruta.';

-- Uso sugerido:
-- select * from public.reconstruir_ruta_paradas_desde_puntos_v2();
-- select * from public.reconstruir_ruta_paradas_desde_puntos_v2(20, 4, 35, true, true);
