set search_path = public, extensions;

-- Fix a 0331-family seed artifact around El Molino / Super La Estrella.
-- The promoter matched official stop PBA-30102-075 to legacy stop 851
-- because it was within the old 90 m tolerance. For rider routing this is
-- worse: Moovit exposes the exact stop as Abastecedor/Super La Estrella, and
-- using the legacy point adds avoidable walking and a confusing stop name.

with exact_stop as (
  select p.id as parada_id
  from public.paradas p
  where p.metadata ->> 'stop_source_identifier' = 'PBA-30102-075'
  limit 1
),
target_rows as (
  select rps.id, rps.pattern_id
  from public.route_pattern_stops rps
  join public.route_patterns rp
    on rp.id = rps.pattern_id
  where rp.ruta_id in (4310, 4312, 4314, 4315, 4316)
    and rps.parada_id = 851
),
updated_stops as (
  update public.route_pattern_stops rps
  set parada_id = exact_stop.parada_id,
      updated_at = timezone('utc', now())
  from exact_stop, target_rows tr
  where rps.id = tr.id
  returning rps.pattern_id
),
pattern_signatures as (
  select
    rp.id as pattern_id,
    md5(
      string_agg(
        concat_ws(':', rps.parada_id::text, rps.stop_sequence::text),
        '|'
        order by rps.stop_sequence
      )
    ) as stop_signature
  from public.route_patterns rp
  join public.route_pattern_stops rps
    on rps.pattern_id = rp.id
  where rp.id in (select distinct pattern_id from updated_stops)
  group by rp.id
)
update public.route_patterns rp
set stop_signature = ps.stop_signature,
    metadata = coalesce(rp.metadata, '{}'::jsonb) || jsonb_build_object(
      'la_estrella_exact_stop_fix', 'PBA-30102-075',
      'la_estrella_exact_stop_fix_applied_at', timezone('utc', now())
    ),
    updated_at = timezone('utc', now())
from pattern_signatures ps
where rp.id = ps.pattern_id;
