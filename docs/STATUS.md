# Project Status

## Current phase

Phase 6 — AI gateway (completed)

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

- `1dcac06` — `feat: add supabase multi-tenant schema`

## Phase 4

Status: completed

### Implemented

- Added the strict, versioned Workflow v1 Zod DSL with explicit execution target,
  trigger, node, edge, and JSON-value contracts.
- Added typed configuration schemas for all 26 allowed MVP node types. Unknown
  keys, node types, unsupported versions, path traversal, invalid filenames, and
  unsafe/unbounded configuration values are rejected.
- Added semantic validation for duplicate IDs, missing edge endpoints,
  self-references, cycles, disconnected graphs, and incompatible cloud/desktop
  execution targets.
- Added an immutable node catalog with risk level, approval mode, execution
  location, description, and version metadata.
- Added strict step-result, run, desktop-agent job/heartbeat, and AI planner
  response protocols shared across future web, API, and desktop boundaries.
- Added a deterministic execution engine with a typed executor registry, stable
  topological ordering, predecessor input propagation, dry runs, risk summaries,
  approval gates, bounded attempts/timeouts, cancellation, progress events, and
  idempotent successful-run replay.
- Added a complete mock executor registry so all node paths are testable without
  credentials, local files, or network access.

### Files changed

- `packages/workflow-schema` DSL, node schemas/catalog, semantic validator,
  protocols, and tests.
- `packages/workflow-engine` executor contracts, registry, runner, error model,
  idempotency store, and tests.
- Workspace lockfile and generated pnpm-store ignore rule.
- `docs/WORKFLOWS.md`, execution plan, and status.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 26 tests
- `pnpm db:test`: passed — unchanged migration and tenant-isolation regression
- `pnpm build:web`: passed — 6 static application routes
- `pnpm build:desktop`: not applicable — desktop app begins in Phase 8

### Known limitations

- Phase 4 intentionally supplies deterministic mock executors; real filesystem,
  spreadsheet, Google Sheets, webhook, and notification side effects are added
  only in their gated implementation phases.
- The in-memory idempotency store is process-local. Persistent run/job
  idempotency is implemented with the database and API orchestration in later
  phases.
- Workflow schema version 1 is intentionally closed to extension by AI output;
  new nodes or fields require a reviewed schema/catalog version change.

### Commit

- `af03d16` — `feat: add workflow schema and deterministic engine`

## Phase 5

Status: completed

### Implemented

- Added responsive workflow list, natural-language creation, detail, and
  immutable version routes to the dashboard.
- Added a React Flow 12 compatible, accessible, read-only node canvas with
  stable layout, edges, minimap, zoom controls, selected-node state, and a typed
  Node Inspector.
- Connected the Web UI directly to the shared Workflow v1 validator, risk
  catalog, and deterministic engine instead of duplicating their safety logic.
- Added validation feedback, execution target, folder-alias permission, bounded
  read/write, risk, and approval summaries before any activation control.
- Added a user-initiated Dry Run that invokes only the mock executor registry and
  displays structured planned-step results.
- Enforced a draft-first activation experience: an AI-created workflow cannot be
  activated until the user checks the permission/write summary.
- Added Mock draft save, new version, enable, pause, list status, version history,
  active navigation, and deterministic fixtures.
- Added Playwright configuration and a terminating Chromium E2E covering Mock
  login, device/folder context, natural-language planning, visual preview, Node
  Inspector, Dry Run, and draft save.
- Added CI browser installation and E2E execution after the production web
  build.
- Performed interactive browser QA at a 679px responsive viewport and confirmed
  the page width matches the viewport with no horizontal overflow.

### Dependency purposes

- `@xyflow/react`: official React Flow 12 package used for the accessible node
  canvas, edges, minimap, and viewport controls.
- `@playwright/test`: deterministic browser E2E runner; provider APIs, real
  credentials, and local files are not used.
- Existing workflow schema and engine workspace packages: one source of truth
  for validation, risk metadata, registry checks, and Dry Run behavior.

### Files changed

- Workflow list, creation, detail, and version App Router pages.
- Workflow composer, canvas, review, inspector, activation, navigation, icons,
  and mock fixture modules and tests.
- Playwright configuration and Mock Workflow E2E.
- Root/Web dependency metadata, CI workflow, testing docs, execution plan, and
  status.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 28 tests
