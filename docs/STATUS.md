# Project Status

## Current phase

Phase 3 — Supabase Schema and Multi-tenancy (completed)

## Repository baseline

- Git repository root was resolved with `git rev-parse --show-toplevel`.
- Local repository is empty: no commits and no tracked project files existed.
- Local starting branch was the unborn `main` branch.
- Remote repository was queried directly and returned no refs.
- Work continues on `codex/ai-workflow-platform`.
- No package manager files, source code, dependencies, build scripts, tests, or
  deploy configuration existed at audit time.
- There is therefore no pre-existing build, lint, typecheck, or test command to
  run as a baseline.

## Architecture and risk baseline

- The requested monorepo architecture has no conflict with existing code because
  the repository is empty.
- The highest-risk boundaries are local filesystem authorization, multi-tenant
  database isolation, device-token/job-lease correctness, AI output validation,
  destructive-action approval, and OAuth token protection.
- Desktop release signing and live third-party integration require credentials
  that are intentionally deferred; mock modes must keep local builds and tests
  deterministic.

## Phase 0

Status: completed

### Implemented

- Audited repository root, status, files, package-manager state, and remote refs.
- Created the project rules and phase-by-phase execution plan.
- Established initial architecture, deployment, security, and testing documents.

### Files changed

- `AGENTS.md`
- `docs/EXECUTION_PLAN.md`
- `docs/STATUS.md`
- `docs/ARCHITECTURE.md`
- `docs/DEPLOYMENT.md`
- `docs/SECURITY.md`
- `docs/TESTING.md`

### Validation

- `pnpm format:check`: not applicable — workspace not created until Phase 1
- `pnpm lint`: not applicable — workspace not created until Phase 1
- `pnpm typecheck`: not applicable — workspace not created until Phase 1
- `pnpm test`: not applicable — workspace not created until Phase 1
- `pnpm build:web`: not applicable — web app not created
- `pnpm build:desktop`: not applicable — desktop app not created

### Known limitations

- This phase intentionally contains no application implementation.
- The Git remote is configured but has not yet been pushed.
- Live Supabase, AI, Google, signing, Vercel, and GitHub Release credentials are
  not available or required for this phase.

### Commit

- `78e16c3` — `chore: audit repository and establish project rules`

## Phase 1

Status: completed

### Implemented

- Added a pnpm workspace with strict Node and pnpm engine requirements and a
  single shared lockfile.
- Added strict shared TypeScript options, ESLint flat configuration, Prettier,
  Vitest, and terminating root quality scripts.
- Added the shared product identity configuration and a unit test so future
  renaming has one source of truth.
- Added dependency, build-output, local-environment, log, database, editor, and
  operating-system ignore rules.
- Added a least-privilege CI baseline with concurrency cancellation and a
  bounded job timeout.
- Resolved the initial TypeScript 7 peer mismatch by selecting the current
  TypeScript 6 line supported by `typescript-eslint`; `pnpm peers check` reports
  no remaining issues.

### Dependency purposes

- TypeScript and Node type definitions: strict cross-package static checking.
- ESLint, `@eslint/js`, and `typescript-eslint`: JavaScript and TypeScript lint
  rules, including explicit bans on `any` and TypeScript suppression comments.
- Prettier: deterministic repository formatting.
- Vitest and its V8 coverage provider: terminating unit tests and coverage.

### Files changed

- Root workspace, package, TypeScript, lint, format, Vitest, ignore, and lock
  files.
- `packages/shared` product configuration and unit test.
- `.github/workflows/ci.yml`.
- Phase documentation formatting and status.

### Validation

- `pnpm install --frozen-lockfile`: passed
- `pnpm peers check`: passed
- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 1 test
- `pnpm build:web`: not applicable — web app begins in Phase 2
- `pnpm build:desktop`: not applicable — desktop app begins in Phase 8

### Known limitations

- CI includes the required web build step, which becomes runnable after Phase 2.
- The shared support address uses the reserved `.invalid` domain until a real
  support address is configured.
- No application runtime code is part of this guardrail phase.

### Commit

- `8d1a88a` — `chore: initialize monorepo and project guardrails`

## Phase 2

Status: completed

### Implemented

- Added a Next.js 16 App Router application with React 19, Tailwind CSS 4, a
  production Turbopack build, and explicit monorepo root resolution.
- Added responsive public home, login, registration, dashboard shell, dashboard
  overview, loading, error, not-found, and generated application icon routes.
- Kept all application branding sourced from the shared product configuration.
- Added runtime environment parsing with Zod, optional provider credentials,
  safe mock-mode fallback, and redacted validation errors.
