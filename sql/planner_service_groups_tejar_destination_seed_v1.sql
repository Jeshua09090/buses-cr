insert into public.planner_service_groups (
  group_key,
  group_name,
  group_type,
  priority,
  activo,
  metadata
)
values (
  'tejar_san_isidro_destino_general',
  'San Isidro de Tejar por servicios locales',
  'equivalent_destination',
  18,
  true,
  jsonb_build_object(
    'notes', 'Prioriza servicios locales a Tejar incluso cuando el origen no cae en Gonzaga.',
    'seed_version', 'tejar_destination_v1'
  )
)
on conflict (group_key) do update
set
  group_name = excluded.group_name,
  group_type = excluded.group_type,
  priority = excluded.priority,
  activo = excluded.activo,
  metadata = public.planner_service_groups.metadata || excluded.metadata,
  updated_at = timezone('utc', now());

with group_row as (
  select id
  from public.planner_service_groups
  where group_key = 'tejar_san_isidro_destino_general'
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
    jsonb_build_object(
      'preferred', true,
      'reason', 'Mas directo hacia San Isidro de Tejar',
      'seed_version', 'tejar_destination_v1'
    ) as metadata
  union all
  select
    '328',
    4191,
    null,
    '0328-E',
    null,
    'Asuncion',
    20,
    25,
    jsonb_build_object(
      'preferred', false,
      'reason', 'Alternativa valida por Asuncion',
      'seed_version', 'tejar_destination_v1'
    )
  union all
  select
    '328',
    4191,
    null,
    '0328-F',
    null,
    'Pitahaya',
    30,
    30,
    jsonb_build_object(
      'preferred', false,
      'reason', 'Alternativa valida por Pitahaya',
      'seed_version', 'tejar_destination_v1'
    )
  union all
  select
    '300',
    4689,
    null,
    null,
    null,
    'San Jose-Tejar',
    60,
    60,
    jsonb_build_object(
      'preferred', false,
      'reason', 'Cobertura adicional cuando los locales no son viables',
      'seed_version', 'tejar_destination_v1'
    )
)
insert into public.planner_service_group_members (
  service_group_id,
  route_code,
  product_route_id,
  preview_route_id,
  variant_family_code,
  variant_code,
  member_label,
  member_priority,
  directness_rank,
  activo,
  metadata
)
select
  g.id,
  m.route_code,
  m.product_route_id,
  m.preview_route_id,
  m.variant_family_code,
  m.variant_code,
  m.member_label,
  m.member_priority,
  m.directness_rank,
  true,
  m.metadata
from group_row g
cross join members m
where not exists (
  select 1
  from public.planner_service_group_members existing
  where existing.service_group_id = g.id
    and coalesce(existing.product_route_id, -1) = coalesce(m.product_route_id, -1)
    and coalesce(existing.preview_route_id, -1) = coalesce(m.preview_route_id, -1)
    and coalesce(existing.variant_family_code, '') = coalesce(m.variant_family_code, '')
    and coalesce(existing.member_label, '') = coalesce(m.member_label, '')
);

with hub_row as (
  select id
  from public.planner_hubs
  where hub_key = 'tejar_san_isidro_centro'
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
  10,
  true,
  jsonb_build_object('seed_version', 'tejar_destination_v1')
from hub_row h
cross join group_row g
on conflict (hub_id, service_group_id, role) do update
set
  priority = excluded.priority,
  activo = excluded.activo,
  metadata = public.planner_hub_service_groups.metadata || excluded.metadata,
  updated_at = timezone('utc', now());
