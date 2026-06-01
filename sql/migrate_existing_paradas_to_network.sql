set search_path = public, extensions;

create extension if not exists postgis with schema extensions;

alter table public.paradas
  add column if not exists osm_id text,
  add column if not exists tiene_techo boolean,
  add column if not exists accesible boolean,
  add column if not exists activo boolean,
  add column if not exists fuente text,
  add column if not exists metadata jsonb,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.paradas
set
  nombre = nullif(btrim(nombre), ''),
  tiene_techo = coalesce(tiene_techo, false),
  accesible = coalesce(accesible, false),
  activo = coalesce(activo, true),
  fuente = coalesce(nullif(fuente, ''), 'osm'),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, timezone('utc', now()));

alter table public.paradas
  alter column lat set not null,
  alter column lng set not null,
  alter column tiene_techo set default false,
  alter column tiene_techo set not null,
  alter column accesible set default false,
  alter column accesible set not null,
  alter column activo set default true,
  alter column activo set not null,
  alter column fuente set default 'osm',
  alter column fuente set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column created_at set default timezone('utc', now()),
  alter column created_at set not null,
  alter column updated_at set default timezone('utc', now()),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'paradas'
      and column_name = 'geo'
  ) then
    alter table public.paradas
      add column geo geography(Point, 4326)
      generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored;
  end if;
end $$;

create unique index if not exists paradas_osm_id_uidx
  on public.paradas (osm_id)
  where osm_id is not null;

create index if not exists paradas_geo_gix
  on public.paradas
  using gist (geo);

create index if not exists paradas_activas_idx
  on public.paradas (activo)
  where activo = true;

create index if not exists paradas_fuente_idx
  on public.paradas (fuente);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'paradas_fuente_chk'
      and conrelid = 'public.paradas'::regclass
  ) then
    alter table public.paradas
      add constraint paradas_fuente_chk
      check (fuente in ('osm', 'manual', 'reporte_usuario', 'importacion', 'sistema'));
  end if;
end $$;

-- Semilla inicial de transbordos por proximidad.
-- Ajusta 120m si quieres una red mas conservadora o mas permisiva.
insert into public.transbordos (
  parada_origen_id,
  parada_destino_id,
  distancia_caminando_m,
  activo,
  bidireccional
)
select
  p1.id as parada_origen_id,
  p2.id as parada_destino_id,
  round(st_distance(p1.geo, p2.geo))::integer as distancia_caminando_m,
  true as activo,
  true as bidireccional
from public.paradas p1
join public.paradas p2
  on p1.id < p2.id
where p1.activo = true
  and p2.activo = true
  and st_dwithin(p1.geo, p2.geo, 120)
on conflict (parada_origen_id, parada_destino_id)
do update
set
  distancia_caminando_m = excluded.distancia_caminando_m,
  activo = true,
  bidireccional = excluded.bidireccional,
  updated_at = timezone('utc', now());

-- Nota:
-- Este script migra y normaliza la tabla paradas actual.
-- No llena ruta_paradas automaticamente porque eso depende del orden real de cada ruta.
-- Una vez tengas esa relacion lista, la RPC buscar_viajes_0_1_transbordo ya podra aprovecharla.
