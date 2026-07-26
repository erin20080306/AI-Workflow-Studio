# Execution Plan

This document is the phase gate for AI Workflow Studio. A phase may begin only
after the previous phase has passed its applicable formatting, lint, typecheck,
test, and build checks and has been committed.

## Status legend

- `completed`: implementation, validation, status update, and commit are done.
- `in-progress`: this is the only phase that may be modified.
- `pending`: implementation has not started.
- `blocked`: an external decision, permission, or credential is required.

## Phases

| Phase | Scope                         | Acceptance gate                                                                | Status    |
| ----- | ----------------------------- | ------------------------------------------------------------------------------ | --------- |
| 0     | Repository audit              | Repository state, build baseline, architecture, and risks documented           | completed |
| 1     | Monorepo and guardrails       | Install, format, lint, typecheck, and unit tests pass                          | completed |
| 2     | Next.js web foundation        | App Router shell, auth screens, mock mode, and production web build pass       | completed |
| 3     | Supabase schema and tenancy   | Fresh migrations and tenant-isolation tests pass                               | completed |
| 4     | Workflow schema and engine    | Schema, registry, DAG, risk, dry-run, and executor tests pass                  | completed |
| 5     | Workflow web UI               | Mock workflow E2E and web build pass                                           | completed |
| 6     | AI gateway                    | Provider adapters build without keys; strict JSON and mock tests pass          | completed |
| 7     | Pairing and job API           | Token, tenant, claim, lease, and revocation tests pass                         | completed |
| 8     | Desktop agent foundation      | Development build and unsigned test package pass; folder access is constrained | completed |
| 9     | Local Excel executor          | Fixture, idempotency, atomic output, backup, and traversal tests pass          | completed |
| 10    | Google Sheets connector       | Mock OAuth/Sheets tests pass; credentials are optional and server-only         | completed |
| 11    | Run orchestration             | End-to-end mock run, reconnect, approval, and de-duplication pass              | completed |
| 12    | GitHub release and Vercel     | CI, production web build, platform desktop builds, and secret checks pass      | completed |
| 13    | Security and final acceptance | Security review, go-live additions, and all MVP acceptance criteria pass       | completed |
| 14    | Hosted Web staging            | Hosted migrations, Auth configuration, Vercel deployment, and smoke test pass  | completed |

## Phase 0 — Repository audit

### Deliverables

- Confirm Git root, branch, remote state, tracked files, and package-manager state.
- Record the build and test baseline without inventing unavailable commands.
- Establish project rules and the required documentation skeleton.
- Record architectural decisions, deployment boundaries, security invariants, and
  the testing strategy.

### Gate

- The empty-repository baseline is recorded in `docs/STATUS.md`.
- Repository paths were discovered rather than assumed.
- No application implementation or dependency installation is included.

## Phase 1 — Monorepo and guardrails

Create the pnpm workspace, root scripts, shared TypeScript configuration,
Prettier, ESLint, Vitest, Git ignores, CI baseline, and product configuration.
All required quality commands must execute successfully before the phase is
committed.

## Phase 2 — Next.js web foundation

Create the web app with App Router, Tailwind CSS, accessible public/auth screens,
dashboard shell, loading and error UI, environment validation, and a deterministic
mock mode.

## Phase 3 — Supabase schema and tenancy

Add immutable SQL migrations for the required tenant-owned tables, constraints,
indexes, triggers, Row Level Security policies, development seed data, and
database setup/type-generation documentation.

## Phase 4 — Workflow schema and engine

Implement the versioned Zod DSL, node registry, semantic/DAG validation, risk
classification, dry runs, deterministic execution contracts, cancellation,
timeouts, retries, and idempotency.

## Phase 5 — Workflow web UI

Implement workflow list, creation, detail/version views, node canvas, inspector,
validation feedback, risk summary, permission summary, approvals, and dry-run
experience.

## Phase 6 — AI gateway

Implement the common provider interface, server-only OpenAI/Anthropic/Gemini
adapters, mock adapter, bounded repair loop, strict JSON validation, provider
availability UI, and redacted usage accounting.

## Phase 7 — Pairing and job API

Implement pairing codes, hashed device tokens, heartbeat, pending job discovery,
atomic claim, leases, progress, completion/failure, revocation, tenant checks,
timestamps, and idempotency.

## Phase 8 — Desktop agent foundation

Create the Electron application, pair/status/folder UI, tray behavior, local
secure storage, reconnecting job client, structured redacted logs, startup
setting, privacy controls, and user-initiated update flow.

## Phase 9 — Local Excel executor

Implement authorized file access, watcher behavior, Excel/CSV readers and
writers, transformations, size/row/sheet limits, hashing, temporary output,
atomic rename, backup, and duplicate suppression.

## Phase 10 — Google Sheets connector

Implement independent OAuth connections, encrypted refresh tokens, refresh and
revoke behavior, health checks, lists, read/append/update/sync operations, batch
requests, bounded exponential backoff, and mock integration tests.

## Phase 11 — Run orchestration

Connect cloud run creation, approvals, agent jobs, leases, step progress, retry,
cancel, timeout, reconnection, audit logs, notifications, and run detail UI.

## Phase 12 — GitHub release and Vercel

Complete least-privilege CI and cross-platform desktop release workflows,
checksums, signing-aware metadata, Vercel workspace configuration, production
environment checklist, and release checklist.

## Phase 13 — Security and final acceptance

Review dependencies, RLS, API authorization, path containment, token handling,
client bundles, redaction, destructive actions, documentation, troubleshooting,
and the complete MVP acceptance path. The user-requested go-live scope also
includes real Supabase registration/session/Tenant onboarding, a separately
authorized platform Super Admin, subscription entitlements, bilingual
Traditional Chinese/English product UI, branded Store assets, and truthful
deployment/release verification. External publication remains blocked until its
corresponding provider access and release requirements are available.

## Phase 14 — Hosted Web staging

Configure the explicitly authorized hosted Supabase and Vercel projects without
committing provider credentials. Match the hosted PostgreSQL major version,
apply and verify immutable migrations, configure secure Auth redirects and
confirmation controls, store server-only values in protected Vercel environment
variables, deploy the Web workspace, and smoke-test the real registration and
session boundary.
