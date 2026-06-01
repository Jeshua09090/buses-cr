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
    'gonzaga_salida',
    'Salida Gonzaga / Plaza Iglesias',
    'transfer',
    9.8637371,
    -83.9229973,
    260,
    550,
    12,
    jsonb_build_object(
      'notes', 'Zona operativa de salida cercana al Gonzaga, Plaza Iglesias y bancos del centro de Cartago.',
      'seed_version', 'tejar_groups_v1'
    )
  ),
  (
    'tejar_san_isidro_centro',
    'San Isidro de Tejar Centro',
    'center',
    9.8450510,
    -83.9385627,
    260,
    600,
    18,
    jsonb_build_object(
      'notes', 'Zona de llegada util para plaza, iglesia y bar Gallito en San Isidro de Tejar.',
      'seed_version', 'tejar_groups_v1'
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

insert into public.planner_service_groups (
  group_key,
  group_name,
  group_type,
  description,
  priority,
  metadata
)
values
  (
    'tejar_san_isidro_desde_gonzaga',
    'San Isidro de Tejar desde Gonzaga',
    'preferred_alternatives',
    'Grupo de rutas validas para llegar a San Isidro de Tejar desde la zona de salida de Gonzaga, con preferencia por Molino.',
    10,
    jsonb_build_object(
      'notes', 'Molino suele ser la opcion mas directa; Asuncion y Pitahaya siguen siendo alternativas validas.',
      'seed_version', 'tejar_groups_v1'
    )
  )
on conflict (group_key) do update
set
  group_name = excluded.group_name,
  group_type = excluded.group_type,
  description = excluded.description,
  priority = excluded.priority,
  activo = true,
  metadata = public.planner_service_groups.metadata || excluded.metadata,
  updated_at = timezone('utc', now());

with group_row as (
  select id
  from public.planner_service_groups
  where group_key = 'tejar_san_isidro_desde_gonzaga'
),
members as (
  select
    '328'::text as route_code,
    4190::integer as product_route_id,
    null::integer as preview_route_id,
    '0328-D'::text as variant_family_code,
    null::text as variant_code,
    'Molino'::text as member_label,
    10::integer as member_priority,
    10::integer as directness_rank,
    jsonb_build_object('preferred', true, 'reason', 'Mas directo hacia San Isidro de Tejar') as metadata
  union all
  select
    '328',
    4191,
    null::integer,
    '0328-E',
    null::text,
    'Asunción',
    20,
    25,
    jsonb_build_object('preferred', false, 'reason', 'Alternativa valida por Asunción')
  union all
  select
    '328',
    4191,
    null::integer,
    '0328-F',
    null::text,
    'Pitahaya',
    30,
    30,
    jsonb_build_object('preferred', false, 'reason', 'Alternativa valida por Pitahaya')
)
insert into public.planner_service_group_members (
  service_group_id,
  product_route_id,
  preview_route_id,
  route_code,
  variant_family_code,
  variant_code,
  member_label,
  service_role,
  member_priority,
  directness_rank,
  metadata
)
select
  g.id,
  m.product_route_id,
  m.preview_route_id,
  m.route_code,
  m.variant_family_code,
  m.variant_code,
  m.member_label,
  'destination',
  m.member_priority,
  m.directness_rank,
  jsonb_build_object('seed_version', 'tejar_groups_v1') || m.metadata
from group_row g
cross join members m
where not exists (
  select 1
  from public.planner_service_group_members existing
  where existing.service_group_id = g.id
    and existing.route_code = m.route_code
    and coalesce(existing.variant_family_code, '') = coalesce(m.variant_family_code, '')
    and coalesce(existing.variant_code, '') = coalesce(m.variant_code, '')
    and existing.member_label = m.member_label
    and existing.service_role = 'destination'
);

with hub_rows as (
  select id, hub_key
  from public.planner_hubs
  where hub_key in ('gonzaga_salida', 'tejar_san_isidro_centro')
),
group_row as (
  select id
  from public.planner_service_groups
  where group_key = 'tejar_san_isidro_desde_gonzaga'
),
links as (
  select 'gonzaga_salida'::text as hub_key, 'origin'::text as role, 10::integer as priority
  union all
  select 'tejar_san_isidro_centro', 'destination', 10
)
insert into public.planner_hub_service_groups (
  hub_id,
  service_group_id,
  role,
  priority,
  metadata
)
select
  h.id,
  g.id,
  l.role,
  l.priority,
  jsonb_build_object('seed_version', 'tejar_groups_v1')
from links l
join hub_rows h
  on h.hub_key = l.hub_key
cross join group_row g
on conflict (hub_id, service_group_id, role) do update
set
  priority = excluded.priority,
  activo = true,
  metadata = public.planner_hub_service_groups.metadata || excluded.metadata,
  updated_at = timezone('utc', now());
