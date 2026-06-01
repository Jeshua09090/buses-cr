set search_path = public, extensions;

create schema if not exists private;

create table if not exists public.planner_runtime_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  app_runtime text not null,
  planner_source text not null,
  runtime_mode text,
  rollout_percent numeric(5, 2),
  rollout_bucket numeric(6, 2),
  runtime_latency_ms integer,
  fallback_reason text,
  journey_count integer not null default 0,
  snapshot_version text,
  departure_day_type text
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'planner_runtime_events_app_runtime_chk'
      and conrelid = 'public.planner_runtime_events'::regclass
  ) then
    alter table public.planner_runtime_events
      add constraint planner_runtime_events_app_runtime_chk
      check (app_runtime in ('native', 'web', 'node'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'planner_runtime_events_planner_source_chk'
      and conrelid = 'public.planner_runtime_events'::regclass
  ) then
    alter table public.planner_runtime_events
      add constraint planner_runtime_events_planner_source_chk
      check (planner_source in ('raptor', 'legacy'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'planner_runtime_events_runtime_mode_chk'
      and conrelid = 'public.planner_runtime_events'::regclass
  ) then
    alter table public.planner_runtime_events
      add constraint planner_runtime_events_runtime_mode_chk
      check (
        runtime_mode is null
        or runtime_mode in ('forced_on', 'forced_off', 'rollout_enabled', 'rollout_disabled')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'planner_runtime_events_departure_day_type_chk'
      and conrelid = 'public.planner_runtime_events'::regclass
  ) then
    alter table public.planner_runtime_events
      add constraint planner_runtime_events_departure_day_type_chk
      check (
        departure_day_type is null
        or departure_day_type in ('habil', 'sabado', 'domingo', 'feriado')
      );
  end if;
end $$;

create index if not exists planner_runtime_events_created_idx
  on public.planner_runtime_events (created_at desc);

create index if not exists planner_runtime_events_source_mode_created_idx
  on public.planner_runtime_events (planner_source, runtime_mode, created_at desc);

create index if not exists planner_runtime_events_latency_idx
  on public.planner_runtime_events (runtime_latency_ms)
  where runtime_latency_ms is not null;

alter table public.planner_runtime_events enable row level security;

revoke all on public.planner_runtime_events from anon, authenticated;
grant insert on public.planner_runtime_events to anon, authenticated;

drop policy if exists planner_runtime_events_insert_client on public.planner_runtime_events;
create policy planner_runtime_events_insert_client
on public.planner_runtime_events
for insert
to anon, authenticated
with check (
  app_runtime in ('native', 'web', 'node')
  and planner_source in ('raptor', 'legacy')
  and journey_count >= 0
  and (runtime_latency_ms is null or runtime_latency_ms >= 0)
  and (rollout_percent is null or (rollout_percent >= 0 and rollout_percent <= 100))
  and (rollout_bucket is null or (rollout_bucket >= 0 and rollout_bucket < 100))
);

comment on table public.planner_runtime_events is
  'Lightweight planner runtime telemetry for RAPTOR canary monitoring. Coordinates are intentionally omitted.';

create or replace function private.prune_planner_runtime_events(retention interval default interval '30 days')
returns integer
language plpgsql
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.planner_runtime_events
  where created_at < now() - retention;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function private.prune_planner_runtime_events(interval) from public, anon, authenticated;

comment on function private.prune_planner_runtime_events(interval) is
  'Manual/service-role retention helper for planner runtime telemetry. Recommended canary retention: 30 days.';
