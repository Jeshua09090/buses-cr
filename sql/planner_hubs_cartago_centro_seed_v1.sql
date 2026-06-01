set search_path = public, extensions;

insert into public.planner_hubs (
  hub_key,
  hub_name,
  hub_type,
  lat,
  lng,
  radius_m,
  planner_radius_override_m,
  priority,
  metadata
)
values
  (
    'cartago_centro',
    'Cartago Centro',
    'center',
    9.8643000,
    -83.9191500,
    650,
    950,
    10,
    jsonb_build_object(
      'notes', 'Hub amplio para centro de Cartago, bancos, comercio y transbordos cortos.',
      'seed_version', 'cartago_centro_v1'
    )
  ),
  (
    'cartago_terminal_ucr',
    'Terminal UCR Cartago',
    'terminal',
    9.8638410,
    -83.9152668,
    240,
    500,
    20,
    jsonb_build_object(
      'notes', 'Ancla operativa para la zona de UCR / terminal de abordaje en Cartago centro.',
      'seed_version', 'cartago_centro_v1'
    )
  ),
  (
    'ruinas_cartago',
    'Ruinas de Cartago',
    'landmark',
    9.8651500,
    -83.9194500,
    320,
    700,
    15,
    jsonb_build_object(
      'notes', 'Landmark para evitar que el planner trate Ruinas como un punto aislado sin contexto urbano.',
      'seed_version', 'cartago_centro_v1'
    )
  )
on conflict (hub_key) do update
set
  hub_name = excluded.hub_name,
  hub_type = excluded.hub_type,
  lat = excluded.lat,
  lng = excluded.lng,
  radius_m = excluded.radius_m,
  planner_radius_override_m = excluded.planner_radius_override_m,
  priority = excluded.priority,
  activo = true,
  metadata = public.planner_hubs.metadata || excluded.metadata,
  updated_at = timezone('utc', now());

with hub_rows as (
  select id, hub_key
  from public.planner_hubs
  where hub_key in ('cartago_centro', 'cartago_terminal_ucr', 'ruinas_cartago')
),
seed_links as (
  select 'cartago_centro'::text as hub_key, 850::bigint as parada_id, 'both'::text as role, 10 as priority
  union all select 'cartago_centro', 851, 'both', 20
  union all select 'cartago_centro', 852, 'both', 30
  union all select 'cartago_centro', 2503, 'both', 40
  union all select 'cartago_centro', 2409, 'both', 50
  union all select 'cartago_centro', 2514, 'both', 60
  union all select 'cartago_centro', 2717, 'both', 70
  union all select 'cartago_terminal_ucr', 2717, 'both', 10
  union all select 'cartago_terminal_ucr', 852, 'arrival', 20
  union all select 'ruinas_cartago', 851, 'arrival', 10
  union all select 'ruinas_cartago', 852, 'both', 20
  union all select 'ruinas_cartago', 2717, 'departure', 30
  union all select 'ruinas_cartago', 2503, 'arrival', 40
)
insert into public.planner_hub_stops (
  hub_id,
  parada_id,
  role,
  priority,
  metadata
)
select
  h.id,
  s.parada_id,
  s.role,
  s.priority,
  jsonb_build_object('seed_version', 'cartago_centro_v1')
from seed_links s
join hub_rows h
  on h.hub_key = s.hub_key
on conflict (hub_id, parada_id, role) do update
set
  priority = excluded.priority,
  activo = true,
  metadata = public.planner_hub_stops.metadata || excluded.metadata,
  updated_at = timezone('utc', now());
