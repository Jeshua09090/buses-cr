# Planner Algorithm Roadmap

This document captures the next algorithm work for `Buses CR` after the first generation of corridor fixes, hubs, and planner lab debugging.

## Core Direction

The short version:

- Keep the current planner for now.
- Make it more `GTFS-like` instead of more ad-hoc.
- Evaluate changes against real rider cases, not intuition alone.
- Use AI for data QA and proposal generation, not as the routing engine.

## What To Improve Next

### 1. Golden Cases Before More Weight Tuning

We already reached the point where changing weights without regression cases is risky.

Every planner change should be checked against a small set of real trips:

- winner expected
- acceptable alternatives
- routes that should not win

This helps avoid the classic problem where fixing `Tejar` breaks `Cartago centro`, or where improving one destination makes an interurban route dominate local trips again.

### 2. Destination Access Quality

The current planner is much better than before, but destination access still decides too many results in a fragile way.

We should explicitly optimize for:

- final walking distance
- whether the first leg already leaves the user near the destination
- whether a transfer meaningfully improves the drop-off
- whether a transfer is just cosmetic "cleanup"

This is especially important for local trips where a rider will reject a route that technically works but leaves them on the wrong side of the zone.

### 3. Transfer Quality Scoring

We already have `stop_areas`, `boarding_points`, and `transfer_edges`.
The next step is to score them more aggressively.

Priority order:

- `same_macro` transfers
- short `nearby_walk` transfers
- clear stop-to-stop transfers with low ambiguity
- penalize transfers that cross too much walking or create little value

This is strongly aligned with OpenTripPlanner's transfer optimization approach.

### 4. Pattern and Variant Awareness

Routes like `0332` prove that "route exists" is not enough.

The planner should increasingly think in terms of:

- pattern / variant
- direction
- destination zone usefulness
- headsign-like user perception

This matters a lot for ring, loop, and branch services.

### 5. Frequency and Wait-Time

A local route that is geometrically perfect but infrequent may be worse than a slightly longer but much more available option.

The planner should incorporate:

- frequency / headway when known
- expected wait
- confidence downgrade when service coverage is weak

This is one of the biggest remaining gaps between geometry-only planning and a rider-friendly planner.

### 6. Confidence Score

We should compute planner confidence based on:

- stop geometry quality
- transfer edge quality
- route pattern coverage
- destination access quality
- whether the result came from modern runtime or legacy fallback

This can later power UI labels such as "high confidence" vs "fallback suggestion".

## Research-Backed Recommendation

### Routing Core

Long-term, the best direction for public transit routing remains a RAPTOR-style engine.

Why:

- good for transit networks
- dynamic-friendly
- handles transfers as a first-class concern
- supports multicriteria tradeoffs

References:

- RAPTOR paper: https://www.microsoft.com/en-us/research/publication/round-based-public-transit-routing/
- Transportation Science version: https://pubsonline.informs.org/doi/pdf/10.1287/trsc.2014.0534

### Transfer Optimization

For our current stack, the most useful idea to borrow immediately is OTP-style post-processing of transfers.

That means:

- prefer recommended transfer points
- avoid very short / brittle transfers
- avoid back-travel
- prefer higher-quality boarding/alighting stops

Reference:

- OpenTripPlanner RouteRequest / transferOptimization: https://docs.opentripplanner.org/en/v2.6.0/RouteRequest/

### Data Modeling

The best-practice direction is still:

- station / parent stop modeling
- correct-side stop locations
- transfer relationships
- route modeling according to rider perception

References:

- GTFS Best Practices: https://gtfs.org/documentation/schedule/schedule-best-practices/
- Google route modeling guide: https://developers.google.com/transit/gtfs/data-modeling/route-modeling-guide

## Useful External Tools

### 1. OpenTripPlanner

Best reference implementation for multimodal public transit routing.

Use it for:

- architectural reference
- transfer optimization ideas
- future benchmark comparison

Site:

- https://www.opentripplanner.org/

### 2. Conveyal R5

Very strong routing engine, especially for repeated travel-time analysis and scenario work.

Use it for:

- accessibility / one-to-many thinking
- time-window analysis
- comparing frequency and uncertainty behavior

Reference:

- https://github.com/conveyal/r5

### 3. MobilityData GTFS Validator

Best standard validator for static GTFS quality.

Use it before trusting imported schedule data.

Reference:

- https://github.com/MobilityData/gtfs-validator

### 4. gtfs-kit

Useful for quick feed analysis in Python without a DB-first workflow.

Reference:

- https://pypi.org/project/gtfs-kit/

### 5. Partridge

Fast GTFS reader / slicer for route- or date-specific analysis.

Reference:

- https://github.com/remix/partridge

### 6. QGIS + GTFS Shapes Creator

Useful when route geometry or shapes are missing or visually wrong.

Reference:

- https://plugins.qgis.org/plugins/gtfs_shapes_creator/

### 7. OneBusAway and Transiter

Useful as real-time transit backend references.
Not an immediate replacement for our app, but very valuable for:

- GTFS-Realtime thinking
- live arrival architecture
- rider-facing data APIs

References:

- https://onebusaway.org/
- https://docs.transiter.dev/

## Useful Community Signals

Community discussions consistently point to a few practical lessons:

- do not build GTFS routing from scratch if avoidable
- shapes / route geometry quality matters a lot for perceived correctness
- riders quickly lose trust when apps recommend awkward transfers or over-walking
- combining static trip planning with reliable live positions is a major differentiator

Examples:

- Reddit discussion recommending existing GTFS tooling over building from scratch:
  - https://www.reddit.com/r/gis/comments/nkye36
- Reddit discussion on open-source transit backends mentioning OTP:
  - https://www.reddit.com/r/transit/comments/1ct0zcy
- Reddit discussion showing how riders prefer live transit apps over Google Maps when routing/live times drift:
  - https://www.reddit.com/r/UIUC/comments/wvu8xy
- Recent examples of Google Maps transit suggestions being perceived as poor:
  - https://www.reddit.com/r/Seattle/comments/1s85tqo/is_google_maps_transit_navigation_completely/
  - https://www.reddit.com/r/transit/comments/1brdtk6

## Repo-Native Tools We Should Use More

### Skills

Best fits for this next stage:

- `systematic-debugging`
- `postgres-best-practices`
- `native-data-fetching`
- `kaizen`
- `lint-and-validate`
- `verification-before-completion`

### Plugins / capabilities

- GitHub plugin:
  - useful once we want reviewable planner experiments and PR feedback
- Playwright skill:
  - useful for repeatable web lab regression capture
- Test Android Apps plugin:
  - useful when validating the real mobile flow, not just the web lab

## Concrete Next Step

Build a lightweight golden-case framework:

1. define a small list of real trips
2. store expected winners / acceptable alternatives
3. run planner outputs against those expectations
4. only then adjust scoring

This should be the next algorithm milestone before another round of heavy weight tuning.
