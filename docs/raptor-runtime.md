# RAPTOR Runtime

Buses CR is moving trip planning away from slow database RPC calls and into an
on-device transit runtime.

The current public branch includes the first reviewable version of that work:

- a bundled Cartago-scoped transit snapshot in `assets/snapshots/`
- snapshot generation and verification tooling in `scripts/snapshot/`
- an in-memory RAPTOR planner in `lib/raptor/`
- planner-lab screens and scripts for inspecting route choices
- golden-case and ranking regression tests for local Costa Rican corridors

## Runtime Shape

The runtime is intentionally feature-flagged. Production can keep using the
legacy planner while the RAPTOR path is validated against real trips.

At a high level:

1. `scripts/snapshot/` reads transit runtime tables.
2. The generator packages a Minotor-compatible snapshot.
3. `scripts/bundle-snapshot.mjs` copies the gzipped snapshot into app assets.
4. `lib/raptor/snapshot-cache.ts` loads and caches the snapshot on device.
5. `lib/raptor/find-journeys.ts` runs the transit search.
6. `lib/raptor/result-mapper.ts` maps runtime output back into existing app
   journey shapes.

The app still reuses `PlannedJourney` and `JourneyLeg` from the legacy planner so
the passenger UI does not need a parallel data model.

## Important Constraints

- `minotor` is pinned to exact `11.2.2`.
- App code imports from `minotor`, not `minotor/parser`.
- The feature flag defaults off unless explicitly enabled.
- The bundled snapshot is local to the app; there is no Supabase Storage
  download flow yet.
- Ranking rules should be backed by validation cases, not intuition alone.

## Validation Commands

```bash
npm run raptor:test
npm run raptor:golden
npm run raptor:perf-p95
npm run snapshot:test
```

Some scripts need environment variables and local Supabase data. The unit tests
and snapshot package tests are the easiest entry point for reviewers.

## Why This Is Public

This branch is meant to make the algorithm work reviewable without publishing
private handoff notes, local logs, or planning scratchpads. The goal is to show
the concrete runtime architecture and validation surface that will eventually
replace the older database-heavy trip planner.
