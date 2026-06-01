# Province Expansion Playbook

This playbook turns the Cartago RAPTOR work into a repeatable process for the
next provinces or GAM corridors. It is intentionally evidence-first: do not
design province-specific ranking rules until the data, Moovit/source checks, and
RAPTOR baselines show a repeatable failure class.

## Scope Decision First

Before starting a province, decide which expansion shape is being attempted.

| Shape | Use when | Data lift | Runtime lift | Main risk |
|---|---|---:|---:|---|
| Outward corridor | Existing users in a covered province travel to adjacent corridors or city centers. | Low to medium | Low | Existing defensive ranking may penalize a route that is now legitimate. |
| Full province | Users can plan trips inside the new province and across province boundaries. | High | Medium | Missing route patterns, local transfer graph, and province-specific corridor rules. |
| GAM unified snapshot | Cross-province trips are first-class for Cartago, San Jose, Heredia, and Alajuela. | High | Medium to high | Bundle size, snapshot regeneration time, and cross-province ranking ambiguity. |
| Separate province snapshots | Users mostly travel inside one province and occasionally outward. | Medium per province | High later | Cross-snapshot transfers are complex and can produce poor UX. |

Do not decide unified vs separated snapshots by theory alone. Use an outward
round with boundary probes first. If cross-province cases need route patterns
that are not naturally present in the current snapshot, unified GAM data becomes
more attractive. If outward cases work with existing interurban families, a
staged snapshot approach may be enough for the next wave.

## Phase 0 - Pre-Requisites

Acceptance criteria:

- Local Supabase CLI workflow is available and documented.
- Snapshot generator can point at local or remote-backed data.
- RAPTOR ranking infrastructure and bounded candidate-pair planner are green.
- Ground-truth sources are identified: Moovit trip planner, Moovit line PDFs,
  ARESEP PDFs, operator route information, or field knowledge.
- Current baseline metrics are known: golden, spot-check, snapshot tests,
  native p95, and snapshot size.

Common pitfalls:

- `supabase db pull` syncs schema only, not data. Seed required runtime tables
  before trusting local snapshot tests.
- A free-plan local Docker workflow is not a preview branch. It is safe for
  iteration, but remote applies still need reviewed SQL.
- Do not rely on planner-lab debug candidates as user recommendations. Validate
  the clean winner.
- Moovit public stop/site pages are useful source support, but they are not the
  same as an exact trip-planner verdict. When possible, select Moovit
  autocomplete origin/destination suggestions and record the generated points.

## Phase 1 - Data Seeding

Goal: produce a local snapshot that can answer basic route queries before any
ranking rules are added.

Steps:

1. Inventory the province's route families, stops, service windows, and transfer
   edges.
2. Seed or import route patterns and stops locally.
3. Linearize route patterns and build the service-route directory.
4. Audit synthetic service windows. Special or commute-only lines must not become
   all-day routes.
5. Generate a local snapshot.
6. Run reachability sanity checks.

Before assuming ranking is the fix, run a route-name inventory against the
snapshot tables and staging/source tables. If an expected corridor has zero
matching route families, the problem is data ingestion or reactivation, not
ranking. Synthetic ranking rules cannot compensate for missing data.

Always check existing staging and preview infrastructure before assuming a
manual seed is needed. The San Jose connector inventory initially looked like
true missing data in the runtime tables, but generated CTP staging batches
already contained Sabana, Estadio, Pavas, Calderon, Moravia, Desamparados, and
Escazu families. Existing regulatory pipelines may have broader coverage than
the active snapshot scope.

Treat source-to-runtime as a staged pipeline, not a single seed step:

1. Source rows present in staging.
2. Stop candidates inferred.
3. Route stops previewed.
4. Runtime tables promoted.
5. Snapshot regenerated and validated.

Validate each stage before moving to the next. A route family can be present in
CTP staging but still unusable by RAPTOR if inferred stops have not been built.

Acceptance criteria:

- Snapshot counts are within expected range for the province scope.
- A small set of obvious direct trips returns a route.
- No special-only service appears as an all-day or weekend route unless source
  evidence confirms it.
- SQL seed/fix files are idempotent where possible and include metadata trail.

Common pitfalls from Cartago:

- Synthetic windows can hide real temporal bugs. `CARTAGO - ICE` looked like a
  ranking problem until the service-window data was corrected.
- Single-minute windows plus frequency expansion can model a discrete trip
  correctly. Do not broaden the window just because it looks too narrow.
- Candidate breadth is a tradeoff, not a pure benefit. FU7 improved p95 and
  strict PASS by reducing routed pairs.
- Standard earliest-arrival RAPTOR can hide a more user-friendly nearby board
  when walking downstream catches a vehicle with the same or slightly earlier
  arrival. The Taras -> Pali follow-up fixed this only for short urban trips by
  adding a tiny bounded Range RAPTOR supplement; do not broaden range windows
  without a fresh perf check.
- San Jose connector Step 0 showed that stable `DATA_GAP` results across
  07:00/09:00/16:00 were a coverage signal, not a time-window or ranking bug.
  Always separate "route exists but loses" from "route does not exist."
