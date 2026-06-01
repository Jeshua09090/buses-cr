# Contributing

Thanks for helping improve Buses CR.

This project is still early, so the best contributions are concrete and
verifiable. Local knowledge is especially valuable.

## Good First Areas

- document real bus corridors, stops, route variants, and transfer points
- add small planner validation cases with clear origin/destination context
- improve mobile accessibility, loading states, and map interaction polish
- simplify setup instructions and environment documentation
- report confusing route results with enough detail to reproduce them

## Local Setup

```bash
npm install
npm run start
```

For linting:

```bash
npm run lint
```

Some planner and live-fleet paths require project-specific Supabase data and
tokens. If a flow cannot be reproduced from a clean clone, describe the missing
data rather than guessing.

## Contribution Style

- Keep changes focused on one concern.
- Prefer TypeScript for app code.
- Use `@rnmapbox/maps` for maps.
- Do not commit secrets, tokens, local logs, or private datasets.
- For transit data changes, include the route/corridor and why the change is
  locally valid.
- For planner changes, include at least one before/after case or validation
  note.

## Reporting Route Issues

When reporting a route-planning issue, include:

- origin and destination
- approximate desired departure time
- expected route or transfer behavior
- actual route shown by the app
- whether the issue is about walking, waiting, route choice, transfer point, or
  missing data

## Pull Requests

Before opening a pull request:

- run the smallest relevant check you can
- keep screenshots optional unless the change is visual
- explain any data assumptions
- call out work that still needs real-world validation
