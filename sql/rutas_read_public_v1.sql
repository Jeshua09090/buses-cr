set search_path = public, extensions;

-- La app pasajero y varias RPCs hacen join contra public.rutas.
-- Si el rol anon/authenticated no puede leer rutas, las funciones pueden
-- devolver 0 filas aunque paradas y ruta_paradas si tengan datos.

grant select on public.rutas to anon, authenticated;

alter table public.rutas enable row level security;

drop policy if exists "Public read rutas" on public.rutas;
drop policy if exists rutas_read_public on public.rutas;
create policy rutas_read_public
on public.rutas
for select
to anon, authenticated
using (true);

comment on policy rutas_read_public on public.rutas is
  'Permite lectura publica de rutas para planner pasajero y RPCs de consulta.';
