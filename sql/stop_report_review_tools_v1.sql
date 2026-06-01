set search_path = public, extensions;

create or replace function public.sugerir_rutas_para_stop_report(
  p_report_id bigint,
  p_radio_trazado_m integer default 300,
  p_radio_parada_m integer default 220,
  p_limit integer default 12
)
returns table (
  ruta_id integer,
  codigo_ctp text,
  nombre_ruta text,
  operador text,
  distancia_trazado_m integer,
  parada_cercana_id integer,
  parada_cercana_nombre text,
  parada_cercana_sentido text,
  distancia_parada_m integer,
  score numeric
)
language sql
stable
set search_path = public, extensions
as $$
with report as (
  select
    sr.id,
    sr.latitude as lat,
    sr.longitude as lng,
    upper(trim(coalesce(sr.reported_route_code, ''))) as reported_code,
    trim(regexp_replace(upper(coalesce(sr.suggested_route_name, sr.context_route_name, '')), '[^A-Z0-9]+', ' ', 'g')) as route_hint
  from public.stop_reports sr
  where sr.id = p_report_id
    and sr.latitude is not null
    and sr.longitude is not null
),
route_hits as (
  select
    r.id as ruta_id,
    r.codigo_ctp,
    r.nombre_ruta,
    r.operador,
    min(
      st_distance(
        rp.geog,
        st_setsrid(st_makepoint(report.lng, report.lat), 4326)::geography
      )
    )::integer as distancia_trazado_m
  from report
  join public.ruta_puntos rp
    on st_dwithin(
      rp.geog,
      st_setsrid(st_makepoint(report.lng, report.lat), 4326)::geography,
      greatest(50, p_radio_trazado_m)
    )
  join public.rutas r
    on r.id = rp.ruta_id
  group by r.id, r.codigo_ctp, r.nombre_ruta, r.operador
),
route_stops as (
  select distinct on (rh.ruta_id)
    rh.ruta_id,
    p.id as parada_cercana_id,
    coalesce(p.nombre, 'Parada sin nombre') as parada_cercana_nombre,
    coalesce(rp.sentido, 'sin_definir') as parada_cercana_sentido,
    st_distance(
      p.geo,
      st_setsrid(st_makepoint(report.lng, report.lat), 4326)::geography
    )::integer as distancia_parada_m
  from report
  join route_hits rh on true
  join public.ruta_paradas rp
    on rp.ruta_id = rh.ruta_id
  join public.paradas p
    on p.id = rp.parada_id
   and p.activo = true
  where st_dwithin(
    p.geo,
    st_setsrid(st_makepoint(report.lng, report.lat), 4326)::geography,
    greatest(50, p_radio_parada_m)
  )
  order by rh.ruta_id, distancia_parada_m asc, rp.orden asc, p.id asc
),
scored as (
  select
    rh.ruta_id,
    rh.codigo_ctp,
    rh.nombre_ruta,
    rh.operador,
    rh.distancia_trazado_m,
    rs.parada_cercana_id,
    rs.parada_cercana_nombre,
    rs.parada_cercana_sentido,
    rs.distancia_parada_m,
    (
      rh.distancia_trazado_m
      + coalesce(rs.distancia_parada_m, greatest(80, p_radio_parada_m) + 60)
      - case
          when report.reported_code <> ''
           and upper(trim(coalesce(rh.codigo_ctp, ''))) = report.reported_code then 220
          else 0
        end
      - case
          when report.route_hint <> ''
           and trim(regexp_replace(upper(coalesce(rh.nombre_ruta, '')), '[^A-Z0-9]+', ' ', 'g')) like '%' || report.route_hint || '%' then 140
          else 0
        end
      - case
          when report.route_hint <> ''
           and report.route_hint like '%' || trim(regexp_replace(upper(coalesce(rh.nombre_ruta, '')), '[^A-Z0-9]+', ' ', 'g')) || '%' then 60
          else 0
        end
    )::numeric as score
  from report
  join route_hits rh on true
  left join route_stops rs
    on rs.ruta_id = rh.ruta_id
)
select
  ruta_id,
  codigo_ctp,
  nombre_ruta,
  operador,
  distancia_trazado_m,
  parada_cercana_id,
  parada_cercana_nombre,
  parada_cercana_sentido,
  distancia_parada_m,
  score
from scored
order by score asc, distancia_trazado_m asc, ruta_id asc
limit greatest(1, least(p_limit, 25));
$$;

grant execute on function public.sugerir_rutas_para_stop_report(bigint, integer, integer, integer)
  to authenticated;

comment on function public.sugerir_rutas_para_stop_report(bigint, integer, integer, integer) is
  'Sugiere rutas candidatas para un stop_report usando cercania al trazado, paradas cercanas y hints del reporte.';

create or replace function public.sugerir_paradas_existentes_para_stop_report(
  p_report_id bigint,
  p_radio_m integer default 180,
  p_limit integer default 8
)
returns table (
  parada_id integer,
  nombre text,
  distancia_m integer,
  rutas text
)
language sql
stable
set search_path = public, extensions
as $$
with report as (
  select
    sr.latitude as lat,
    sr.longitude as lng
  from public.stop_reports sr
  where sr.id = p_report_id
    and sr.latitude is not null
    and sr.longitude is not null
), nearby as (
  select
    p.id as parada_id,
    coalesce(p.nombre, 'Parada sin nombre') as nombre,
    st_distance(
      p.geo,
      st_setsrid(st_makepoint(report.lng, report.lat), 4326)::geography
    )::integer as distancia_m,
    coalesce(r.codigo_ctp, 'sin_codigo') || ' ' || coalesce(r.nombre_ruta, 'Ruta disponible') as ruta_label
  from report
  join public.paradas p
    on p.activo = true
   and st_dwithin(
     p.geo,
     st_setsrid(st_makepoint(report.lng, report.lat), 4326)::geography,
     greatest(30, p_radio_m)
   )
  left join public.ruta_paradas rp
    on rp.parada_id = p.id
  left join public.rutas r
    on r.id = rp.ruta_id
)
select
  parada_id,
  nombre,
  min(distancia_m) as distancia_m,
  string_agg(distinct ruta_label, ' | ') filter (where ruta_label is not null) as rutas
from nearby
group by parada_id, nombre
order by distancia_m asc, parada_id asc
limit greatest(1, least(p_limit, 20));
$$;

grant execute on function public.sugerir_paradas_existentes_para_stop_report(bigint, integer, integer)
  to authenticated;

comment on function public.sugerir_paradas_existentes_para_stop_report(bigint, integer, integer) is
  'Devuelve paradas existentes cerca de un stop_report para saber si el reporte duplica o corrige una parada ya registrada.';

grant select on public.stop_reports to authenticated;
grant update (status, review_notes, reviewed_by, reviewed_at, metadata) on public.stop_reports to authenticated;

drop policy if exists stop_reports_select_review_authenticated on public.stop_reports;
create policy stop_reports_select_review_authenticated
on public.stop_reports
for select
 to authenticated
using (true);

drop policy if exists stop_reports_update_review_authenticated on public.stop_reports;
create policy stop_reports_update_review_authenticated
on public.stop_reports
for update
 to authenticated
using (true)
with check (true);
