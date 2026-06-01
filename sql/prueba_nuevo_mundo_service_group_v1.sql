set search_path = public, extensions;

-- Tie-breaker for trips to Restaurante Nuevo Mundo / Coris corridor.
-- Moovit tends to surface Cartago-Coris, Cartago-Santa Elena and
-- Cartago-Rio Conejo here. Molino/San Isidro can be physically close, but it
-- is a weaker fallback for this destination corridor.

insert into public.planner_hubs (
  id,
  hub_key,
  hub_name,
  hub_type,
  lat,
  lng,
  radius_m,
  planner_radius_override_m,
  priority,
  activo,
  metadata
)
values (
  1210,
  'nuevo_mundo_el_guarco',
  'Restaurante Nuevo Mundo / Coris',
  'landmark',
  9.841523,
  -83.947323,
  900,
  1200,
  10,
  true,
  jsonb_build_object(
    'seed_source', 'prueba_nuevo_mundo_service_group_v1',
    'seed_kind', 'destination_hub',
    'moovit_reference_lat', 9.841523,
    'moovit_reference_lng', -83.947323
  )
)
on conflict (hub_key) do update
set hub_name = excluded.hub_name,
    hub_type = excluded.hub_type,
    lat = excluded.lat,
    lng = excluded.lng,
    radius_m = excluded.radius_m,
    planner_radius_override_m = excluded.planner_radius_override_m,
    priority = excluded.priority,
    activo = true,
    metadata = coalesce(public.planner_hubs.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = timezone('utc', now());

insert into public.planner_service_groups (
  id,
  group_key,
  group_name,
  group_type,
  description,
  priority,
  activo,
  metadata
)
values (
  1210,
  'nuevo_mundo_coris_rio_conejo_corridor',
  'Nuevo Mundo / Coris / Santa Elena corridor',
  'preferred_alternatives',
  'Preferencia de destino para Restaurante Nuevo Mundo: Coris, Santa Elena y Rio Conejo deben superar a rutas de San Isidro/Molino usadas solo como fallback.',
  16,
  true,
  jsonb_build_object(
    'seed_source', 'prueba_nuevo_mundo_service_group_v1',
    'seed_kind', 'service_group',
    'external_baseline', 'moovit_public_tripplan'
  )
)
on conflict (group_key) do update
set group_name = excluded.group_name,
    group_type = excluded.group_type,
    description = excluded.description,
    priority = excluded.priority,
    activo = true,
    metadata = coalesce(public.planner_service_groups.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = timezone('utc', now());

with linked as (
  select
    h.id as hub_id,
    sg.id as service_group_id,
    1210::bigint as link_id
  from public.planner_hubs h
  join public.planner_service_groups sg
    on sg.group_key = 'nuevo_mundo_coris_rio_conejo_corridor'
  where h.hub_key = 'nuevo_mundo_el_guarco'
)
insert into public.planner_hub_service_groups (
  id,
  hub_id,
  service_group_id,
  role,
  priority,
  activo,
  metadata
)
select
  linked.link_id,
  linked.hub_id,
  linked.service_group_id,
  'destination',
  8,
  true,
  jsonb_build_object(
    'seed_source', 'prueba_nuevo_mundo_service_group_v1',
    'seed_kind', 'hub_service_group'
  )
from linked
on conflict (hub_id, service_group_id, role) do update
set priority = excluded.priority,
    activo = true,
    metadata = coalesce(public.planner_hub_service_groups.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = timezone('utc', now());

with service_group as (
  select id
  from public.planner_service_groups
  where group_key = 'nuevo_mundo_coris_rio_conejo_corridor'
),
members as (
  select *
  from (
    values
      (1210::bigint, 4334::integer, '331'::text, 'Cartago - Coris'::text, 4::integer, 4::integer, jsonb_build_object('preferred', true, 'reason', 'Moovit-like direct corridor for Nuevo Mundo')),
      (1211::bigint, 4330::integer, '330'::text, 'Cartago - Rio Conejo'::text, 8::integer, 8::integer, jsonb_build_object('preferred', true, 'reason', 'Moovit-like Rio Conejo alternative')),
      (1212::bigint, 4332::integer, '330'::text, 'Cartago - Santa Elena Abajo'::text, 10::integer, 10::integer, jsonb_build_object('preferred', true, 'reason', 'Moovit-like Santa Elena alternative')),
      (1213::bigint, 4336::integer, '330'::text, 'Cartago - Santa Elena Abajo por Parque Industrial'::text, 14::integer, 14::integer, jsonb_build_object('preferred', true, 'reason', 'Useful southeast alternative')),
      (1214::bigint, 4190::integer, '328'::text, 'Cartago-San Isidro - El Molino'::text, 120::integer, 60::integer, jsonb_build_object('preferred', false, 'reason', 'Nearby fallback, but not the target corridor')),
      (1215::bigint, 4191::integer, '328'::text, 'Cartago-Asuncion-Pitahaya-San Isidro'::text, 130::integer, 65::integer, jsonb_build_object('preferred', false, 'reason', 'Nearby fallback, but not the target corridor'))
  ) as seed(member_id, preview_route_id, route_code, member_label, member_priority, directness_rank, metadata)
)
insert into public.planner_service_group_members (
  id,
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
  activo,
  metadata
)
select
  m.member_id,
  sg.id,
  null::integer,
  m.preview_route_id,
  m.route_code,
  null::text,
  null::text,
  m.member_label,
  'destination',
  m.member_priority,
  m.directness_rank,
  true,
  jsonb_build_object(
    'seed_source', 'prueba_nuevo_mundo_service_group_v1',
    'seed_kind', 'service_group_member'
  ) || m.metadata
from members m
cross join service_group sg
on conflict (id) do update
set service_group_id = excluded.service_group_id,
    product_route_id = excluded.product_route_id,
    preview_route_id = excluded.preview_route_id,
    route_code = excluded.route_code,
    variant_family_code = excluded.variant_family_code,
    variant_code = excluded.variant_code,
    member_label = excluded.member_label,
    service_role = excluded.service_role,
    member_priority = excluded.member_priority,
    directness_rank = excluded.directness_rank,
    activo = true,
    metadata = coalesce(public.planner_service_group_members.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = timezone('utc', now());
