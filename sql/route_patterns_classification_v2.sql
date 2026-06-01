set search_path = public, extensions;

-- Fase 1 GTFS-like v2:
-- Agrega clasificacion operativa a route_patterns sin romper el backfill legacy.
-- No sobreescribe clasificaciones manuales o provenientes de ARESEP.

alter table public.route_patterns
  add column if not exists categoria_operativa text,
  add column if not exists clasificacion_fuente text,
  add column if not exists clasificacion_confianza numeric(4,3);

update public.route_patterns
set
  categoria_operativa = coalesce(categoria_operativa, 'desconocida'),
  clasificacion_fuente = coalesce(nullif(clasificacion_fuente, ''), 'sin_clasificar'),
  clasificacion_confianza = coalesce(clasificacion_confianza, 0)
where categoria_operativa is null
   or clasificacion_fuente is null
   or clasificacion_fuente = ''
   or clasificacion_confianza is null;

alter table public.route_patterns
  alter column categoria_operativa set default 'desconocida',
  alter column clasificacion_fuente set default 'sin_clasificar',
  alter column clasificacion_confianza set default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'route_patterns_categoria_operativa_chk'
      and conrelid = 'public.route_patterns'::regclass
  ) then
    alter table public.route_patterns
      add constraint route_patterns_categoria_operativa_chk
      check (categoria_operativa in ('local', 'interurbana', 'expreso', 'troncal', 'desconocida'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'route_patterns_clasificacion_fuente_chk'
      and conrelid = 'public.route_patterns'::regclass
  ) then
    alter table public.route_patterns
      add constraint route_patterns_clasificacion_fuente_chk
      check (clasificacion_fuente in ('sin_clasificar', 'inferencia_nombre', 'manual', 'aresep', 'sistema', 'importacion'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'route_patterns_clasificacion_confianza_chk'
      and conrelid = 'public.route_patterns'::regclass
  ) then
    alter table public.route_patterns
      add constraint route_patterns_clasificacion_confianza_chk
      check (clasificacion_confianza between 0 and 1);
  end if;
end $$;

create index if not exists route_patterns_categoria_operativa_idx
  on public.route_patterns (categoria_operativa)
  where activo = true;

create index if not exists route_patterns_clasificacion_fuente_idx
  on public.route_patterns (clasificacion_fuente);

comment on column public.route_patterns.categoria_operativa is
  'Clasificacion operativa para ranking y planeacion: local, interurbana, expreso, troncal o desconocida.';

comment on column public.route_patterns.clasificacion_fuente is
  'Origen de la categoria_operativa: manual, aresep, inferencia_nombre, etc.';

comment on column public.route_patterns.clasificacion_confianza is
  'Confianza de 0 a 1 para la categoria_operativa actual.';

with base as (
  select
    rp.id,
    upper(
      trim(
        concat_ws(
          ' ',
          coalesce(rp.nombre, ''),
          coalesce(rp.headsign, ''),
          coalesce(r.nombre_ruta, ''),
          coalesce(r.codigo_ctp, '')
        )
      )
    ) as search_name
  from public.route_patterns rp
  join public.rutas r
    on r.id = rp.ruta_id
),
inferred as (
  select
    b.id,
    case
      when b.search_name ~ '(^|[^A-Z])(EXPRESO|DIRECTO)([^A-Z]|$)' then 'expreso'
      when b.search_name ~ '(TRONCAL|CORREDOR|TERMINAL)' then 'troncal'
      when b.search_name ~ '(SAN JOSE|TURRIALBA|PARAISO|OROSI|CERVANTES|PACAYAS|JUAN VINAS|TRES RIOS|LA UNION|IRAZU|TEJAR|EL GUARCO|COT)' then 'interurbana'
      when b.search_name ~ '(TARAS|SAN NICOLAS|AGUACALIENTE|GUADALUPE|OCCIDENTAL|ORIENTAL|LOURDES|DULCE NOMBRE|TIERRA BLANCA|BLANQUILLO|EL ALTO|MATA DE MORA|PIEDRA AZUL|PE.?A BLANCA|LOAIZA|EL HUMO|LA PUEBLA|PARQUE INDUSTRIAL|RIO MACHO|SANTIAGO)' then 'local'
      else 'desconocida'
    end as categoria_operativa,
    case
      when b.search_name ~ '(^|[^A-Z])(EXPRESO|DIRECTO)([^A-Z]|$)' then 0.950
      when b.search_name ~ '(TRONCAL|CORREDOR|TERMINAL)' then 0.800
      when b.search_name ~ '(SAN JOSE|TURRIALBA|PARAISO|OROSI|CERVANTES|PACAYAS|JUAN VINAS|TRES RIOS|LA UNION|IRAZU|TEJAR|EL GUARCO|COT)' then 0.850
      when b.search_name ~ '(TARAS|SAN NICOLAS|AGUACALIENTE|GUADALUPE|OCCIDENTAL|ORIENTAL|LOURDES|DULCE NOMBRE|TIERRA BLANCA|BLANQUILLO|EL ALTO|MATA DE MORA|PIEDRA AZUL|PE.?A BLANCA|LOAIZA|EL HUMO|LA PUEBLA|PARQUE INDUSTRIAL|RIO MACHO|SANTIAGO)' then 0.650
      else 0.000
    end as clasificacion_confianza,
    b.search_name
  from base b
)
update public.route_patterns rp
set
  categoria_operativa = i.categoria_operativa,
  clasificacion_fuente = case
    when i.categoria_operativa = 'desconocida' then 'sin_clasificar'
    else 'inferencia_nombre'
  end,
  clasificacion_confianza = i.clasificacion_confianza,
  metadata = rp.metadata || jsonb_build_object(
    'clasificacion_inferida_desde_nombre', i.search_name,
    'clasificacion_actualizada_at', timezone('utc', now())
  ),
  updated_at = timezone('utc', now())
from inferred i
where rp.id = i.id
  and coalesce(rp.clasificacion_fuente, 'sin_clasificar') in ('sin_clasificar', 'inferencia_nombre');
