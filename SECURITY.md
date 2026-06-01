# Security

Buses CR is an early-stage transit app, not a production transit authority
system. Security work is handled in practical layers: keep secrets out of the
repo, keep Supabase policies explicit, and make location-related risks visible
before the app handles real passenger or driver data at scale.

## Reporting

Please use GitHub Security Advisories for private reports when possible. If that
is not available, open an issue with only non-sensitive details and say that you
have a private security concern.

## Current Notes

- Public Expo variables are treated as publishable client config, not secrets.
- Private tokens, local dumps, generated logs, and seed data should stay out of
  Git.
- Live bus positions currently use Supabase Realtime Broadcast while the app is
  still in validation. Before production, driver authentication and channel
  authorization should be tightened.
- Route trace SQL is useful for data work, but GPS traces are sensitive. Any
  production use should restrict read/update access to the right owners or admin
  roles instead of broad authenticated access.
- Old Mapbox or Supabase keys that were ever shared outside the repo should be
  rotated rather than trusted.
- Dependency checks currently gate high-severity advisories. Remaining moderate
  Expo-chain advisories should be handled as part of a normal SDK upgrade, not
  by forcing a major dependency jump inside a review branch.

This file is intentionally plain-spoken. It is a checklist for where the project
is today, not a claim that the app has passed a formal security audit.
