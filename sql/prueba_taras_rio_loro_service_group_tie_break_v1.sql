set search_path = public, extensions;

-- Narrow tie-breaker for Taras / Velas y Candelas -> Parque Ambiental Rio Loro.
-- The runtime has several route 300 variants with the same score and same
-- board/drop stops. This service group gives the Moovit-like 0300 variants a
-- small deterministic preference over the generic SAN JOSE-TEJAR label.

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
values
  (
    1200,
    'taras_velas_candelas',
    'Taras / Velas y Candelas',
    'district',
    9.8782900,
    -83.9389683,
    850,
    1100,
    12,
    true,
    jsonb_build_object(
      'seed_source', 'taras_rio_loro_service_group_tie_break_v1',
      'seed_kind', 'origin_hub'
    )
  ),
  (
    1201,
    'rio_loro_parque_ambiental',
    'Parque Ambiental Rio Loro',
    'landmark',
    9.9075246,
    -83.9425011,
    1900,
    2200,
    10,
    true,
    jsonb_build_object(
      'seed_source', 'taras_rio_loro_service_group_tie_break_v1',
      'seed_kind', 'destination_hub',
      'moovit_reference_lat', 9.909199,
      'moovit_reference_lng', -83.943462
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
  1200,
  'taras_rio_loro_route300_corridor',
  'Taras / Rio Loro route 300 corridor',
  'preferred_alternatives',
  'Desempate para preferir variantes oficiales 0300 tipo Moovit sobre SAN JOSE-TEJAR generica en el corredor Taras -> Rio Loro.',
  18,
  true,
  jsonb_build_object(
    'seed_source', 'taras_rio_loro_service_group_tie_break_v1',
    'seed_kind', 'service_group'
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
    seed.role,
    seed.priority,
    seed.link_id
  from (
    values
      (1200::bigint, 'taras_velas_candelas'::text, 'origin'::text, 10::integer),
      (1201::bigint, 'rio_loro_parque_ambiental'::text, 'destination'::text, 8::integer)
  ) as seed(link_id, hub_key, role, priority)
  join public.planner_hubs h
    on h.hub_key = seed.hub_key
  join public.planner_service_groups sg
    on sg.group_key = 'taras_rio_loro_route300_corridor'
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
  linked.role,
  linked.priority,
  true,
  jsonb_build_object(
    'seed_source', 'taras_rio_loro_service_group_tie_break_v1',
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
  where group_key = 'taras_rio_loro_route300_corridor'
),
members as (
  select *
  from (
    values
      (1200::bigint, 93004::integer, '0300-M'::text, '0300-M-2'::text, 'SAN JOSE - SAN PEDRO - TRES RIOS - LA LIMA - CARTAGO'::text, 6::integer, 4::integer),
      (1201::bigint, 93003::integer, '0300-K'::text, '0300-K-2'::text, 'SAN JOSE - SAN PEDRO - PISTA - LA LIMA - CARTAGO'::text, 8::integer, 6::integer),
      (1202::bigint, 93006::integer, '0300-U'::text, '0300-U-2'::text, 'SAN JOSE - ZAPOTE - TRES RIOS - LA LIMA - CARTAGO'::text, 10::integer, 8::integer),
      (1203::bigint, 93002::integer, '0300-L'::text, '0300-L-2'::text, 'SAN JOSE - SAN PEDRO - PISTA - TARAS - CARTAGO'::text, 14::integer, 10::integer),
      (1204::bigint, 93001::integer, '0300-J'::text, '0300-J-1'::text, 'SAN JOSE - SAN PEDRO - TRES RIOS - TARAS - CARTAGO'::text, 16::integer, 12::integer),
      (1205::bigint, 93005::integer, '0300-R'::text, '0300-R-2'::text, 'SAN JOSE - ZAPOTE - TRES RIOS - TARAS - CARTAGO'::text, 18::integer, 14::integer)
  ) as seed(member_id, preview_route_id, variant_family_code, variant_code, member_label, member_priority, directness_rank)
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
  '300',
  m.variant_family_code,
  m.variant_code,
  m.member_label,
  'destination',
  m.member_priority,
  m.directness_rank,
  true,
  jsonb_build_object(
    'seed_source', 'taras_rio_loro_service_group_tie_break_v1',
    'seed_kind', 'service_group_member'
  )
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
