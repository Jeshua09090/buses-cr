# Buses CR Snapshot Generator

Local-only generator for the current Costa Rica transit snapshot work, starting
with the Cartago validation corridors.

## Commands

From the repo root:

```bash
npm run snapshot:test
npm run snapshot:dev -- --scope=cartago --out=./local-snapshots
npm run snapshot:verify -- --in=./local-snapshots/<snapshot>.bin.gz
```

The preferred database path is `SNAPSHOT_DATABASE_URL` with direct `pg`.
For this local checkout, the runtime tables are also readable through PostgREST,
so the generator falls back to `SUPABASE_URL`/`SUPABASE_ANON_KEY` or the
existing Expo public env vars when a database URL is not present.

## Scope

This package does not upload to Supabase Storage, does not write `app_config`,
and does not import `minotor/parser`.

## Real Fixtures

Linearization regression fixtures live in `tests/fixtures/pattern-*.json`.
Use `tests/fixtures/_dump.sql` as the source query when a fixture needs to be
refreshed from Prueba.