- San Jose connector source inventory showed a second distinction: "route does
  not exist in runtime snapshot" can still mean "route exists in staging source,
  but inference/promotion has not been run." Check generated CTP batches,
  staging variants, inferred stops, and preview RPC output before choosing
  manual seed.
- Bulk inference through Supabase REST/PostgREST can hit transport limits even
  when the SQL function has a longer `statement_timeout`. The first San Jose CTP
  inference test showed REST batches around 300 stops can timeout at ~60s while
  still committing rows afterward. For repeatable data operations, prefer direct
  database connections or conservative batches with explicit post-batch
  verification.
- Source promotion can expose a ranking issue after the missing data is added.
  FU-SJ1 seeded the Sabana/Estadio connector locally, but RAPTOR still preferred
  a 1km+ final walk until the far-drop alternative rule compared shared
  corridors by normalized route family name instead of exact internal
  `routeCode`.
- Source presence can also be a false lead for a specific user journey.
  FU-SJ2 found CTP `0142` Calderon/Coronado data and proved it worked for
  San Jose-local Calderon trips, but Cartago -> Calderon still needed a ranking
  fix because the runtime already contained a near San Pedro-family drop that
  was losing to a central San Jose long walk.
- Check downstream helper ID formulas before choosing synthetic runtime IDs.
  FU-SJ1 initially tried a `97xxx` route-id range, but
  `planner_promote_ctp_variant_to_runtime` derives `ruta_puntos.id` from
  `ruta_id * 100000 + point_order`, which overflowed Postgres `integer`.
- Promotion may touch synthetic stops already shared by prior runtime seeds.
  Backup metadata before overwriting it, and make rollback restore shared stops
  instead of deleting them blindly.
- Direction sanity is separate from geometry sanity. FU-SJ1 promoted Pavas
  variants whose stops were geographically close to the Pavas probe, but all
  promoted `0014` patterns ran Pavas -> San Jose. A destination can have close
  stops and still be unreachable in the needed direction.

For local Supabase/Docker workflows in this repo, use the direct runner:

```bash
npm run ctp:inference:local -- --dryRun
npm run ctp:inference:local -- --stopBatchSize 500 --routeCodes=0002,0007,0014
```

Use `--maxStopBatches 1 --skipInferred` for a cheap smoke test, then reset
partial inference tables before a real run if the smoke was only diagnostic.

## Phase 2 - Discovery Round

Goal: compare realistic user trips against ground truth before writing specs.

Seed each discovery round with 10-20 trips:

- Commute: work, university, government offices, industrial zones.
- Commercial/event: malls, downtown shopping, stadiums, venues.
- Healthcare: major hospitals and clinics.
- Reverse direction: realistic return trips.
- Time variance: at least two commute windows such as 07:00 and 16:00.
- Boundary probes: trips that intentionally test whether the current snapshot
  should or should not cover the next province.

For each case capture:

- Exact origin and destination coordinates.
- Departure time and day.
- Moovit/source top route family.
- RAPTOR clean winner, board stop, final stop, final walk, transfer count.
- Verdict: `MATCH`, `ACCEPTABLE`, `DISAGREE`, `DATA_GAP`, or
  `COORDINATE_WATCH`.
- Root-cause read if not match.

Moovit capture levels:

| Level | Use | Caveat |
|---|---|---|
| Public stop/site page | Confirms nearby stops and route families exist. | Does not prove Moovit would recommend that family for the exact trip. |
| Search/index snippet | Useful when a live page is stale or returns `410 Gone`. | Treat as cached support only. Do not promote a case to golden on this alone. |
| Web trip planner with selected suggestions | Best browser-accessible baseline; records Moovit-selected origin/destination points. | Default departure is usually current-time unless explicitly controlled. |
| Mobile app / field QA | Best for launch-critical watches and time-window behavior. | Human/manual, but often needed for commute-sensitive services. |

Acceptance criteria:

- At least 80% `MATCH` or `ACCEPTABLE` before promoting a corridor as healthy.
- Every disagreement has a root-cause hypothesis before any fix is proposed.
- Boundary probes are not treated as bugs unless the product scope explicitly
  promises that geography.

Case-study note from San Jose connector Step 0:

- A stable 07:00/09:00/16:00 result can be more valuable than a single higher
  pass count. The first San Jose connector probe showed the same 7 expected /
  6 watches / 5 data gaps split across all three windows, which means the next
  work is probably data/source inventory rather than time-window debugging.
- Keep "connector" scope separate from "full province" scope. Cartago -> San
  Jose core and Hospital Mexico can work while Desamparados, Moravia, Escazu,
  and other local San Jose trips remain out of scope.

Discovery script template:

- Add a named case set to the outward/discovery runner instead of editing the
  main golden set first.
- Run the same case set across at least 07:00, 09:00, and 16:00 before
  diagnosing. A stable split across windows points toward coverage or ranking;
  a changing split points toward service-window data.
- Persist each run as a separate evidence doc, then write a short Step 0
  summary that names the buckets and next decision tree.

## Phase 3 - Quality Iteration

