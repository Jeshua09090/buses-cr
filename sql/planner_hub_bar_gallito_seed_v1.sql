insert into public.planner_hubs (
  hub_key,
  hub_name,
  hub_type,
  priority,
  radius_m,
  planner_radius_override_m,
  lat,
  lng,
  activo,
  metadata
)
values (
  'tejar_bar_gallito',
  'Bar El Gallito / San Isidro Sur',
  'landmark',
  12,
  420,
  900,
  9.8300492,
  -83.9529845,
  true,
  jsonb_build_object(
    'notes', 'Hub de destino para la zona de Bar El Gallito y su entorno inmediato en San Isidro.',
    'seed_version', 'bar_gallito_v1'
  )
)
on conflict (hub_key) do update
set
  hub_name = excluded.hub_name,
  hub_type = excluded.hub_type,
  priority = excluded.priority,
  radius_m = excluded.radius_m,
  planner_radius_override_m = excluded.planner_radius_override_m,
  lat = excluded.lat,
  lng = excluded.lng,
  activo = excluded.activo,
  metadata = public.planner_hubs.metadata || excluded.metadata,
  updated_at = timezone('utc', now());

with hub_row as (
  select id
  from public.planner_hubs
  where hub_key = 'tejar_bar_gallito'
),
group_row as (
  select id
  from public.planner_service_groups
  where group_key = 'tejar_san_isidro_destino_general'
)
insert into public.planner_hub_service_groups (
  hub_id,
  service_group_id,
  role,
  priority,
  activo,
  metadata
)
select
  h.id,
  g.id,
  'destination',
  12,
  true,
  jsonb_build_object('seed_version', 'bar_gallito_v1')
from hub_row h
cross join group_row g
on conflict (hub_id, service_group_id, role) do update
set
  priority = excluded.priority,
  activo = excluded.activo,
  metadata = public.planner_hub_service_groups.metadata || excluded.metadata,
  updated_at = timezone('utc', now());
