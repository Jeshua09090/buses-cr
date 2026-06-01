set search_path = public, extensions;

-- Explicit walking connectors inside Cartago center.
-- These keep local feeders such as Cartago-Taras-San Nicolas eligible for
-- regional eastbound routes (Cachi, Loaiza, Penas Blancas, etc.) whose boarding
-- stops are a short walk away rather than the exact same stop.

with links(parada_origen_id, parada_destino_id, distancia_caminando_m) as (
  values
    (2503::bigint, 138::bigint, 507::integer), -- Parque Industrial -> Cartago/Dulce Nombre
    (2409::bigint, 138::bigint, 514::integer), -- Tres Rios-Cartago -> Cartago/Dulce Nombre
    (852::bigint, 138::bigint, 523::integer),  -- Plaza Iglesias -> Cartago/Dulce Nombre
    (3452::bigint, 138::bigint, 578::integer)  -- Terminal Taras -> Cartago/Dulce Nombre
)
insert into public.transbordos (
  parada_origen_id,
  parada_destino_id,
  distancia_caminando_m,
  activo,
  bidireccional
)
select
  l.parada_origen_id,
  l.parada_destino_id,
  l.distancia_caminando_m,
  true,
  true
from links l
where exists (
  select 1
  from public.paradas p
  where p.id = l.parada_origen_id
)
and exists (
  select 1
  from public.paradas p
  where p.id = l.parada_destino_id
)
on conflict (parada_origen_id, parada_destino_id) do update
set
  distancia_caminando_m = excluded.distancia_caminando_m,
  activo = excluded.activo,
  bidireccional = excluded.bidireccional,
  updated_at = timezone('utc', now());
