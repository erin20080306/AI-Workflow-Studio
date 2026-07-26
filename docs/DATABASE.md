# Database

## Source of truth

Supabase PostgreSQL is the control-plane source of truth. Migration files under
`supabase/migrations` are immutable after publication. Every schema change after
the initial migration must use a new timestamped file.

The initial migration creates:

- Auth-linked profiles, tenants, and memberships.
- Devices, hashed device tokens, heartbeats, and cloud-safe folder aliases.
- Encrypted connection and AI-provider settings.
- Versioned workflows, runs, steps, approvals, jobs, and job events.
- Column mappings, usage records, and audit logs.
- Constraints, cross-tenant composite foreign keys, indexes, timestamp triggers,
  least-privilege grants, and Row Level Security.

## Local migration verification

Run:

```bash
pnpm db:test
```

The command starts an ephemeral official PostgreSQL 16 container, bootstraps only
the minimal Supabase Auth roles/functions needed by the migration, applies the
migration to a new database, executes tenant-isolation and role tests, and stops
the container. It exposes no database port and retains no volume.

This test requires Docker. It does not require a Supabase account or credentials.

## Supabase local development

With the Supabase CLI available through pnpm, the equivalent full-stack flow is:

```bash
pnpm dlx supabase start
pnpm dlx supabase db reset
```

The seed is intentionally development-only. It adds mock records for the first
local Auth user and safely does nothing if no user exists.

## Type generation

After every applied migration, regenerate types from the local database:

```bash
pnpm dlx supabase gen types typescript --local > apps/web/src/types/database.generated.ts
```

For a linked non-production project, use its project identifier:

```bash
pnpm dlx supabase gen types typescript --project-id YOUR_PROJECT_ID \
  > apps/web/src/types/database.generated.ts
```

The generated file must be reviewed and committed with the migration. It must
never contain a database URL, password, service-role key, access token, or local
absolute path. Generation against a production database is read-only but should
still use the least-privilege authenticated CLI session.

## Service-role boundary

Row Level Security is necessary but does not protect calls made with Supabase's
service role because that role bypasses RLS. Every server route using the service
role must derive the user from a verified session and explicitly confirm
membership and the required role before querying a tenant-owned row. A
client-provided `tenant_id` is never sufficient authorization.
