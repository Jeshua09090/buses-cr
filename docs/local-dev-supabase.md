# Local Supabase Development

This repo can run a local Supabase stack with Docker for zero-risk data work before applying reviewed SQL to the remote project.

## When To Use This

Use local Supabase before transit data fixes that need snapshot regeneration, such as route windows, route pattern stops, transfer edges, or runtime seed work. Local is not a Supabase preview branch: it is an isolated Docker database for iteration. Remote changes still need reviewed SQL before apply.

## Requirements

- Docker Desktop with WSL2 backend running.
- Supabase CLI via `npx supabase@latest`.
- The repo linked to your remote project with `npx supabase link --project-ref <project-ref>`.

Do not run `supabase migration repair` just because `db pull` reports remote/local history mismatch. That command mutates remote migration history. For this repo, use a schema dump baseline for local development instead.

## Local Setup

Start the stack:

```powershell
npx supabase start
```

Local URLs:

- Studio: `http://127.0.0.1:54323`
- Database: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- API: `http://127.0.0.1:54321`

`npx supabase status` is the primary local health check. The local `vector`
log collector may restart on Docker Desktop if it cannot connect to the Docker
logs source, but DB/API/Studio remain usable for this repo's snapshot and data
fix workflow as long as `supabase status` reports the setup running and
`supabase_db_busescr` is healthy.

Stop the stack when not in use:

```powershell
npx supabase stop
```

## Schema Baseline

The current local setup uses these local migrations:

- `supabase/migrations/20260520000000_local_extensions.sql`
- `supabase/migrations/20260521000000_remote_schema_baseline.sql`

The extension migration creates the `extensions` schema and enables `postgis` and `btree_gist`, which are required by the remote schema baseline.

If the remote schema must be refreshed, dump it deliberately:

```powershell
npx supabase db dump --linked --schema public --file supabase/migrations/<timestamp>_remote_schema_baseline.sql
```

Review the generated SQL before using it as a new baseline.

## Data Seed

`supabase db pull` only synchronizes schema, not table data. RAPTOR snapshot generation needs the transit tables populated.

Create a data-only dump:

```powershell
npx supabase db dump --linked --data-only --schema public --use-copy --file supabase/seed.sql
```

`supabase/seed.sql` is intentionally ignored by Git because it is large and environment-specific.

The CLI seed runner can fail on large `COPY` dumps. Load the seed directly into local Postgres instead:

```powershell
docker cp supabase\seed.sql supabase_db_busescr:/tmp/busescr_seed.sql
docker exec supabase_db_busescr psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/busescr_seed.sql
```

If the seed fails after the RAPTOR-critical tables have loaded, verify the tables before retrying. A known non-blocking failure can occur later when compiling unrelated CTP staging functions that reference unqualified geometry types.

Expected RAPTOR-critical counts after a fresh remote seed, before applying any
local-only FU SQL:

| Table | Expected Count |
| --- | ---: |
| `rutas` | 162 |
| `route_patterns` | 169 total, 167 active for snapshot |
| `service_windows` | 1027 |
| `paradas` | 2896 |
| `route_pattern_stops` | 13791 total, 13721 active for snapshot |
| `planner_boarding_points` | 24885 |
| `planner_transfer_edges` | 49586 |

## Snapshot Generation Against Local DB

Point the snapshot generator at local Postgres:

```powershell
$env:SNAPSHOT_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
npm run snapshot:dev
Remove-Item Env:SNAPSHOT_DATABASE_URL
```

Bundle the newest generated snapshot into the app:

```powershell
npm run snapshot:bundle
```

Validate:

```powershell
npm --prefix .\scripts\snapshot test
npm --prefix .\scripts\snapshot run typecheck
npm run raptor:test
npm run raptor:golden
npm run raptor:outward-discovery
```

Current verified remote-backed bundled baseline:

- Snapshot: `v20260521T204708Z-cartago-local`
- `npm --prefix .\scripts\snapshot test`: 37/37 pass
- `npm --prefix .\scripts\snapshot run typecheck`: pass
- `npm run raptor:test`: 126/126 pass
- `npm run raptor:golden`: 65/65 pass+acceptable, 52 strict PASS
- `npm run raptor:spot-check`: 20/20
- `npm run raptor:outward-discovery`: 14 expected + 1 acceptable, 0 watches,
  0 data gaps

The remote project now includes the two outward data fixes first validated
locally:

- `sql/cartago_outward_cartago_ice_special_windows_v1.sql`
- `sql/cartago_outward_route4692_westside_reactivation_v1.sql`

Rollback files were written and tested locally before remote apply:

- `sql/cartago_outward_cartago_ice_special_windows_v1_rollback.sql`
- `sql/cartago_outward_route4692_westside_reactivation_v1_rollback.sql`

Current post-FU1/FU2 local critical counts:

| Metric | Count |
| --- | ---: |
| `route_patterns` total | 169 |
| `route_patterns` active | 169 |
| `service_windows` active | 1013 |
| `service_windows` total | 1029 |
| `route_pattern_stops` | 13791 |
| `planner_transfer_edges` | 49586 |

## Known Local Setup Finding

Local Postgres returns `bigint` ids as strings through `pg`. The snapshot generator must not compare raw `row.id` to parsed numeric ids with strict equality when joining route metadata. `scripts/snapshot/src/read-postgres.ts` now builds route patterns directly from each row so `route_name` uses the clean `rutas.nombre_ruta`, while `pattern_name` keeps directional labels such as `/ IDA` and `/ VUELTA`.

## Remote Apply Pattern

For data fixes:

1. Apply and validate SQL locally first.
2. Regenerate the local snapshot and run the RAPTOR checks above.
3. Prepare a reviewed SQL migration for remote.
4. Apply remote deliberately with the CLI or SQL editor.
5. Regenerate and bundle the production snapshot.

Do not use automatic `db push` for unreviewed data fixes.

## Security Note

Supabase advisors currently flag `public.ruta_puntos` because RLS is disabled. Do not enable RLS blindly without policies; it can break reads/writes. The minimal remediation is:

```sql
ALTER TABLE public.ruta_puntos ENABLE ROW LEVEL SECURITY;
```

Add policies that match the intended access model before applying this remotely.
