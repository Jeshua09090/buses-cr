# Security Policy

Buses CR handles location-adjacent workflows, so security reports are taken
seriously even while the project is early.

## Supported Versions

The public `main` branch is the only supported line for security reports.

## Reporting A Vulnerability

Please do not open a public issue for secrets, token leaks, account compromise,
or location/privacy vulnerabilities.

Use GitHub private vulnerability reporting if it is enabled for the repository.
If it is not enabled, contact the maintainer through the GitHub profile for the
repository owner and include:

- affected file or flow
- impact
- reproduction steps
- whether any secret, user data, or live location data is involved

## Scope

In scope:

- exposed credentials or tokens
- Supabase authorization or RLS mistakes
- location privacy issues
- unsafe driver/passenger data handling
- dependency vulnerabilities with a concrete exploit path

Out of scope:

- scanner-only reports without impact
- issues requiring access to accounts or systems you do not control
- social engineering
- denial-of-service testing against live services without permission