- Added a complete environment-variable example and Vercel application
  configuration without live values.
- Added server-side Mock form actions so authentication fields never appear in
  query strings or browser history.
- Added an explicit pnpm 11 build-script allowlist for Next.js image dependency
  `sharp`; all unlisted dependency build scripts remain denied.
- Browser-tested the production server at desktop and mobile breakpoints,
  verified navigation, removed the mobile navigation scrollbar, confirmed no
  horizontal overflow, and found no browser warnings or errors.

### Dependency purposes

- Next.js and React: App Router web control plane and server-rendered UI.
- Zod and `server-only`: runtime environment validation and enforced server
  credential boundary.
- Tailwind CSS, PostCSS, and the Tailwind PostCSS adapter: responsive design
  system and production CSS compilation.
- React type definitions: strict TSX checking.
- Sharp is an official transitive Next.js image dependency; only its install
  script is explicitly allowed.

### Files changed

- `apps/web` package, Next.js/Tailwind configuration, environment example, and
  Vercel configuration.
- Public, authentication, dashboard, loading, error, and not-found UI.
- Shared icon, brand, mock-mode, and environment-validation modules and tests.
- pnpm build-policy configuration and lockfile.
- Phase execution and status documentation.

### Validation

- `pnpm install`: passed
- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 4 tests
- `pnpm build:web`: passed — 6 static application routes
- Browser desktop QA: passed
- Browser mobile QA: passed — no horizontal overflow or console errors
- `pnpm build:desktop`: not applicable — desktop app begins in Phase 8

### Known limitations

- Login and registration intentionally redirect into deterministic Mock mode;
  Supabase Auth and tenant creation begin in Phase 3.
- Dashboard metrics and approval content are clearly labeled Mock data.
- Workflow, run, device, and settings detail pages begin in later phases.
- Live provider credentials are neither required nor exercised.

### Commit

- `6f71feb` — `feat: add Next.js web foundation`

## Phase 3

Status: completed

### Implemented

- Added the immutable initial Supabase migration with all 19 required platform
  tables, nine constrained status/role types, cross-tenant composite foreign
  keys, unique/check constraints, indexes, and updated-at triggers.
- Added Auth profile provisioning and an authenticated `create_tenant` function
  that atomically makes the first membership an owner.
- Added an invariant trigger that prevents the canonical tenant owner
  membership from being demoted, moved, or deleted.
- Enabled Row Level Security on every tenant-owned table with explicit member,
  owner, admin, editor, and viewer policies according to the permission model.
- Revoked public/default table and function access, withheld direct browser
  access to token/ciphertext tables, and granted only the required operations.
- Added an idempotent development seed that uses the first local Auth user and
  safely skips when no user exists.
- Added Supabase local configuration and database/type-generation documentation.
- Added a terminating Docker-based database test and wired it into CI. The test
  uses a fixed official PostgreSQL 16.13 image, no host port, no volume, and an
  exit trap that removes the container.
- Verified tenant A cannot read or write tenant B, a viewer cannot update
  workflows, an owner can update their workflow, self-demotion is blocked, RPC
  tenant creation assigns owner, all required tables exist, every tenant table
  enforces RLS, and applying the seed twice remains idempotent.

### Files changed

- `supabase/migrations/202607260001_initial_platform.sql`
- Supabase local config, seed, Auth test bootstrap, RLS tests, and seed tests.
- `scripts/test-database.sh` and root `pnpm db:test` command.
- CI database migration step.
- `docs/DATABASE.md`, generated-type directory guidance, testing docs, execution
  plan, and status.

### Validation

- `bash -n scripts/test-database.sh`: passed
- `pnpm db:test`: passed — fresh migration, RLS/role isolation, required-table
  checks, owner invariant, and idempotent seed
- PostgreSQL test container cleanup: passed — no container remains
- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 4 tests
- `pnpm peers check`: passed
- `pnpm build:web`: passed — 6 static application routes
- `pnpm build:desktop`: not applicable — desktop app begins in Phase 8

### Known limitations

- Live Supabase Auth and hosted-project migration were not attempted because no
  project credentials are required or available; local migration behavior is
  verified against fresh PostgreSQL 16.
- Database TypeScript generation requires a running Supabase local stack or a
  linked project and is documented rather than fabricated by hand.
- Service-role API routes must still perform explicit membership checks when
  they are introduced in later phases because service role bypasses RLS.

### Commit

- `feat: add supabase multi-tenant schema` (this phase commit)
