set search_path = public, extensions;

insert into public.transbordos (
  parada_origen_id,
  parada_destino_id,
  distancia_caminando_m,
  activo,
  bidireccional
)
select
  3452,
  -13676,
  402,
  true,
  true
where exists (
  select 1
  from public.paradas p
  where p.id = 3452
)
and exists (
  select 1
  from public.paradas p
  where p.id = -13676
)
on conflict (parada_origen_id, parada_destino_id) do update
set
  distancia_caminando_m = excluded.distancia_caminando_m,
  activo = excluded.activo,
  bidireccional = excluded.bidireccional,
  updated_at = timezone('utc', now());
