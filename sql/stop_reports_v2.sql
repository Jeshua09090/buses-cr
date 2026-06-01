set search_path = public, extensions;

alter table public.stop_reports
  add column if not exists reported_route_code text,
  add column if not exists reported_direction text,
  add column if not exists context_origin_name text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stop_reports_reported_direction_chk'
      and conrelid = 'public.stop_reports'::regclass
  ) then
    alter table public.stop_reports
      add constraint stop_reports_reported_direction_chk
      check (
        reported_direction is null
        or reported_direction in ('ida', 'vuelta', 'ambos', 'sin_definir')
      );
  end if;
end $$;

create index if not exists stop_reports_type_created_idx
  on public.stop_reports (report_type, created_at desc);

create index if not exists stop_reports_route_code_idx
  on public.stop_reports (reported_route_code)
  where reported_route_code is not null;

comment on column public.stop_reports.reported_route_code is
  'Codigo corto de la ruta o ramal reportado desde la app.';

comment on column public.stop_reports.reported_direction is
  'Sentido reportado por el usuario: ida, vuelta, ambos o sin definir.';

comment on column public.stop_reports.context_origin_name is
  'Origen contextual del viaje o de la observacion de campo cuando aplique.';
