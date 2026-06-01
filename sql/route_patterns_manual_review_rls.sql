set search_path = public, extensions;

-- Permisos minimos para la herramienta manual de clasificacion.
-- Usa Supabase JS con anon key + sesion autenticada.
-- Limita el UPDATE a columnas de clasificacion en route_patterns.

grant select on public.route_patterns to anon, authenticated;
grant select on public.route_pattern_stops to anon, authenticated;
grant select on public.paradas to anon, authenticated;

grant update (categoria_operativa, clasificacion_fuente, clasificacion_confianza)
  on public.route_patterns
  to authenticated;

drop policy if exists route_patterns_manual_review_update_authenticated on public.route_patterns;
create policy route_patterns_manual_review_update_authenticated
on public.route_patterns
for update
to authenticated
using (true)
with check (true);

comment on policy route_patterns_manual_review_update_authenticated on public.route_patterns is
  'Permite revision manual autenticada de categoria_operativa usando la herramienta web interna.';
