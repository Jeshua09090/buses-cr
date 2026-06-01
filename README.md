# Buses CR

Buses CR is an open-source mobile transit project for Costa Rica, built with
Expo, React Native, Mapbox, and Supabase. The goal is simple: make bus travel
feel understandable for people who actually ride here.

The project started in Cartago because that is where the first route data,
planner cases, and live-bus experiments are deepest. That local focus is the
testing ground, not the boundary. The longer-term goal is a Costa Rica-wide
public transit app that handles the realities generic map apps often miss:
informal landmarks, overlapping route variants, ambiguous stops, transfer
points, and limited official digital data.

## What It Is

Buses CR combines three pieces of work:

- a passenger-first mobile app with a dark, map-centered interface
- driver/location tooling for live fleet visibility through Supabase Realtime
- route-planning experiments for Costa Rican bus trips, including transfer
  handling and ongoing RAPTOR runtime work

The project is currently in an algorithm-first stage. Screenshots and videos are
coming later; right now the important work is making the planner fast and honest
against real local corridors.

## Why It Matters

Public bus navigation in Costa Rica is still difficult to model digitally.
Useful trip planning requires more than drawing a route on a map:

- stops may be informal or inconsistently named
- route variants can overlap for several kilometers and then diverge
- the "nearest" stop is not always the useful stop
- transfer points may be obvious locally but invisible in raw data
- live bus visibility is sparse outside a few polished commercial experiences

Buses CR is built from that reality outward. The goal is practical transit
guidance for local riders, not another generic demo map.

## Current Capabilities

- Expo Router mobile app with passenger and driver flows
- Mapbox-based full-screen passenger map
- Supabase Realtime Broadcast for live bus position updates
- driver simulation tooling for local fleet testing
- route metadata and stop definitions for the first Cartago validation corridors
- trip-search and journey presentation experiments
- ongoing work on an in-memory RAPTOR planner fed by versioned transit snapshots
- local validation scripts for comparing planner behavior across known cases

## Technical Stack

| Layer | Technology |
| --- | --- |
| Mobile app | Expo SDK 54, React Native 0.81, React 19 |
| Language | TypeScript |
| Navigation | Expo Router v6 |
| Maps | `@rnmapbox/maps` |
| Backend | Supabase JS v2 |
| Realtime | Supabase Realtime Broadcast |
| Location | `expo-location`, `expo-task-manager` |
| UI motion | Reanimated, Gesture Handler, Gorhom Bottom Sheet |

## Algorithm Work

The main engineering focus is replacing slow database-heavy trip planning with a
mobile-friendly runtime:

- load a versioned snapshot of the transit network
- run route search in memory on device
- keep legacy planning as a fallback while the runtime matures
- validate against hand-curated local cases before widening coverage
- prefer real corridor checks over invented fixtures

This matters because public transit routing must be fast enough for a phone and
honest enough for real passengers.

See [docs/raptor-runtime.md](./docs/raptor-runtime.md) for the current public
runtime architecture and validation notes.

## For Reviewers

The repo is public while the app is still being shaped. The most useful review
surface today is the RAPTOR runtime work, the validation scripts, and the way the
mobile app keeps legacy planning available as a fallback.

Useful checks from a clean clone:

```bash
npm run lint
npx tsc --noEmit
npm run raptor:test
npm run snapshot:test
```

Some commands need Supabase data or private environment variables. When that is
the case, the docs should say so directly instead of hiding it behind a fake demo
path.

## Getting Started

Install dependencies:

```bash
npm install
```

Start the Expo dev server:

```bash
npm run start
```

Useful scripts:

```bash
npm run web
npm run lint
npm run android
```

Some features require project-specific environment variables and backend data:

- `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GOOGLE_PLACES_KEY`
- `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`
- `EAS_PROJECT_ID`, if you build through EAS
- `EXPO_PUBLIC_PARTIAL_PLANNER_PROJECT_REFS`, only for maintainer fallback data

A bare clone can run the app shell, but planner and live-fleet behavior depends
on configured Supabase data and local validation fixtures.

## Repository Layout

- `app/` - Expo Router screens and flows
- `components/` - shared mobile UI building blocks
- `context/` - app-wide state such as role/session context
- `hooks/` - reusable React Native hooks
- `lib/` - route metadata, Supabase access, location helpers, planner utilities
- `scripts/` - local simulation and development tooling
- `assets/` - app icons and static assets

## Project Status

This is an active early-stage open-source project. It is not a production transit
authority feed, a complete national dataset, or a polished app-store release.

Current priority:

- planner correctness and speed
- route and stop data quality
- reliable live-bus broadcast flows
- mobile-first passenger UX
- public documentation that makes the work easier to review and join

See [ROADMAP.md](./ROADMAP.md) for the current direction.

## Contributing

Contributions are welcome, especially in route validation, local transit data,
planner test cases, mobile UX polish, and documentation. See
[CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT. See [LICENSE](./LICENSE).