Use the cheapest honest treatment that fits the evidence.

| Finding | Preferred treatment |
|---|---|
| Golden expectation was too narrow | Add acceptable alternative with notes. |
| Route family aliases differ | Update golden/source notes, avoid new runtime logic. |
| Correct option exists but loses ranking | Corridor-specific ranking rule or existing parameterized config. |
| Correct option missing from candidates | Candidate breadth or data/snapshot investigation. |
| Runtime creates impossible journey | Runtime/result-mapper fix, not a ranking penalty. |
| Source service window is wrong | Data fix with rollback, then regenerate snapshot. |
| One-off valid but odd recommendation | Watch/defer unless it affects a core user journey. |

Data fix pattern:

1. Write audit SQL first.
2. Apply locally.
3. Write rollback SQL before remote apply.
4. Test apply -> rollback -> reapply locally.
5. Remote apply one SQL file at a time.
6. Verify counts and metadata.
7. Regenerate snapshot from remote-backed data.
8. Run full validation suite.

Runtime-promotion direction checklist:

1. Verify first and last stops for every promoted pattern.
2. Probe both directions when the user journey needs both directions.
3. If all inferred variants have the same terminal order, treat reverse coverage
   as unproven even if the source labels say `ida` and `vuelta`.
4. Do not remote-apply a multi-route bundle when one family shows a direction
   issue; split the clean family into its own package and keep the suspect
   family as a follow-up.
5. When source labels imply `ida`/`vuelta`, verify the actual first/last stop
   order instead of trusting the label. Direction names can be correct in source
   terms while still not serving the product's needed origin -> destination
   direction.

Ranking/data interaction pattern:

1. Add the missing source data locally.
2. Regenerate the local snapshot.
3. Re-run the discovery script before changing ranking.
4. If the connector exists but still loses to a worse final walk, inspect
   ranked alternatives. Prefer tightening an existing rule over adding a new
   corridor rule.
5. When comparing corridor-sharing alternatives, use normalized user-facing
   route-family names where possible. Exact internal route codes can differ
   between CTP variants even when the rider perceives the same corridor.
6. After a ranking tweak and data promotion appear to work together, run one
   quick decoupling check before remote review: validate data with the tweak,
   then temporarily disable the tweak and rerun the smallest discovery/golden
   set that proves the corridor. If the corridor fails without the tweak,
   document the deployment coupling and ship code + data together. If it still
   passes, code and data can be reviewed or deployed independently.

FU-SJ1a concrete example:

- Data + ranking tweak: Estadio Nacional and ICE Sabana became expected
  connector results with 188m and 210m final walks.
- Data alone: the `0007-B-1` route existed in the snapshot, but RAPTOR still
  preferred the long-walk trunk winners at 1175m and 1126m.
- Ranking tweak alone: no user-visible connector improvement because the route
  was absent from the runtime snapshot.

Deployment implication: the ranking code, remote SQL apply, remote-backed
snapshot regeneration, and app build must ship as one deployment window. The
SQL can land before a user-facing build, but the app only changes behavior once
the build contains both the ranking code and the regenerated snapshot.

## Phase 4 - Performance Validation

Every province expansion can change runtime cost.

Acceptance criteria:

- `raptor:test` passes.
- Golden/spot-check for existing provinces remain green.
- New discovery/golden cases pass the intended threshold.
- Native Hermes p95 stays under the current gate, ideally <5s.
- Routed pair count remains bounded. If it grows, calibrate budget from measured
  `router.route()` cost, not a guess.
- Snapshot gzip size increase is documented.

Common pitfalls:

- V8/Chrome p95 can be much better than native Hermes p95. Measure native before
  rollout decisions.
- If p95 fails to converge after a few optimization rounds, stop and review
  architecture instead of accumulating small patches.

## Phase 5 - Closeout

Each province or corridor closes with:

- Discovery matrix with source evidence.
- New goldens and known watches.
- Data fixes applied locally/remotely, including rollback files.
- Snapshot version and counts.
- Quality metrics.
- Perf metrics.
- Lessons learned that update this playbook.

Do not call a province complete because the last fix passed one script. It is
complete when the evidence package explains what is supported, what is only
acceptable, and what is deliberately deferred.

## Templates

Discovery case table:

| Case ID | User pattern | Origin | Destination | Window | Moovit/source top | RAPTOR top | Verdict | Root cause |
|---|---|---|---|---|---|---|---|---|

Data-fix checklist:

| Step | Evidence |
|---|---|
| Audit SQL identifies exact affected rows |  |
| Apply SQL has preconditions and postconditions |  |
| Rollback SQL exists before remote apply |  |
| Local apply -> rollback -> reapply tested |  |
| Remote apply verified |  |
| Snapshot regenerated from remote-backed data |  |
| Full validation suite green |  |

Snapshot strategy decision:

| Question | Evidence | Decision |
|---|---|---|
| Do boundary trips require routes absent from the current snapshot? |  |  |
| Is bundle size still acceptable with added province data? |  |  |
| Are cross-province transfers core user journeys? |  |  |
| Can separated snapshots support those transfers without awkward UX? |  |  |
