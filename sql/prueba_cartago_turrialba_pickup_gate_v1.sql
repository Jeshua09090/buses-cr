set search_path = public, extensions;

-- The inferred San Jose/Turrialba shape passes near Ochomogo/Taras/La Lima,
-- but Moovit boards it for east-Cartago trips at Cementerio/Cartago center.
-- Keep drop-off available, but prevent these highway approach stops from being
-- used as first boarding points for short Cartago trips.

with gated_stops as (
  select rps.id
  from public.route_patterns rp
  join public.route_pattern_stops rps
    on rps.pattern_id = rp.id
  where (
      rp.ruta_id = 4302
      and rps.stop_sequence between 90 and 108
    )
    or (
      rp.ruta_id = 4304
      and rps.stop_sequence between 91 and 109
    )
)
update public.route_pattern_stops rps
set
  es_subida = false,
  pickup_type = 1,
  updated_at = timezone('utc', now())
from gated_stops gs
where rps.id = gs.id;
