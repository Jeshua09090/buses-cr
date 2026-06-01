set search_path = public, extensions;

create extension if not exists postgis with schema extensions;

-- Opcional pero muy recomendado para acelerar la reconstruccion.
create index if not exists ruta_puntos_ruta_segmento_orden_idx
  on public.ruta_puntos (ruta_id, segmento_id, orden);

create index if not exists ruta_puntos_geo_gix
  on public.ruta_puntos
  using gist ((st_setsrid(st_makepoint(lng, lat), 4326)::geography));

create or replace function public.reconstruir_ruta_paradas_desde_puntos(
  p_max_snap_m integer default 45,
  p_min_stops_per_route integer default 2,
  p_reemplazar boolean default true
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
  candidate_route_stops as (
    select
      rs.ruta_id,
      p.id as parada_id,
      p.geo as parada_geo
    from route_shapes rs
    join public.paradas p
      on p.activo = true
     and st_dwithin(p.geo, rs.geom::geography, p_max_snap_m)
  ),
  closest_route_points as (
    select
      crs.ruta_id,
      crs.parada_id,
      coalesce(rp.segmento_id, 0) as segmento_id,
      coalesce(rp.orden, 0) as punto_orden,
      st_distance(
        crs.parada_geo,
        st_setsrid(st_makepoint(rp.lng, rp.lat), 4326)::geography
      )::integer as distancia_m,
      row_number() over (
        partition by crs.ruta_id, crs.parada_id
        order by
          st_distance(
            crs.parada_geo,
            st_setsrid(st_makepoint(rp.lng, rp.lat), 4326)::geography
          ) asc,
          coalesce(rp.segmento_id, 0) asc,
          coalesce(rp.orden, 0) asc,
          rp.lat asc,
          rp.lng asc
      ) as rn
    from candidate_route_stops crs
    join public.ruta_puntos rp
      on rp.ruta_id = crs.ruta_id
    where rp.lat is not null
      and rp.lng is not null
      and st_dwithin(
        crs.parada_geo,
        st_setsrid(st_makepoint(rp.lng, rp.lat), 4326)::geography,
        p_max_snap_m
      )
  ),
  selected_stops as (
    select
      crp.ruta_id,
      crp.parada_id,
      crp.segmento_id,
      crp.punto_orden,
      crp.distancia_m
    from closest_route_points crp
    where crp.rn = 1
  ),
  ordered_stops as (
    select
      ss.ruta_id,
      ss.parada_id,
      ss.distancia_m,
      count(*) over (partition by ss.ruta_id) as total_en_ruta,
      row_number() over (
        partition by ss.ruta_id
        order by ss.segmento_id asc, ss.punto_orden asc, ss.distancia_m asc, ss.parada_id asc
      ) as orden_ida
    from selected_stops ss
  ),
  filtered_stops as (
    select
      os.ruta_id,
      os.parada_id,
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
      fs.ruta_id,
      fs.parada_id,
      'ida'::text,
      fs.orden_ida,
      true,
      true,
      null,
      null,
      timezone('utc', now()),
      timezone('utc', now())
    from filtered_stops fs
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
      fs.ruta_id,
      fs.parada_id,
      'vuelta'::text,
      fs.orden_vuelta,
      true,
      true,
      null,
      null,
      timezone('utc', now()),
      timezone('utc', now())
    from filtered_stops fs
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

comment on function public.reconstruir_ruta_paradas_desde_puntos(integer, integer, boolean) is
  'Reconstruye ruta_paradas haciendo snap de paradas activas sobre la geometria de ruta_puntos. Genera ida y vuelta como aproximacion inicial.';

-- Uso sugerido:
-- select * from public.reconstruir_ruta_paradas_desde_puntos();
-- select * from public.reconstruir_ruta_paradas_desde_puntos(50, 3, true);
