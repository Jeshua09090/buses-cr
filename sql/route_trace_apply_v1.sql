set search_path = public, extensions;

create or replace function public.aplicar_route_change_draft(
  p_draft_id bigint
)
returns table (
  draft_id bigint,
  ruta_id integer,
  inserted_points integer,
  status text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_draft public.route_change_drafts%rowtype;
  v_trace_id bigint;
  v_coords jsonb;
  v_now timestamptz := timezone('utc', now());
  v_user_id uuid := auth.uid();
  v_inserted integer := 0;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesion para aplicar un borrador';
  end if;

  select d.*, d.trace_session_id
  into v_draft
  from public.route_change_drafts d
  where d.id = p_draft_id;

  if not found then
    raise exception 'No existe el borrador %', p_draft_id;
  end if;

  v_trace_id := v_draft.trace_session_id;

  select feature->'geometry'->'coordinates'
  into v_coords
  from jsonb_array_elements(coalesce(v_draft.geometry->'features', '[]'::jsonb)) feature
  where coalesce(feature->'properties'->>'kind', '') = 'captured_trace'
  limit 1;

  if v_coords is null or jsonb_typeof(v_coords) <> 'array' then
    raise exception 'El borrador % no tiene una LineString de traza capturada valida', p_draft_id;
  end if;

  delete from public.ruta_puntos
  where ruta_id = v_draft.ruta_id;

  with coords as (
    select
      ordinality - 1 as orden,
      (value->>0)::double precision as lng,
      (value->>1)::double precision as lat
    from jsonb_array_elements(v_coords) with ordinality
  )
  insert into public.ruta_puntos (
    ruta_id,
    lat,
    lng,
    orden,
    geog,
    segmento_id
  )
  select
    v_draft.ruta_id,
    coords.lat,
    coords.lng,
    coords.orden,
    st_setsrid(st_makepoint(coords.lng, coords.lat), 4326)::geography,
    0
  from coords
  order by coords.orden;

  get diagnostics v_inserted = row_count;

  update public.rutas
  set geometry = jsonb_build_object(
    'type', 'LineString',
    'coordinates', v_coords
  )
  where id = v_draft.ruta_id;

  update public.route_change_drafts
  set
    status = 'applied',
    reviewed_by = v_user_id,
    reviewed_at = v_now,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'applied_at', v_now,
      'applied_by', v_user_id,
      'applied_points', v_inserted
    )
  where id = p_draft_id;

  if v_trace_id is not null then
    update public.route_trace_sessions
    set
      status = 'applied',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_applied_draft_id', p_draft_id,
        'last_applied_at', v_now,
        'last_applied_by', v_user_id,
        'last_applied_points', v_inserted
      )
    where id = v_trace_id;
  end if;

  return query
  select
    p_draft_id,
    v_draft.ruta_id,
    v_inserted,
    'applied'::text;
end;
$$;

grant execute on function public.aplicar_route_change_draft(bigint)
  to authenticated;

comment on function public.aplicar_route_change_draft(bigint) is
  'Aplica un borrador de cambio de trazado sobre ruta_puntos y actualiza su estado a applied.';
