# Roadmap

Buses CR is being built in small, validation-heavy steps. The goal is not to
pretend the whole country is solved at once; it is to make each corridor more
honest before widening coverage.

## Now

- Improve route-planning quality in the first Cartago validation corridors.
- Validate the in-memory RAPTOR runtime against real local trips.
- Keep live bus position updates lightweight with Supabase Realtime Broadcast.
- Preserve a mobile-first map interface for passengers.
- Make the public repository easier to understand and contribute to.

## Next

- Publish clearer sample validation cases for planner behavior.
- Expand route and stop coverage beyond the current Cartago-heavy validation set.
- Improve onboarding and environment setup for contributors.
- Harden driver tracking flows and background location behavior.
- Add more public documentation around transit data assumptions.

## Later

- Broaden Costa Rica coverage corridor by corridor.
- Support richer service status, alerts, and route-change history.
- Improve offline-friendly behavior for common passenger flows.
- Package reusable planner/data tooling where it can help other transit projects.

## Non-Goals For Now

- No production guarantee for official transit coverage.
- No frequent database writes for live bus positions.
- No desktop-first redesign.
- No default-on planner runtime until enough real-world validation passes.
