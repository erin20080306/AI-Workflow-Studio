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

| Phase | Scope                         | Acceptance gate                                                                  | Status    |
| ----- | ----------------------------- | -------------------------------------------------------------------------------- | --------- |
| 0     | Repository audit              | Repository state, build baseline, architecture, and risks documented             | completed |
| 1     | Monorepo and guardrails       | Install, format, lint, typecheck, and unit tests pass                            | completed |
| 2     | Next.js web foundation        | App Router shell, auth screens, mock mode, and production web build pass         | completed |
| 3     | Supabase schema and tenancy   | Fresh migrations and tenant-isolation tests pass                                 | completed |
| 4     | Workflow schema and engine    | Schema, registry, DAG, risk, dry-run, and executor tests pass                    | completed |
| 5     | Workflow web UI               | Mock workflow E2E and web build pass                                             | completed |
| 6     | AI gateway                    | Provider adapters build without keys; strict JSON and mock tests pass            | completed |
| 7     | Pairing and job API           | Token, tenant, claim, lease, and revocation tests pass                           | completed |
| 8     | Desktop agent foundation      | Development build and unsigned test package pass; folder access is constrained   | completed |
| 9     | Local Excel executor          | Fixture, idempotency, atomic output, backup, and traversal tests pass            | completed |
| 10    | Google Sheets connector       | Mock OAuth/Sheets tests pass; credentials are optional and server-only           | completed |
| 11    | Run orchestration             | End-to-end mock run, reconnect, approval, and de-duplication pass                | completed |
| 12    | GitHub release and Vercel     | CI, production web build, platform desktop builds, and secret checks pass        | completed |
| 13    | Security and final acceptance | Security review, go-live additions, and all MVP acceptance criteria pass         | completed |
| 14    | Hosted Web staging            | Hosted migrations, Auth configuration, Vercel deployment, and smoke test pass    | completed |
| 15    | Remote CI repair              | Linux quality checks and macOS/Windows package jobs pass remotely                | completed |
| 16    | Platform Admin bootstrap      | A verified Auth user has an active server-granted Super Admin role               | completed |
| 17    | AI conversation workspace     | Bilingual planner chat, safe modes, and configured model selection pass          | completed |
| 18    | Durable multi-model chat      | Authenticated streaming conversations persist with tenant isolation              | completed |
| 19    | Tool and artifact workspace   | Files, sources, tool registry, and generated artifacts are bounded and audited   | completed |
| 20    | Approval-aware execution      | Reviewed plans can dispatch idempotent jobs with explicit approval gates         | completed |
| 21    | Schedules and connectors      | Recurring runs and selected business connectors pass integration tests           | completed |
| 22    | Usage and operations          | Provider usage, quotas, billing controls, and production observability pass      | completed |
| 23    | Website Studio foundation     | Guided briefs create validated, tenant-isolated website projects                 | completed |
| 24    | AI website specification      | Multi-model guidance produces only validated component and content specs         | pending   |
| 25    | Responsive preview canvas     | Sandboxed desktop, tablet, and mobile previews remain isolated and deterministic | pending   |
| 26    | Visual editing and versions   | Natural-language and direct edits are reversible, versioned, and auditable       | pending   |
| 27    | Website publishing            | Approved builds pass quality gates and deploy without exposing credentials       | pending   |

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

## Phase 15 — Remote CI repair

Repair GitHub Actions runner bootstrap ordering so the configured pnpm version
exists before `setup-node` requests its pnpm cache. Keep third-party actions
pinned to immutable commits, make browser-test locators resilient to framework
developer tooling, and verify Linux quality/Web checks plus unsigned macOS and
Windows package jobs on the remote runners.

## Phase 16 — Platform Admin bootstrap

Verify the intended production Auth user through the protected provider
boundary, grant the initial `super_admin` role with the documented server-side
transaction, and read the resulting role record back without committing any
user identifier, email address, handle, credential, or provider response.

## Phase 17 — AI conversation workspace

Add a Codex-inspired bilingual workspace where an authenticated user can enter a
natural-language automation request, choose Auto, OpenAI, Claude, Gemini, or the
development-only Mock provider, and receive a validated Workflow v1 plan in a
conversation layout. The model picker must reflect server-side configuration
without exposing API keys. Live keys remain exclusively in Vercel server-only
environment variables. Only the platform-administration area may display
provider readiness and model names; ordinary workspace settings must not expose
provider configuration. Only Plan mode is active in this phase; Ask, Run,
attachments, and durable history must be visibly labeled as later phases.

## Phase 18 — Durable multi-model chat

Add tenant-isolated conversation and message persistence, server-side streaming,
provider-neutral chat contracts, cancellation, bounded context, usage records,
and safe conversation continuation for OpenAI, Anthropic, and Gemini.

## Phase 19 — Tool and artifact workspace

Add a typed tool registry, approved file/context attachment, source citations,
artifact previews and downloads, and auditable tool results. Tool output must be
validated and must not expand filesystem or credential authority.

## Phase 20 — Approval-aware execution

Turn a reviewed plan into a versioned workflow draft and connect explicit
approval to the existing run orchestrator and Desktop Agent. Ask and Plan remain
read-only; Run may dispatch only validated nodes and must preserve idempotency,
audit events, folder boundaries, and destructive-action approvals.

## Phase 21 — Schedules and connectors

Add recurring schedules and prioritized business connectors behind explicit
workspace authorization. Each connector must use server-only credentials,
bounded scopes, revocation, health checks, retries, and integration tests.

## Phase 22 — Usage and operations

Add provider usage and cost visibility, tenant quotas, subscription enforcement,
rate limits, operational dashboards, alerting, and a final production acceptance
pass for the expanded AI workspace. Microsoft Store subscription add-ons are the
only paid-commerce source for the first release: the application must verify and
sync Store entitlements to Supabase Tenant access without collecting payment-card
data or adding a separate Web payment processor. Plan allowances must convert
provider, generation, file-processing, and tool costs into a bounded monthly cost
budget with 80% and 95% warnings, a fail-closed 100% ceiling, auditable overrides,
and administrator-visible revenue, estimated cost, remaining allowance, and
margin reporting.

## Phase 23 — Website Studio foundation

Add a separate Website Studio product area with tenant-isolated projects and a
Codex-style guided brief. The assistant must collect purpose, audience, pages,
brand direction, content, and desired calls to action before it can create a
site draft. Projects remain drafts and cannot publish in this phase.

## Phase 24 — AI website specification

Add OpenAI, Claude, Gemini, Auto, and development Mock support for a versioned
Website Spec schema. Models may produce only validated layout, theme, content,
asset-reference, and registered-component JSON. They must never produce or
execute arbitrary JavaScript, Python, shell commands, build scripts, or
unbounded URLs.

## Phase 25 — Responsive preview canvas

Render validated Website Specs in a sandboxed preview canvas with desktop,
tablet, and mobile viewports, zoom, page navigation, loading and error states,
and strict preview-origin isolation. Add accessibility, overflow, responsive,
asset, and deterministic-render tests before any publishing work begins.

## Phase 26 — Visual editing and versions

Add natural-language section edits, direct property controls, reorder and
duplicate operations, undo/redo, named versions, comparison, and restoration.
Every model and user change must be validated, reversible, tenant-scoped, and
recorded without prompts, secrets, or unpublished private content leaking into
operational logs.

## Phase 27 — Website publishing

Add explicit publish approval, production builds, SEO metadata, sitemap,
robots, accessibility and link gates, domains, deployment history, rollback,
and credential-safe hosting integration. Publishing is a material external
action and must never occur from a model response without the authenticated
user's final approval.