- `pnpm test:e2e`: passed — 1 Chromium Mock Workflow E2E
- Browser responsive QA: passed — no horizontal overflow at 679px
- `pnpm db:test`: passed — unchanged migration and tenant-isolation regression
- `pnpm build:web`: passed
- `pnpm build:desktop`: not applicable — desktop app begins in Phase 8

### Known limitations

- Workflow persistence, Supabase Auth, and multi-user synchronization remain in
  deterministic Mock mode until the orchestration/API phases.
- Mock AI returns one validated demonstration workflow. Provider adapters and
  bounded JSON repair begin in Phase 6.
- The canvas is intentionally non-editable in this phase; the natural-language
  planner and reviewed version creation are the supported editing path.

### Commit

- `10cc4b8` — `feat: add workflow planning web experience`

## Phase 6

Status: completed

### Implemented

- Added a common AI provider interface and server-only OpenAI, Anthropic,
  Gemini, and deterministic Mock adapters.
- Configured provider-specific JSON response modes, fixed official HTTPS
  endpoints, bounded 45-second requests, 1 MB provider responses, status
  mapping, refusal/truncation handling, and secret-safe errors.
- Added a strict planner request contract with trusted execution target and
  folder-alias context, an 8,000-character prompt limit, and a 20 KB API body
  limit.
- Added exact JSON parsing and complete Workflow v1 structural and semantic
  validation. Markdown fences, invented fields, unknown nodes, code, shell
  commands, raw paths, arbitrary URLs, and malformed graphs never reach the
  executor.
- Added a repair loop bounded to zero through two retries. Repair prompts expose
  only validation codes and paths and replace the complete rejected response.
- Added redacted per-attempt usage accounting. Prompt text, output content,
  provider bodies, API keys, paths, and row data are excluded; a failed usage
  record withholds the output.
- Connected the workflow composer to the validated `/api/ai/plan` route and
  revalidates the returned planner envelope at the browser boundary.
- Added provider settings and AI-model pages that expose only availability and
  model names. Mock is always available; live providers remain disabled when
  server keys are absent.
- Added provider transport, gateway safety, environment, and browser E2E tests.
  The browser path covers planning through the Mock API, review, Dry Run, draft
  save, provider selection, and the server-secret boundary.
- Hardened the Docker database test readiness check to query the configured
  database rather than accepting a server-ready signal before database creation
  finishes.
- Added AI gateway architecture, configuration, privacy, validation, repair, and
  testing documentation with official provider references.

### Dependency purposes

- No provider SDK was added. The adapters use the platform `fetch` API and
  injected transports so tests remain deterministic and paid-service free.
- Existing Zod and Workflow v1 packages remain the single source of truth for
  request, planner-envelope, node, graph, and execution-target validation.

### Files changed

- `packages/ai-gateway` contracts, prompts, provider adapters, bounded gateway,
  strict parser, usage sinks, and tests.
- Web planner API, server adapter factory, provider environment parsing, workflow
  composer integration, settings routes, and provider settings UI.
- Mock workflow browser E2E, environment example, package metadata, and
  lockfile.
- Database test readiness condition and AI gateway, architecture, security,
  testing, execution-plan, and status documentation.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 40 tests
- `pnpm test:e2e`: passed — 1 Chromium Mock Workflow/provider settings E2E
- Browser desktop QA: passed — provider availability, model names, secret
  boundary, save interaction, and no horizontal overflow at 1265px
- `bash -n scripts/test-database.sh`: passed
- `pnpm db:test`: passed — fresh migration, RLS/role isolation, required-table
  checks, owner invariant, and idempotent seed
- PostgreSQL test container cleanup: passed
- `pnpm peers check`: passed
- `pnpm build:web`: passed without provider keys — 24 generated application
  pages including the dynamic planner API
- `pnpm build:desktop`: not applicable — desktop app begins in Phase 8

### Known limitations

- Live OpenAI, Anthropic, and Gemini requests were not attempted because no
  provider credentials are required or available. Injected transport tests
  verify their request and response contracts without external calls.
- Provider settings reflect deployment environment configuration; they do not
  persist end-user API keys.
- Phase 6 writes redacted usage to the server log. Tenant-bound persistence into
  `usage_records` is connected when authenticated run orchestration is added.
- The planner route currently participates in the application's documented Mock
  authentication mode. Tenant-scoped authorization is enforced when the
  authenticated API layer is introduced.

### Commit

- `feat: add validated multi-provider ai gateway` (this phase commit)
