# Project Status

## Current phase

Phase 51 — Visible Drive click hardening (in progress; direct local transfer hardening complete, large real-Drive canary pending)

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

- `c7e5b9f` — `feat: add validated multi-provider ai gateway`

## Phase 7

Status: completed

### Implemented

- Added strict pairing, heartbeat, claim, lease, progress, completion, failure,
  and revocation schemas and a common Agent protocol service.
- Added 12-character, ten-minute, single-use pairing codes and 256-bit device
  and claim tokens. Only domain-separated HMAC-SHA-256 values and bounded hints
  are retained; plaintext device and claim tokens are returned exactly once.
- Added 90-day device-token expiry, explicit revocation, last-used tracking, and
  a five-minute past/30-second future request-timestamp window.
- Derived tenant and device identity exclusively from the authenticated token.
  Job lookup and every state transition recheck tenant, device, status, attempt,
  lease, and claim-token ownership.
- Added polling for pending and expired-leased work, atomic active-claim
  exclusion, reclaim after lease expiry, 30–120 second lease renewal, structured
  progress, structured failure, terminal completion, and event-level
  idempotency.
- Added an immutable PostgreSQL migration with the protected pairing-code table,
  Agent event UUID uniqueness, row-locked terminal transitions, and
  service-role-only claim, lease, progress, and finish functions.
- Updated the database test runner to discover and apply every immutable
  migration in filename order.
- Added all required Next.js Agent API routes with strict 32 KB bodies,
  no-store responses, redacted errors, device-token headers, request timestamps,
  and separate claim credentials.
- Added a fail-closed server boundary: Mock mode uses the real protocol state
  machine with an in-memory store and one safe seeded job; configured production
  mode does not silently use process memory when authenticated Supabase
  repository context is unavailable.
- Added a full API E2E covering pair, heartbeat, poll, duplicate claim, lease,
  duplicate progress, duplicate completion, revoke, and old-token rejection.
- Added protocol, database, architecture, testing, and security documentation.

### Dependency purposes

- No new third-party runtime dependency was added. The package uses Node's
  cryptographic random and HMAC primitives, existing Zod schemas, and the shared
  Workflow v1 protocol.
- The Web app links the new `@ai-workflow-studio/agent-protocol` workspace
  package so API and future Electron code share the same contracts.

### Files changed

- `packages/agent-protocol` crypto, schemas, service, store, errors, and tests.
- Pairing, heartbeat, jobs, claim, lease, progress, complete, fail, and revoke
  App Router API handlers plus server/API helpers.
- `202607260002_agent_pairing_jobs.sql`, Agent Job database assertions, and the
  multi-migration database test runner.
- Agent protocol browser E2E, workspace metadata, lockfile, and phase
  documentation.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 48 tests
- `pnpm test:e2e`: passed — 2 Chromium E2Es
- `bash -n scripts/test-database.sh`: passed
- `pnpm db:test`: passed — all migrations, RLS/role isolation, hidden pairing
  hashes, service-role function boundary, tenant/device atomic claims, active
  duplicate-claim rejection, claim-token leases, expired leases, event
  idempotency, owner invariant, and idempotent seed
- PostgreSQL test container cleanup: passed
- `pnpm peers check`: passed
- `pnpm build:web`: passed without Supabase or Agent secrets — 28 generated
  application pages including all 10 Agent API routes
- `pnpm build:desktop`: not applicable — desktop app begins in Phase 8

### Known limitations

- The live Supabase-backed Agent repository and authenticated web session
  adapter are intentionally not fabricated without project credentials. A
  non-Mock deployment returns a redacted 503 until those are configured and
  connected; PostgreSQL production state-transition functions are present and
  integration-tested.
- Mock Agent state is process-local and resets when the Web development server
  restarts. It must never be used as production job storage.
- Edge/WAF pairing attempt rate limits and abuse monitoring are deployment
  controls still required before enabling public pairing in production.
- Agent local secure storage, offline polling/reconnection, and user-facing
  pairing UI begin in Phase 8.

### Commit

- `993aaba` — `feat: add secure device pairing and agent job api`

## Phase 8

Status: completed

### Implemented

- Added the Electron 43 Desktop Agent with separate Vite main, preload, and
  React renderer bundles plus an Electron Builder development package.
- Added pairing, connection and heartbeat status, pending-job count, explicit
  executor start/stop, unpair, privacy, startup, folder permission, activity,
  tray, and manual update experiences.
- Added a strict Agent client that stores no token in renderer state, uses
  authenticated protocol headers, validates bounded responses, aborts cleanly,
  and reconnects with 5–60 second exponential delays.
- Added OS-backed asynchronous `safeStorage` encryption, atomic `0600` session
  persistence, re-encryption support, and fail-closed handling for unavailable
  or Linux `basic_text` storage.
- Added system-picker-only local folder grants with canonical real paths,
  device ownership, separate read/write/watch permissions, cloud-safe aliases,
  traversal rejection, symlink-escape rejection, and revocation.
- Added structured JSONL logging that recursively masks credentials, tokens,
  absolute paths, email addresses, and row-like values before memory or disk.
- Added a sandboxed renderer with context isolation, no Node integration, denied
  navigation/windows/webviews/permissions, restrictive CSP, a constrained asset
  protocol, sender validation, strict IPC schemas, and an exact preload bridge.
- Added a user-initiated update controller with automatic download and
  install-on-quit disabled. Unsigned artifacts remain explicitly limited to
  development packaging.
- Serialized the two full Playwright flows and gave each workflow a bounded
  90-second budget so concurrent Next.js development cold compilation cannot
  create a false timeout.
- Added desktop architecture, operation, storage, security, testing, and
  packaging documentation.

### Dependency purposes

- `electron` provides the native main, renderer, tray, system dialog, secure
  storage, startup, and sandbox boundaries.
- `vite` and `@vitejs/plugin-react` create isolated deterministic bundles for
  the main, preload, and renderer processes.
- `electron-builder` creates the native development package, while
  `electron-updater` implements an explicit user-controlled update state
  machine.
- Existing React, Zod, Agent protocol, and shared workspace packages provide the
  renderer, runtime validation, authenticated contracts, and product identity.

### Files changed

- `apps/desktop` application, renderer, preload, main-process services,
  packaging configuration, and tests.
- Exported the Agent job type for the shared desktop protocol client.
- Workspace dependency allowlist, lockfile, stable E2E worker configuration,
  architecture, security, testing, deployment, execution plan, and Desktop
  Agent documentation.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 56 tests
- Desktop security tests: passed — encrypted session, secure-storage fail
  closed, log redaction, path traversal, symlink escape, device ownership,
  missing permission, polling authentication, reconnect, and shutdown
- `pnpm test:e2e`: passed — 2 Chromium E2Es
- `pnpm db:test`: passed — all migrations and tenancy/Agent protocol assertions
- `pnpm peers check`: passed
- `pnpm build:web`: passed without optional provider or deployment credentials
- `pnpm build:desktop`: passed — Electron main, preload, and renderer bundles
- Compiled main-process path audit: passed — no invalid transformed
  `import.meta.dirname` access remains
- Desktop renderer QA: passed — pairing, overview, executor, folder grant,
  activity/settings, update controls, responsive width, and semantic structure
- Unsigned native package gate: passed — macOS arm64 unpacked development
  application; signing identity intentionally disabled

### Known limitations

- Phase 8 establishes the secure local boundary but intentionally does not
  execute Excel or CSV jobs. File watching, transformations, atomic output,
  backups, hashes, and duplicate suppression begin in Phase 9.
- The current native package is unsigned, uses Electron's default application
  icon, and is not a distributable production release. Native signing,
  installers, checksums, update metadata, and platform CI are Phase 12 gates.
- The live cloud Agent repository still requires authenticated Supabase
  configuration; the deterministic Mock protocol remains the development path.
- Startup behavior and OS encryption use platform APIs and require native
  Windows/macOS release-runner coverage before production distribution.

### Commit

- `8733475` — `feat: add secure electron desktop agent foundation`

## Phase 9

Status: completed

### Implemented

- Added the `@ai-workflow-studio/local-executor` package with bounded `.xlsx`
  and independent CSV readers, deterministic merge, mapping, filters, and
  first/last deduplication.
- Added an `.xlsx` central-directory safety scan before ExcelJS parsing. It
  rejects encryption, traversal entries, VBA, embedded objects, external
  workbook links, excessive entry counts, excessive expansion, and suspicious
  compression ratios.
- Added closed scalar conversion that never evaluates formulas. Formula text is
  discarded, hyperlink targets and execution-irrelevant workbook nodes are
  ignored, and only cached safe scalar results can enter the local dataset.
- Added explicit defaults for compressed size, uncompressed size, entry count,
  compression ratio, row, sheet, column, and header limits. Unsupported `.xls`,
  `.xlsm`, and other formats fail with structured errors.
- Added private same-directory temporary output, flush, full reread validation,
  SHA-256 verification, exclusive output locking, atomic rename, source
  preservation, existing-output rejection, and cleanup on every exit path.
- Added a lower-level overwrite safeguard that requires a backup and verifies
  its SHA-256 before replacing the destination. Current Workflow v1 output
  schemas continue to allow only `overwrite: false`.
- Added CSV formula-injection neutralization and rejected multi-table CSV writes
  until the caller explicitly merges them.
- Added a serialized, private, atomic processing ledger that hashes workflow
  context plus sorted input hashes. Successful receipts suppress the same input
  after an Agent restart without persisting paths or workflow identifiers.
- Added a stabilized, non-recursive folder watcher with safe single-segment
  patterns, no symlink following, canonical containment checks, content hashes,
  stable-write delay, and unchanged-content suppression.
- Bound the executor to `FolderGrantStore`, including new authorized-output and
  authorized-root resolution. Lexical traversal is rejected before filesystem
  lookup, and real-path/symlink containment is rechecked afterward.
- Added a single-instance Electron lock so two Agent processes cannot race the
  local receipt ledger.
- Bundled the executor into the Electron main process, kept all Node built-ins
  as runtime imports, and excluded workspace source, tests, and source maps from
  the packaged ASAR.
- Added a root README plus complete Excel/CSV design, security, test, limits,
  and MVP limitation documentation.

### Dependency purposes

- `exceljs` 4.4.0 reads and writes `.xlsx` and CSV without executing workbook
  code or requiring Microsoft Excel.
- `yauzl` 3.4.0 performs lazy ZIP metadata inspection before workbook parsing.
- `chokidar` 5.0.0 provides cross-platform stabilized file create/change
  observation with symlink following disabled.
- Zod validates local executor limits and the private receipt ledger.

### Files changed

- `packages/local-executor` types, errors, hashing, ZIP inspection, Excel/CSV
  readers and writers, transformations, watcher, processing ledger, and real
  fixture tests.
- Desktop authorized output/root resolution, local executor binding,
  single-instance startup, build configuration, dependency metadata, and
  integration tests.
- Root README, Excel executor documentation, architecture, security, testing,
  Desktop Agent, execution plan, status, workspace metadata, and lockfile.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed — all 8 code workspaces
- `pnpm test`: passed — 64 tests across 14 files
- Real spreadsheet fixtures: passed — two-sheet `.xlsx`, cached formula value,
  CSV, merge, filter, map, deduplicate, safe output, backup, limits, and hash
- Authorized desktop integration: passed — alias-bound read/write, source
  preservation, lexical traversal rejection, symlink escape rejection, and
  restart duplicate suppression
- Folder watcher fixture: passed — stabilized create event and unchanged-hash
  suppression
- `pnpm test:e2e`: passed — 2 Chromium E2Es
- `pnpm db:test`: passed — all migrations and tenancy/Agent protocol assertions
- `pnpm peers check`: passed
- `pnpm build:web`: passed — 28 generated pages without optional credentials
- `pnpm build:desktop`: passed — 1.1 MB main bundle plus isolated preload and
  renderer; built-in module and runtime-path audits passed
- Unsigned native package gate: passed — macOS arm64 unpacked development app
- Packaged ASAR audit: passed — no workspace TypeScript source, test/spec files,
  source maps, invalid browser built-in shims, or credential signatures

### Known limitations

- Phase 9 intentionally stopped at the local executor boundary. Phase 11 now
  binds it to claimed, leased jobs with metadata-only progress and completion.
- `.xls`, `.xlsm`, VBA, embedded objects, external workbook links, pivot-table
  fidelity, native charts, external connections, and complex style preservation
  are outside the MVP.
- Processing is bounded in memory rather than streaming multi-million-row
  workbooks. Configured limits fail closed before execution.
- Folder watchers cover the authorized root and direct children, not arbitrary
  recursive directory trees.
- The native artifact remains unsigned and uses the default Electron icon until
  the Phase 12 release gate.

### Commit

- `feat: add safe local spreadsheet executor` (this phase commit)

## Phase 10

Status: completed

### Implemented

- Added `@ai-workflow-studio/google-sheets` with strict OAuth, token encryption,
  connection lifecycle, and bounded REST client contracts.
- Added Google web-server OAuth start and callback routes with 256-bit state,
  PKCE S256, offline consent, HttpOnly callback-scoped cookies, constant-time
  state comparison, bounded inputs, and generic browser errors.
- Requested only Sheets read/write and Drive metadata-read scopes. A connection
  is rejected unless the exchange includes a refresh token and both scopes.
- Added versioned AES-256-GCM envelopes with independent access/refresh
  ciphertext and tenant/connection/token-kind authenticated context. Token-free
  views are the only connection type returned to browser components.
- Added automatic access-token refresh, encrypted token replacement, remote
  revoke with unconditional local credential clearing, connection health state,
  spreadsheet metadata list, and sheet metadata list.
- Added runtime-validated read, append, batch update, and deterministic keyed
  sync operations. Requests are capped at 2 MB, responses at 5 MB, and all row,
  column, range, and batch dimensions are bounded.
- Added capped exponential backoff with jitter and bounded `Retry-After` support
  for safe reads and idempotent writes. Ambiguous append outcomes stop without
  retry to avoid duplicate rows.
- Added request-hash idempotency with completed-result replay, active/different
  input conflict, and permanent ambiguous-append suppression.
- Added a service-only `connection_operations` migration with tenant-bound
  foreign keys and atomic claim/finish/release functions. Authenticated clients
  cannot read connection ciphertext, operation rows, or call the write-claim
  functions.
- Added an accessible connection settings page with health checks, spreadsheet
  metadata, two-step revoke, OAuth result feedback, explicit Mock labeling, and
  no token fields.
- Added complete connector, OAuth, encryption, retry, idempotency, Mock, limits,
  deployment, and production-adapter documentation.

### Dependency purposes

- The package uses the platform `fetch`, Web APIs, Node cryptography, and the
  existing Zod runtime validator; no Google SDK or new third-party runtime
  dependency is required.
- Workspace linking adds the connector to the Next.js server boundary without
  placing credentials in a client package.

### Files changed

- `packages/google-sheets` OAuth, cipher, client, connection service, errors,
  types, exports, and Mock integration tests.
- Google connection API routes, server adapter, settings UI, environment
  validation, and browser E2E coverage.
- Durable connection-operation migration, RLS/privilege tests, and database test
  runner.
- Root workspace metadata, environment example, README, Google connector guide,
  architecture, security, testing, deployment, execution plan, and status.

### Validation

- `pnpm install`: passed — no new third-party dependency
- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 75 tests across 15 files, including 10 Google connector
  integration tests
- `pnpm test:e2e`: passed — 2 Chromium E2Es, including Google health metadata
  and browser token-absence assertions
- `pnpm db:test`: passed — fresh migrations, tenant isolation, server-only
  operation claims, conflict, replay, and foreign-key enforcement
- `pnpm peers check`: passed
- `pnpm build:web`: passed without Google or other optional credentials
- `pnpm build:desktop`: passed as a connector regression gate
- Browser QA: passed — no horizontal overflow, console errors, or credential
  values; health interaction rendered both Mock spreadsheets

### Known limitations

- The current Next.js Mock boundary persists encrypted connections in memory.
  Production must implement the existing repository ports with an authenticated
  Supabase tenant adapter before live OAuth routes are enabled.
- Drive access is intentionally metadata-only. The connector does not create,
  delete, share, move, or change permissions on Drive files.
- Sync updates the explicitly configured range and pads removed trailing rows
  within the prior returned height. It does not clear cells outside that range.
- A genuinely ambiguous append is not automatically recoverable. An operator
  must inspect the destination before deciding whether to issue a new operation
  with a new idempotency key.

### Commit

- `feat: add secure google sheets connector` (this phase commit)

## Phase 11

Status: completed

### Implemented

- Added `@ai-workflow-studio/run-orchestrator` with tenant/role checks,
  Workflow/target validation, input-bound start idempotency, a closed Run state
  machine, approval expiry, bounded attempts, automatic/manual retry,
  cancellation, timeout sweep, metadata-only audit entries, and notifications.
- Approval now holds write-capable Workflows before Job creation. Approved Runs
  dispatch one device-bound Job; rejection and expiry dispatch none.
- Added Run list/details APIs and responsive dashboard views with step counts,
  safe structured errors, approval risk counts, retry, two-click cancellation,
  refresh/polling, audit timeline, and notifications.
- Synchronized Agent progress, completion, and failure routes into the Run
  state machine. Duplicate UUID events are replay-safe and success is rejected
  until every Workflow step is terminal and successful/skipped.
- Added Agent-store cancellation and duplicate dispatch suppression.
- Extended the Electron Agent from heartbeat/poll-only behavior to atomic claim,
  120-second renewable leases, registered local Workflow execution,
  metadata-only progress, completion/failure, bounded reconnect, and
  lease-loss cancellation.
- Bound the local Workflow engine to authorized `folder.list_files`,
  Excel read/merge/write/report, filter, column-map, and deduplicate nodes.
  Folder listing is capped, non-recursive, and symlink-safe; persistent output
  receipts prevent duplicate writes after restart/reclaim.
- Added durable Run attempt/timeout/cancellation fields, Agent event UUID
  uniqueness, notifications with tenant RLS, authenticated write revocation,
  and the service-only compare-and-set `transition_workflow_run` database
  function.
- Added the Run orchestration operational guide and updated Agent, Excel,
  architecture, security, testing, and project documentation.

### Dependency purposes

- The new orchestration package uses the existing Workflow schema, Node
  registry contracts, Zod validation, and Node cryptography; no new third-party
  runtime dependency was introduced.
- The Desktop workspace links the existing Workflow engine/schema packages so
  a claimed Job can execute the same validated Workflow v1 document locally.

### Files changed

- `packages/run-orchestrator` state machine, store, types, errors, exports, and
  orchestration tests.
- Run APIs, Agent synchronization routes, Run list/details UI, and Mock
  control-plane adapter.
- Desktop Agent claim/lease/report loop, registered local Job executor, safe
  folder listing, and integration tests.
- Run orchestration migration, RLS/transition tests, database runner, E2Es,
  workspace metadata, and documentation.

### Validation

- `pnpm install`: passed — workspace links only; no new third-party dependency
- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed — all 10 code workspaces
- `pnpm test`: passed — 82 tests across 17 files
- `pnpm test:e2e`: passed — 2 Chromium E2Es, including offline reconnect,
  approval-before-dispatch, one active claim, four step events, duplicate event
  replay, completion, and Run detail assertions
- `pnpm db:test`: passed — all fresh migrations, tenant isolation,
  authenticated privilege denial, valid compare-and-set transitions, invalid
  transition rejection, audit entries, and notification assertions
- `pnpm peers check`: passed
- `pnpm build:web`: passed — 34 generated pages without optional credentials
- `pnpm build:desktop`: passed
- Unsigned native package gate: passed — macOS arm64 unpacked development app
- Browser QA: passed — no horizontal overflow or console warnings; approval,
  queued state, two-click cancellation, step cancellation, audit, and
  notification updates rendered correctly

### Known limitations

- Mock Run/Agent stores are process-local. Production must wire the existing
  repository and dispatcher ports to authenticated Supabase/service-role
  adapters; configured non-Mock mode currently fails closed.
- Device cancellation is observed at the next lease renewal rather than through
  a local push channel.
- The local Job executor deliberately supports only the Phase 9 registered
  spreadsheet subset. Unsupported, cloud-only, or destructive file nodes fail
  closed.
- The macOS development package remains unsigned and is not a production
  installer. Native signed release artifacts are Phase 12 gates.

### Commit

- `feat: connect cloud and desktop run orchestration` (this phase commit)

## Phase 12

Status: completed locally

### Implemented

- Converted CI into a reusable, least-privilege workflow with full-SHA-pinned
  GitHub actions, the existing quality/Web gates, and a native macOS/Windows
  unsigned development-package matrix.
- Added a tag-driven Desktop release workflow. Semantic-version prerelease tags
  publish explicitly marked unsigned GitHub Prereleases for controlled testing;
  stable tags require macOS Developer ID signing/notarization and Windows
  Authenticode, verify both platforms, and create a draft release for human
  approval.
- Limited `contents: write` to the final release job. Build and validation jobs
  retain read-only repository access.
- Split Electron Builder into a production signing configuration and an
  explicitly unsigned prerelease/development configuration. Added hardened
  macOS Electron entitlements without disabling library validation.
- Added streaming release-artifact controls for SHA-256 generation and
  verification, signing-aware machine-readable JSON metadata, tag/package
  version consistency, safe in-bundle symlinks, path traversal denial, and scans
  for credential files, private key markers, provider-token patterns, and local
  workspace paths.
- Added production environment and desktop release checklists covering Vercel,
  Supabase, OAuth, server-only variables, registration readiness, Super Admin
  bootstrap safety, zero-cost unsigned testing, stable signing, Microsoft Store
  MSIX as the planned zero-certificate-cost Windows channel, rollback, and
  incident response.
- Added a Windows-only manual Store draft workflow for x64/arm64 AppX packages,
  Partner Center identity verification, artifact scanning, SHA-256 metadata, and
  seven-day Actions retention. It has no Store credentials or submission step.
- Added the Partner Center-assigned Identity Name, Publisher, Publisher Display
  Name, Traditional Chinese/English language declarations, and Windows version
  bounds to a dedicated Store packaging configuration. Draft filenames are
  deliberately marked `DRAFT-DO-NOT-SUBMIT`.
- Confirmed the existing Vercel monorepo boundary: Root Directory `apps/web`,
  frozen pnpm install, Next.js Web-only build, and no Desktop/local executor in
  the deployment.
- The project owner completed Microsoft Partner Center developer enrollment and
  reserved the `AI Workflow Studio` MSIX/PWA product identity. No Store package,
  submission, signing, certification, or publication was completed.

### Dependency purposes

- No third-party dependency was added. Release hashing, scanning, metadata, and
  verification use Node.js standard-library APIs.
- GitHub workflows use only official `actions/*` artifact and setup actions,
  pinned to immutable commit SHAs, plus the preinstalled GitHub CLI.

### Files changed

- Reusable CI and tag-driven Desktop release workflows.
- Electron production/prerelease/Store packaging configurations and macOS
  entitlements.
- Manual Microsoft Store package draft workflow.
- Release artifact CLI and four focused tests.
- Vercel production and release checklists, deployment documentation, workspace
  scripts, test discovery, and formatting exclusions.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed — all 10 code workspaces
- `pnpm test`: passed — 86 tests across 18 files, including four release
  artifact controls
- `pnpm test:e2e`: passed — both Chromium acceptance paths
- `pnpm db:test`: passed — fresh migrations, RLS, tenant isolation, service
  boundaries, and orchestration transitions
- `pnpm peers check`: passed
- `pnpm build:web`: passed — 34 generated pages; the sandbox-only Turbopack port
  restriction was resolved by running the same build outside the sandbox
- `pnpm build:desktop`: passed
- Native macOS arm64 unpacked development package: passed
- Unsigned macOS arm64 DMG/ZIP prerelease package: passed
- Unsigned Windows x64 unpacked/NSIS prerelease cross-package: passed
- Packaged-artifact sensitive material/local path scan: passed across the
  macOS and Windows outputs
- Workflow YAML parse check: passed
- Partner Center Store identity configuration: Electron Builder accepted the
  values and reached the Windows `makeappx` tool boundary

### Known limitations

- The new GitHub workflows have not run on remote hosted runners because this
  branch has not been pushed. Native Windows CI, GitHub Prerelease publication,
  stable signing checks, checksums downloaded from Actions, and GitHub Release
  creation must not be claimed as executed.
- Stable public direct-download releases intentionally fail without paid signing
  credentials. Unsigned GitHub artifacts are prerelease-only.
- Microsoft Store can sign an accepted AppX/MSIX without a certificate fee, and
  its product identity is reserved. Native Windows Store packaging has not run
  because this branch is not on a Windows hosted runner; the local macOS attempt
  correctly stopped at the Windows-only `makeappx` boundary. Certification and
  clean-machine install/update tests are also pending.
- Desktop packages still use Electron's default icon. Branded icons and the
  bilingual professional design pass remain later work.
- Nothing has been deployed to Vercel or Supabase. Real Auth, production
  repository adapters, platform Super Admin, subscriptions, and billing remain
  go-live blockers.

### Commit

- `ci: add release and deployment controls` (this phase commit)

## Phase 13

Status: completed

### Implemented

- Audited the dependency graph and replaced vulnerable transitive versions with
  scoped pnpm workspace overrides. `pnpm audit --audit-level high` now reports
  no known vulnerabilities.
- Added official Supabase SSR browser/server clients, per-request cookie refresh,
  verified-claim session context, registration, confirmation, login, recovery,
  password update with local-session revocation, logout, and guarded Tenant
  onboarding.
- Derived non-Mock Web actors from the verified user, Tenant membership, role,
  and subscription context. Paid AI providers and Google OAuth require that
  authenticated workspace boundary; unavailable durable production adapters
  continue to fail closed.
- Added a separately authorized platform administrator model with
  `super_admin`, `billing_admin`, and `support` roles, protected `/admin`
  operations, and append-only plan-change audit evidence. No administrator
  email, password, token, or user-specific bootstrap is stored or seeded.
- Added public Free, Pro, Team, and Business plans, bilingual TWD pricing,
  automatic Free subscriptions, Tenant subscription visibility, and
  PostgreSQL-enforced workflow, monthly run, active-device, and member limits.
- Added the missing Devices route with metadata-only paired-device views and
  Zod-validated short-lived pairing-code responses.
- Completed a shared Traditional Chinese/English Web language system across the
  landing page, Auth, pricing, dashboard, workflows, runs, devices, settings,
  connections, and platform administration. The Desktop Agent has the same
  user-controlled language switch, with OS-localized native menus.
- Replaced default Web/Desktop/AppX artwork with the AI Workflow Studio brand
  mark, exact Store asset dimensions, and automated PNG-header tests. Added
  machine-readable Partner Center identity data plus Traditional Chinese and
  English Store listing drafts.
- Added a reusable runtime `WorkflowRunView` Zod schema so changing Run API
  responses are validated before entering browser state.
- Added a client-bundle scanner and focused tests for server-only variable
  names, configured secret values, credential patterns, private keys, and local
  workspace paths.
- Completed the documented local security and acceptance review and updated the
  production, release, user, and administrator bootstrap guides.

### Validation

- `pnpm audit --audit-level high`: passed — no known vulnerabilities
- `pnpm peers check`: passed — no peer dependency issues
- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed — all 10 code workspaces
- `pnpm test`: passed — 105 tests across 24 files
- `pnpm build:web`: passed — optimized Next.js production build with 31 static
  pages and all dynamic Auth, admin, device, workflow, Run, and API routes
- `pnpm security:scan-client`: passed — 29 built browser assets, no synthetic
  secret, server-only variable name, credential pattern, private key, or local
  path detected
- `pnpm db:test`: passed — fresh migrations, Tenant isolation, privileged
  function denial, state transitions, plan entitlements, admin role boundaries,
  atomic plan audit, and idempotent seed
- `pnpm build:desktop`: passed — main, preload, and bilingual renderer
- `pnpm test:e2e`: passed — both Chromium Mock acceptance paths, including
  persisted bilingual switching and the Devices pairing route
- `pnpm release:scan -- --directory apps/desktop/build`: passed

### External publication follow-up

- Configure and staging-test a real Supabase project, mail delivery, durable
  production repositories, payment-provider webhooks, backups, and operational
  ownership.
- Grant the intended verified Auth user as the first platform administrator
  manually by UUID; never provide or store that user's password.
- Run remote GitHub CI and the native Windows Store packaging workflow, then
  complete clean-machine testing, WACK, screenshots, privacy/support URLs,
  Partner Center declarations, and certification.
- Create a Vercel deployment, GitHub prerelease, or Microsoft Store submission
  only with explicit provider authorization. No remote publication is claimed.

### Commit

- `feat: complete bilingual platform acceptance` (this phase commit)

## Phase 14

Status: completed

### Implemented

- Pushed the completed platform branch to the configured GitHub repository.
- Corrected the Vercel monorepo root from the Electron Desktop workspace to the
  Next.js Web workspace and verified a Production deployment at the configured
  public domain.
- Created a dedicated Free Supabase organization and transferred the existing
  hosted AI Workflow Studio project into it without changing the project or
  database identity.
- Matched local Supabase configuration to the hosted PostgreSQL 17 database.
- Dry-ran, applied, and remotely verified all five immutable database
  migrations. Development seed data was not applied.
- Configured the Production Site URL, explicit Production/local redirect
  allowlist, required email confirmation, secure password changes, and TOTP.
- Added the required public Supabase configuration and approved server-only
  secrets to protected Vercel Production environment variables. No credential
  value was written to Git or a workspace file.
- Redeployed Production with the hosted environment and corrected the bilingual
  landing-page call to action so only the explicit mode badge identifies Mock
  operation.

### Validation

- Hosted database migration dry run: passed
- Hosted database migration application: passed — five migrations
- Local/remote migration history comparison: passed — five exact matches
- Supabase project health after organization transfer: passed
- Supabase Auth configuration sync: passed
- Vercel environment-variable presence check: passed — names and targets only
- Vercel Production redeployment: passed — Ready and aliased to the configured
  public domain
- Hosted landing page: passed — HTTP 200 and Traditional Chinese default locale
- Hosted registration page: passed — real Supabase account fields and password
  policy rendered without Mock guidance
- Hosted session boundary: passed — anonymous Dashboard access redirected to
  the verified-account login screen
- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 105 tests across 24 files
- `pnpm build:web`: passed — 31 static pages generated
- `pnpm db:test`: passed
- `pnpm security:scan-client`: passed — 29 client bundle files inspected

### Known limitations

- AI provider, Google OAuth, payment-provider, and durable non-Auth production
  adapters remain unconfigured and continue to fail closed.

## Phase 15

Status: completed

### Implemented

- Diagnosed remote CI run `30209256783`: all three jobs stopped in
  `setup-node` because pnpm caching was requested before pnpm existed on PATH.
- Added the official `pnpm/action-setup` action before `setup-node` in both CI
  jobs, pinned it to an immutable verified `v4` commit, installed the repository
  package-manager version, and removed the later redundant Corepack step.
- Tightened the bilingual Playwright language-toggle locators to exact
  accessible-name matching so the `EN` button cannot also match the Next.js
  developer-tools button.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed — all 10 code workspaces
- `pnpm test`: passed — 105 tests across 24 files
- `pnpm build:web`: passed — 31 static pages generated
- `pnpm test:e2e`: passed — two Chromium acceptance paths
- GitHub Actions run `30210029021`: passed
  - Quality and web build: passed
  - Desktop package (macOS): passed
  - Desktop package (Windows): passed

### Known follow-up

- GitHub currently warns that the pinned `checkout`, `setup-node`, and pnpm
  actions target the deprecated Node.js 20 action runtime and are being forced
  onto Node.js 24. This warning is non-blocking; upgrading those action majors
  should be handled as a separate reviewed maintenance change.

### Commits

- `fix(ci): install pnpm before cache setup`
- `test(e2e): target language toggles exactly`

## Phase 16

Status: completed

### Implemented

- Verified the intended production Auth user exists and has a confirmed email
  address before granting any privileged role.
- Confirmed the user did not already have a platform-administrator record.
- Granted the first active `super_admin` role through the protected linked
  database boundary using the documented production bootstrap transaction.
- Kept the administrator UUID, email address, handle, password, tokens, and
  provider response out of the repository.

### Validation

- Pre-grant Auth-user and email-confirmation check: passed
- Pre-grant platform-role absence check: passed
- Production bootstrap transaction: committed
- Post-grant role readback: passed — active `super_admin`

### Follow-up

- Sign in normally and open `/admin` to verify the authenticated browser
  session receives the server-granted platform-administration view.

## Phase 17

Status: completed

### Implemented

- Added a bilingual Codex-inspired AI Workspace with a local conversation,
  natural-language request composer, safe model selection, planning progress,
  and a separate validated-plan panel.
- Added Auto, OpenAI, Claude, Gemini, and development-only Mock model options.
  Auto resolves only to an available server-configured provider.
- Connected Plan mode to the existing server-only AI gateway and complete
  Workflow v1 validation. The screen cannot save, dispatch, or execute a
  workflow.
- Kept Ask, attachments, durable history, and Run visibly disabled and labeled
  with their later gated phases.
- Made every assistant response retain its own provider/model attribution
  instead of reusing the most recent model globally.
- Removed AI Provider configuration from ordinary workspace settings. The old
  workspace URL now redirects back to the safe general settings page.
- Added a platform-admin-only Provider status page that shows only configured
  booleans, model names, and Vercel environment-variable names. It contains no
  secret input and never reads or returns API key values.
- Documented that production provider keys remain encrypted Vercel Server-only
  environment variables without a `NEXT_PUBLIC_` prefix.
- Added a responsive three-panel desktop layout and stacked mobile layout
  without horizontal overflow.
- Added Website Studio phases 23–27 for a later guided brief, validated website
  specification, sandboxed responsive preview canvas, reversible visual edits,
  and explicitly approved publishing.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed — all 10 code workspaces
- `pnpm test`: passed — 108 tests across 25 files
- `pnpm build:web`: passed — 31 static pages generated; dynamic
  `/dashboard/assistant` and protected `/admin/ai-providers` routes included
- `pnpm test:e2e`: passed — 3 Chromium acceptance paths
- `pnpm security:scan-client`: passed — 29 built client files inspected
- In-app browser desktop check: passed at 1440 px — three-panel layout, no
  horizontal overflow, no ordinary-user API-key/provider-settings text
- In-app browser mobile check: passed at 390 px — stacked layout and no
  horizontal overflow
- In-app browser planning check: passed — validated four-step Mock plan with
  explicit non-execution boundary

### Known limitations

- Live OpenAI, Claude, and Gemini selection remains unavailable until the
  corresponding Vercel Production variables are configured and the application
  is redeployed. No key value was added during this phase.
- Conversation persistence and general Ask mode are Phase 18.
- Attachments and generated artifacts are Phase 19.
- Reviewed workflow dispatch and explicit approvals are Phase 20.
- Website creation and its preview canvas begin in Phase 23 after the AI
  workspace execution and operations phases pass their gates.
- This phase was not deployed to Production; a successful local build must not
  be treated as a Vercel deployment.

## Phase 18

Status: completed

### Implemented

- Activated the bilingual Ask and Plan modes in the AI Workspace while keeping
  execution visibly disabled for Phase 20.
- Added authenticated, provider-neutral streaming chat for OpenAI Responses,
  Anthropic Messages, Gemini `streamGenerateContent`, and deterministic Mock
  adapters. Provider events are normalized into bounded delta and completion
  events.
- Added explicit browser cancellation, provider timeout handling, partial
  response persistence, safe error envelopes, and output-size limits.
- Added tenant-isolated `ai_conversations` and `ai_messages` tables with
  cross-tenant composite foreign keys, read-only authenticated RLS, and
  service-role-only writes.
- Persisted Ask replies and validated Plan results, including provider/model
  attribution and completed, cancelled, or failed message states.
- Added durable conversation history, reload/open behavior, new-conversation
  controls, streaming status, and a stop-generation control to the responsive
  Codex-inspired interface.
- Connected both chat and planning usage to `usage_records` without storing
  prompts, generated content, credentials, or hidden reasoning in usage
  metadata.
- Kept all external-provider keys server-only. The customer interface contains
  no API-key input or secret status details.

### Validation

- AI gateway focused unit tests: passed — 18 tests across 3 files
- `pnpm db:test`: passed — fresh migrations, tenant isolation, role
  restrictions, and idempotent seed
- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed — all code workspaces
- `pnpm test`: passed — 115 tests across 26 files
- `pnpm build:web`: passed — Production build includes the new chat,
  conversation-list, conversation-detail, and persistent Plan routes
- `pnpm test:e2e`: passed — 4 Chromium paths, including streaming history
  persistence and validated Plan persistence
- `pnpm security:scan-client`: passed — 29 built client files inspected
- Codex in-app browser desktop check: passed — streamed Mock reply, durable
  history entry, no horizontal overflow, and no console warnings/errors
- Codex in-app browser mobile check: passed at 390 px — stacked layout with no
  horizontal overflow

### Known limitations

- External OpenAI, Claude, and Gemini choices remain unavailable until their
  respective server-only Vercel variables are configured and a new deployment
  is completed.
- Ask mode is intentionally tool-free and cannot execute workflows, access
  files, or publish websites.
- Attachments, bounded sources, tool registry, and generated artifacts begin in
  Phase 19.
- Reviewed workflow dispatch and explicit approval gates begin in Phase 20.
- Website Studio and its responsive preview canvas remain scheduled for Phases
  23–27.
- This phase was not deployed to Production; successful local checks and a
  GitHub push must not be described as a Vercel deployment.

## Phase 19

Status: completed

### Implemented

- Added a strict shared tool registry with only two allowlisted capabilities:
  bounded source-context preparation and Markdown artifact creation. Every
  invocation and result is runtime-validated with Zod and carries explicit
  tenant and conversation authority.
- Added tenant-isolated attachment, message-source, tool-result, artifact, and
  artifact-source tables with composite tenant/conversation foreign keys,
  RLS enabled, direct browser privileges revoked, service-role-only access, and
  cross-tenant database tests.
- Added authenticated resource APIs for uploading, listing, and downloading
  `.txt`, `.md`, `.csv`, and `.json` sources up to 64 KiB, with MIME/extension
  checks, UTF-8 byte limits, JSON validation, filename sanitization, SHA-256
  fingerprints, and bounded per-message and per-conversation counts.
- Added explicit source selection and stable `[S1]` through `[S5]` citations.
  Sources are delimited as untrusted data and cannot become instructions,
  tools, filesystem paths, credentials, or executable code.
- Added auditable Markdown artifacts derived from completed assistant messages,
  with bounded content, linked source provenance, safe attachment downloads,
  and tool success/failure records.
- Reworked the AI Workspace into a responsive Codex-style three-column
  experience with conversations, chat and Plan composer, attachment chips,
  source previews, artifact previews, and mobile stacking without horizontal
  overflow.
- Kept workflow execution, destructive operations, arbitrary code, shell,
  JavaScript, Python, unrestricted filesystem access, and Website publishing
  unavailable. Provider API keys remain server-only and are never returned to
  ordinary users or embedded in the client bundle.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed — all code workspaces
- `pnpm test`: passed — 118 tests across 27 files
- `pnpm db:test`: passed — fresh migrations, tenant isolation, RLS and
  service-role restrictions, and idempotent seed tests
- `pnpm build:web`: passed — Production build includes attachment, artifact,
  and resource routes plus the updated AI Workspace
- `pnpm security:scan-client`: passed — 29 built client files inspected
- `pnpm test:e2e`: passed — 5 Chromium paths, including explicit source
  citation and auditable Markdown artifact creation
- Codex in-app browser desktop check: passed at 1440 px — three-column layout,
  no horizontal overflow, and sources/artifacts remain visually separated
- Codex in-app browser mobile check: passed at 390 px — stacked layout and no
  horizontal overflow
- Fresh Production preview console check: passed — no browser errors

### Known limitations

- Live OpenAI, Claude, and Gemini choices remain unavailable until their
  respective server-only Vercel variables are configured and a new deployment
  is completed.
- Accepted sources are intentionally limited to UTF-8 text, Markdown, CSV, and
  JSON. PDF, image OCR, large-file storage, and retrieval indexing are deferred.
- Tools prepare context or create downloadable Markdown only; they cannot run a
  workflow. Reviewed dispatch and explicit approvals begin in Phase 20.
- Website Studio, its guided website specification, sandboxed responsive
  preview canvas, reversible editing, and publishing remain scheduled for
  Phases 23–27.
- This phase was not deployed to Production; successful local checks and a
  GitHub push must not be described as a Vercel deployment.

### Commit

- `feat(web): add bounded sources and artifacts` (this phase commit)

## Phase 20

Status: completed

### Implemented

- Added a tenant-isolated `ai_workflow_drafts` link between an exact completed
  Plan message and an immutable Workflow v1 version. Draft records include the
  validated definition SHA-256, creator, version, and creation time, with
  composite tenant foreign keys, RLS, revoked browser privileges, and
  service-role-only access.
- Added authenticated draft and run-request APIs. A draft can be created only
  from the exact persisted assistant Plan message, is revalidated with the
  Workflow schema and policy validator, and is idempotent for the same message
  and definition hash.
- Connected reviewed drafts to the existing run orchestrator with a stable
  `assistant:<draftId>` idempotency key. The orchestrator preserves existing
  audit events, risk classification, separate write/destructive approval,
  Desktop Agent queueing, lease, and duplicate-suppression behavior.
- Added an explicit two-step execution panel to the AI Workspace:
  `建立審閱草稿` creates no run, and `建立執行要求` creates a run without
  bypassing approval. Ask and Plan remain read-only, and the Run details page
  remains the separate place to approve and dispatch risky work.
- Added bilingual risk counts, immutable draft identity and SHA-256 visibility,
  approval status, and a direct link to the existing Run details and audit
  trail. Provider credentials remain server-only and are not exposed by the
  new routes or client bundle.
- Kept production dispatch fail-closed when the durable Desktop Agent
  production adapter is not configured. The application does not claim that a
  production Job was dispatched in that state.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed — all code workspaces
- `pnpm test`: passed — 120 tests across 28 files
- `pnpm db:test`: passed — fresh migrations, cross-tenant draft rejection,
  revoked authenticated access, RLS, service-role restrictions, and seed tests
- `pnpm build:web`: passed — Production build includes workflow-draft and
  draft-run routes plus the Phase 20 AI Workspace
- `pnpm security:scan-client`: passed — 29 built client files inspected
- `pnpm test:e2e`: passed — 5 Chromium paths, including Plan to immutable
  draft, run request, separate approval, and post-approval Agent Job queueing
- Codex in-app browser desktop check: passed — reviewed Workflow v1 card, risk
  summary, hash, and waiting-for-approval state are visible without overflow
- Codex in-app browser mobile check: passed at 390 × 844 — responsive stacked
  layout with no horizontal overflow
- Fresh Production preview console check: passed — no browser errors

### Known limitations

- Durable production Desktop Agent persistence and dispatch adapters remain
  unconfigured. Production run requests fail closed instead of creating a false
  success; local Mock mode covers the full reviewed approval and queue flow.
- Live OpenAI, Claude, and Gemini choices remain unavailable until their
  respective server-only Vercel variables are configured and a new deployment
  is completed.
- Recurring schedules and additional authorized business connectors begin in
  Phase 21. Usage, quotas, billing controls, and operations are Phase 22.
- Website Studio, guided website specification, sandboxed responsive preview,
  reversible editing, and publishing remain scheduled for Phases 23–27.
- This phase was not deployed to Production; successful local checks and a
  GitHub push must not be described as a Vercel deployment.

### Commit

- `feat(web): add approval-aware assistant execution` (this phase commit)

## Phase 20 follow-up — Simplified model disclosure and larger text sources

Status: completed

### Implemented

- Removed ordinary-user provider readiness cards from the empty AI Workspace.
  The top model selector now shows only generic provider labels; actual model
  versions, configuration state, and provider/message metadata are not rendered
  in the ordinary workspace. Detailed provider readiness remains restricted to
  the platform-admin area.
- Kept the existing `詢問 / Ask`, `規劃 / Plan`, and reviewed `執行 / Run`
  controls as the user-facing capability levels beneath the composer.
- Raised each accepted UTF-8 `.txt`, `.md`, `.csv`, or `.json` source from
  64 KiB to 1 MiB across the client, authenticated API boundary, shared Zod
  schemas, server validation, and a forward-only database migration.
- Preserved the independent 16,000-character model-context ceiling and the
  five-source-per-message limit. A larger stored file therefore does not grant
  unbounded context, cost, instruction, tool, or filesystem authority.
- Recorded the product decision that the first paid release uses Microsoft
  Store subscription add-ons as its only commerce source. Phase 22 will sync
  Store entitlements into Supabase and enforce cost-budget allowances without
  collecting payment-card data in this application.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed — all code workspaces
- `pnpm test`: passed — 120 tests across 28 files
- `pnpm db:test`: passed — fresh migrations accept a 70,000-byte source,
  reject a source over 1 MiB, and retain tenant/RLS/seed coverage
- `pnpm build:web`: passed — Production build includes the updated attachment
  boundary and simplified AI Workspace
- `pnpm security:scan-client`: passed — 29 built client files inspected
- `pnpm test:e2e`: passed — 5 Chromium paths, including a 70,000-byte source
  upload, hidden provider/model metadata, conversations, execution approval,
  and Desktop Agent queueing
- Codex in-app browser desktop check: passed — generic model selector remains
  visible while readiness cards and actual model versions are absent
- Codex in-app browser mobile check: passed at 390 × 844 — no horizontal
  overflow; model selector, 1 MiB source help, and mode controls remain present
- Local preview console check: passed — no warnings or errors

### Known limitations

- The 1 MiB limit applies to bounded UTF-8 text sources. PDF, spreadsheet,
  image/OCR, object storage, chunking, and retrieval indexing remain deferred
  and must not be represented as supported.
- Microsoft Store subscription purchase, entitlement synchronization, and
  monthly cost-budget enforcement are planned for Phase 22 and are not yet
  implemented.
- This follow-up was not deployed to Production; successful local checks and a
  GitHub push must not be described as a Vercel deployment.

### Commit

- `fix(web): simplify model disclosure and raise source limit` (follow-up commit)

## Phase 20 production-readiness follow-up — Durable Agent execution

Status: completed

### Implemented

- Replaced the Production in-memory Desktop Agent store with a server-only
  Supabase adapter for pairing codes, hashed expiring device tokens,
  authentication touch times, heartbeats, device status, job discovery, atomic
  claims, leases, progress, completion, failure, cancellation, and revocation.
- Added atomic service-role database functions for one-time pairing, heartbeat
  recording, and device revocation. Revocation also invalidates device tokens
  and cancels active jobs; authenticated browser roles cannot invoke these
  functions.
- Synchronized approved Desktop folder aliases in heartbeat metadata without
  sending or storing local absolute paths. Server records contain only stable
  alias IDs, display names, and read/watch/write permission summaries.
- Replaced the Production execution failure placeholder with durable Workflow
  Run, step, approval, Agent Job, notification, and audit persistence. Reviewed
  immutable drafts now dispatch only to a Tenant-owned, non-revoked Desktop
  Agent using a stable idempotency key.
- Added Production approval, rejection, cancellation, timeout, manual retry,
  current-attempt step progress, completion, and failure synchronization.
  Retried runs initialize a new attempt-specific step set, while duplicate
  Agent events can safely repair an interrupted server-side synchronization.
- Added real Production device and approved-folder discovery to the Assistant.
  Plan mode targets the selected Desktop Agent, shows online/offline status, and
  cannot create an executable review until an Agent is paired.
- Added real Production device listing and Desktop heartbeat transmission of
  metadata-only folder aliases. Existing local folder containment,
  permission, symlink, idempotency, backup, and atomic-output controls remain
  enforced by the Desktop executor.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed — all code workspaces
- `pnpm test`: passed — 152 tests across 37 files
- `pnpm db:test`: passed — fresh migrations, one-time pairing, hashed device
  tokens, heartbeat persistence, service-role-only functions, revocation,
  active-job cancellation, tenant isolation, and existing database coverage
- `pnpm build:web`: passed — 40 generated pages and the Production Agent/Run
  API routes
- `pnpm security:scan-client`: passed — 33 built client files inspected
- `pnpm build:desktop`: passed — main, preload, and renderer builds
- `pnpm test:e2e`: passed — eight Chromium paths covering Agent authorization,
  AI conversations and Plans, sources, approvals, schedules, usage, workflows,
  and Website Studio

### Known limitations

- The new migration and application build have not yet been applied to hosted
  Supabase or Vercel. Production cannot use this adapter until the migration is
  applied and the matching Web build is deployed.
- A real Desktop Agent must be installed, paired, online, and granted the
  required local folders before a Production workflow can execute. The Web
  application never receives the local absolute folder paths.
- OpenAI, Claude, and Gemini responses still depend on valid server-only keys,
  provider account model access, quota, and billing. Provider failures remain
  fail-closed with safe customer-facing errors.
- This follow-up does not add arbitrary code or shell execution. Only the
  registered, validated Workflow nodes can be dispatched.

### Commit

- `fix(platform): persist production agent execution` (follow-up commit)

## Phase 21 — Schedules and connectors

Status: completed

### Implemented

- Added a strict scheduler package with four bounded recurring presets: every
  15 minutes, hourly, daily, and weekdays. The scheduler validates 24-hour
  local times and real IANA timezones, derives a five-field Cron expression,
  calculates the next UTC occurrence across timezone and daylight-saving
  boundaries, and never accepts arbitrary code or free-form Cron.
- Added tenant-scoped schedule records and server-only fire claims in Supabase.
  Composite tenant foreign keys bind each schedule to its exact workflow
  version and Desktop Agent, while the unique occurrence/idempotency keys
  prevent duplicate dispatch under concurrent ticks.
- Kept schedule mutation behind authenticated server routes. Viewers cannot
  create, pause, or resume schedules; the browser cannot claim fire records or
  invoke the claim function directly. Schedule creation, pause, and resume
  write metadata-only audit events.
- Added a protected `GET /api/internal/schedules/tick` boundary using an
  independent `CRON_SECRET` bearer value. Mock mode has a test-only secret and
  permits a deterministic `at` parameter; Production ignores caller-supplied
  times.
- Connected each Mock schedule occurrence to the existing run orchestrator
  using a stable `schedule:<scheduleId>:<dueAt>` key. The scheduled occurrence
  creates a traceable Run that remains `awaiting_approval`; it cannot bypass
  existing write, external-action, or destructive-action approval rules.
- Added bounded failure handling. The scheduler records only safe error codes,
  advances to the next cadence, and automatically pauses after three
  consecutive dispatch failures instead of retrying indefinitely.
- Added a bilingual Schedule workspace with workflow/device selection, cadence,
  local time, timezone, next occurrence, pause/resume controls, and a direct
  Google Sheets connection review. The ordinary UI exposes no OAuth token,
  provider credential, or arbitrary Cron field.
- Reused the Phase 10 Google Sheets connector as the first authorized business
  connector. Its server-only encrypted OAuth tokens, bounded scopes, health
  checks, explicit revocation, retries, and write idempotency remain unchanged.
  No additional third-party connector was added without a selected provider
  and explicit workspace authorization.
- Recorded the Store-only commerce decision for Phase 22: Microsoft Store
  subscription add-ons remain the single payment source for the first release;
  the website will not collect card data or present an independent checkout.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed — all code workspaces, including the scheduler
- `pnpm test`: passed — 123 tests across 29 files
- `pnpm db:test`: passed — fresh migrations, tenant isolation, server-only
  mutation, and duplicate schedule-fire claim coverage
- `pnpm build:web`: passed — 38 generated pages plus Schedule and Cron routes
- `pnpm security:scan-client`: passed — 30 built client files inspected
- `pnpm test:e2e`: passed — six Chromium paths, including schedule creation,
  protected tick, approval-aware Run creation, pause, resume, and Google
  connector disclosure
- Codex in-app browser desktop check: passed at 1280 × 720 — complete Schedule
  workspace rendered in the Production preview with no horizontal overflow,
  console errors, or warnings
- Codex in-app browser mobile check: passed at 390 × 844 — stacked creation,
  Google Sheets security summary, and empty-state schedule list remained
  readable with no horizontal overflow

### Known limitations

- Durable Production Desktop Agent and Run persistence/dispatch remain
  unconfigured. Production schedule definitions can be stored, but the Cron
  tick fails closed and no Vercel Cron entry is enabled until that adapter is
  available. Mock mode covers the complete recurring-to-approval integration.
- Google Sheets remains the only live business connector. Additional Microsoft
  365, Outlook, Teams, Slack, or other connectors require a separately selected
  provider, minimum scopes, credential ownership, revocation, and integration
  tests.
- Microsoft Store purchase verification, entitlement synchronization, monthly
  cost budgets, 80%/95% warnings, and the 100% ceiling begin in Phase 22.
- This phase was not deployed to Production; successful local checks and a
  GitHub push must not be described as a Vercel deployment.

### Commit

- `feat(web): add safe recurring schedules` (this phase commit)

## Phase 22 — Usage and operations

Status: completed

### Implemented

- Added a strict shared usage-control package with a versioned conservative
  internal rate card, bounded token estimates, maximum-cost reservations,
  plan lookup, and deterministic 80% warning, 95% critical, and 100% blocked
  budget levels.
- Added monthly plan allowances for AI cost, per-minute AI requests, text-source
  bytes, and audited tool calls. The Free, Pro, Team, and Business plans use
  bounded cost budgets designed to protect subscription margin instead of
  exposing a resold Token balance.
- Added immutable Supabase usage-budget reservations and service-role functions
  for atomic preflight reservation, actual AI usage recording, reservation
  release, and source/tool allowance consumption. Reservations are
  Tenant-scoped, idempotent, rate-limited, and expire after 15 minutes.
- Connected Ask and Plan provider calls to conservative preflight reservations
  and actual usage settlement. Provider calls fail closed before network access
  when the monthly ceiling, request rate, or Production usage boundary cannot be
  verified.
- Connected text-source ingestion and audited tool execution to database-side
  monthly allowance consumption without changing the existing 1 MiB per-source,
  five-source-per-message, 16,000-character context, or approved-tool authority
  boundaries.
- Added a bilingual **用量 / Usage** workspace showing remaining AI allowance,
  monthly text-source and tool-call usage, request-rate limit, warnings, and the
  Microsoft Store single-commerce boundary. Ordinary users receive no provider
  key, Store credential, product/SKU mapping, or administrator configuration
  detail.
- Added a server-only Microsoft Store entitlement adapter and authenticated
  synchronization route. The server validates a short-lived Store ID key,
  exchanges protected Microsoft Entra credentials, validates exact
  product/SKU-to-plan mappings, rejects incomplete pagination, hashes safe
  response metadata, and updates Tenant access without storing the Store ID
  key, access token, client secret, or raw response.
- Restricted paid billing state to Microsoft Store synchronization or an
  audited Super Admin internal override. An internal override clears stale
  external entitlement metadata and is excluded from Store revenue estimates.
- Added an administrator operations summary for gross Store catalog revenue,
  estimated net after an explicit 15% operational assumption, estimated AI
  cost, margin, warning counts, and internal overrides. Provider and Store
  settings disclose configured/not-configured status only.
- Corrected bilingual rendering so `LocalizedText` renders only the active
  locale. A clean browser origin now switches Chinese/English without duplicate
  hidden text, hydration warnings, or CSS dependence.
- Added complete Store/usage architecture, security, deployment, testing,
  production-checklist, and user documentation. The documentation records that
  Microsoft must provision the subscription recurrence API, actual Partner
  Center statements remain authoritative, and this phase has not been deployed.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed — all code workspaces, including usage control
- `pnpm test`: passed — 130 tests across 31 files
- `pnpm db:test`: passed — fresh migrations, usage reservations, rate and
  monthly ceilings, source/tool consumption, Store-only billing constraints,
  service-only entitlement synchronization, Tenant isolation, audit, and
  idempotent seed coverage
- `pnpm build:web`: passed — 39 generated pages plus the Usage workspace and
  Microsoft Store entitlement synchronization route
- `pnpm security:scan-client`: passed — 30 built client files inspected
- `pnpm test:e2e`: passed — seven Chromium paths, including bilingual usage,
  Store single-commerce disclosure, hidden credential/configuration details,
  AI conversations, sources/artifacts, schedules, workflows, and Agent APIs
- Clean-origin desktop browser check: passed — Chinese-only initial rendering,
  English switch, correct document language, and no console warnings or errors
- Mobile browser check: passed at 390 × 844 — Usage workspace remained readable
  with no horizontal overflow

### Known limitations

- Microsoft documents that its subscription recurrence-query API is available
  only to provisioned developer accounts and not most accounts. Partner Center
  or Microsoft must confirm access before Production entitlement verification
  can be relied upon.
- The Store-associated Windows client does not yet obtain a real Store ID key
  or call the synchronization endpoint. Product/SKU add-ons, package
  submission, certification, payout/tax reconciliation, refunds, and signed
  desktop release remain external go-live work.
- Revenue and margin values are operational estimates based on catalog prices,
  an assumed 15% fee, and the internal conservative AI rate card. Partner Center
  statements and provider invoices remain authoritative.
- Durable Production Desktop Agent, Run, and Google repository adapters remain
  incomplete and continue to fail closed where applicable.
- Website Studio, guided website specification, sandboxed responsive preview,
  reversible editing, and publishing remain scheduled for Phases 23–27.
- This phase was not deployed to Production; a successful local build, commit,
  or GitHub push must not be described as a Vercel or Microsoft Store release.

### Commit

- `feat(platform): add Store entitlements and usage guardrails` (this phase
  commit)

## Phase 23 — Website Studio foundation

Status: completed

### Implemented

- Added a separate bilingual **網站工作室 / Website Studio** product area with
  an authenticated project list, project creation, progress, status, and a
  dedicated six-step guided brief.
- Added a strict `website-schema` package. Purpose, audience, pages, brand
  direction, content, and calls to action are bounded, reject unknown fields,
  require unique page slugs and calls to action, and must all pass Zod
  validation before a site draft can be created.
- Added tenant-owned `website_projects` persistence with an immutable migration,
  unique tenant slugs, validated progress/state invariants, an updated-at
  trigger, index, RLS member reads, and service-role-only mutation.
- Added authenticated Website Studio APIs for list, create, read, brief update,
  and draft creation. Tenant and actor identity always come from the verified
  workspace context; viewers cannot mutate projects and cross-tenant identifiers
  return not found.
- Added deterministic Mock persistence for complete local and browser testing
  without Supabase credentials. Production writes use the existing server-only
  Supabase administrator boundary.
- Added metadata-only audit events for project creation, brief-field updates,
  and draft creation. Brief copy, private content, credentials, and prompts do
  not enter audit metadata.
- Locked a project after its first validated draft because reversible,
  versioned editing begins in Phase 26. The interface contains no executable
  code field, model call, preview renderer, credential control, deployment
  action, or enabled publish button.
- Documented that OpenAI, Claude, Gemini, Auto, validated Website Specs,
  responsive preview, visual editing, versions, publishing, and domains remain
  gated to Phases 24–27.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed — all code workspaces, including website schema
- `pnpm test`: passed — 133 tests across 32 files
- `pnpm db:test`: passed — fresh migrations, Website Project RLS, cross-tenant
  isolation, browser read-only privileges, validated draft invariants, and
  existing idempotent seed coverage
- `pnpm test:e2e`: passed — eight Chromium paths, including all six Website
  Studio decisions, incomplete-draft blocking, validated draft creation,
  post-draft mutation locking, disabled publishing, and hidden API-key detail
- `pnpm build:web`: passed — 40 generated pages with Website Studio pages and
  project APIs
- `pnpm security:scan-client`: passed — 32 built client files inspected
- `pnpm build:desktop`: not applicable — no Desktop code changed

### Known limitations

- Phase 23 produces a structured, validated project brief only. It does not call
  OpenAI, Claude, Gemini, or any external AI provider and does not generate a
  Website Spec.
- Responsive preview, uploaded website assets, visual editing, undo/redo,
  versions, publishing, deployment history, rollback, and custom-domain
  management remain unavailable until their applicable Phases 25–27 pass.
- Drafts are intentionally locked after creation to avoid unversioned changes.
- This phase was not deployed to Production. A successful local build, commit,
  or GitHub push must not be described as a Vercel deployment or a published
  customer website.

### Commit

- `feat(web): add guided Website Studio foundation` (this phase commit)

## Phase 24 — AI website specification

Status: completed

### Implemented

- Added a strict versioned Website Spec schema that accepts only curated theme
  tokens, bounded plain text, ID-based asset references, internal actions, and
  registered Hero, Feature Grid, Stats, Testimonial, Pricing, FAQ, CTA, Content,
  and Footer sections.
- Added semantic validation for unique page/section IDs, exact brief-page
  coverage, navigation/action targets, asset references, and rejection of
  unknown components, code fences, scripts, HTML, external/data URLs, and
  executable package, shell, Python, or Node instructions.
- Generalized the existing OpenAI, Claude, and Gemini structured-output adapters
  to receive an operation-specific JSON Schema and bounded output limit. OpenAI
  uses strict Responses API JSON Schema output, while Claude and Gemini receive
  the same validated provider schema.
- Added a provider-neutral structured-output gateway with strict JSON parsing, a
  1 MB response bound, one repair attempt, validation-path-only repair feedback,
  aggregate usage accounting, and fail-closed output release.
- Added Auto, OpenAI, Claude, Gemini, and development Mock Website Studio
  routing. Auto uses the first configured provider, unavailable providers are
  omitted, and no provider key, configuration flag, or actual model identifier
  is serialized to the ordinary user interface.
- Added the bilingual model-and-level selection interface after a brief becomes
  a draft. It summarizes only the validated specification version, page count,
  registered section count, provider label, and attempt count; responsive
  preview and publishing remain visibly gated.
- Added authenticated idempotent Website Spec generation, Tenant budget
  reservation, metadata-only audit, viewer blocking, and a server-only
  persistence path.
- Added immutable `website_specs` persistence with composite Tenant/project
  integrity, version uniqueness, RLS member reads, service-role-only mutation,
  and cross-Tenant isolation coverage.
- Added administrator setup documentation for OpenAI, Claude, Gemini, and
  Vercel Sensitive environment variables. Ordinary users never enter API keys.
- Clarified that assistant source upload is 1 MiB per supported text file and is
  unavailable in Production only when no AI provider can create the associated
  conversation. Ask remains read-only; execution still requires a validated
  versioned plan, review, approval when needed, and an authorized Desktop Agent.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed — all code workspaces, including Website Spec and
  structured AI output
- `pnpm test`: passed — 141 tests across 34 files
- `pnpm db:test`: passed — fresh migrations, Website Spec RLS, cross-Tenant
  isolation, browser read-only privileges, and existing idempotent seed coverage
- `pnpm test:e2e`: passed — eight Chromium paths, including validated Mock
  Website Spec generation, provider/model-detail hiding, idempotent generation,
  registered component output, and all earlier assistant/workflow paths
- `pnpm build:web`: passed — 40 generated pages plus the authenticated Website
  Spec generation route
- `pnpm security:scan-client`: passed — 32 built client files inspected
- `pnpm build:desktop`: not applicable — no Desktop code changed

### Known limitations

- Phase 24 creates validated Website Spec JSON only. It does not render a
  desktop/tablet/mobile preview, edit components, publish code, deploy a site,
  manage domains, or execute model-generated source.
- Real OpenAI, Claude, and Gemini network requests require the corresponding
  server-only Vercel key and provider billing/quota. Tests use deterministic Mock
  output and secret-free provider transport fixtures.
- Project briefs and specification version 1 remain locked until reversible
  editing and additional versions are introduced in Phase 26.
- The current production deployment has not been changed by this phase. A local
  build, Git commit, or GitHub push must not be described as a Vercel deployment
  or published customer website.

### Commit

- `feat(web): add validated multi-model website specs` (this phase commit)

## Phase 25 — Tier-aware AI model routing

Status: completed

### Implemented

- Added Economy, Standard, Advanced, and Flagship model tiers for OpenAI,
  Claude, and Gemini, with actual provider model identifiers kept in
  server/admin-only modules.
- Limited Free to Economy, Pro to Standard, Team to Advanced, and Business to
  Flagship while leaving higher-cost Preview and Fable options available only
  when the subscription and remaining allowance permit them.
- Added task-aware Auto routing. Free chat starts with Gemini Flash-Lite and
  falls back to OpenAI Luna and Claude Haiku. Planning and Website Studio may
  select a stronger tier when the plan and budget allow it.
- Added provider-specific cost multipliers, monthly 80% and 95% downgrade
  behavior, a fail-closed 100% budget ceiling, and per-request cost ceilings
  before any provider call.
- Added model-level controls to the assistant and Website Studio while keeping
  model identifiers out of ordinary-member UI payloads.
- Added an audited Super Admin model-mapping control. Provider keys remain
  server-only Vercel environment variables; the administration page shows only
  readiness and allowlisted model mappings.
- Added database mappings, plan limits, service-role-only access, a
  Super-Admin-only update function, and integration coverage for denied support
  access plus audit logging.

### Validation

- `pnpm typecheck`: passed
- `pnpm test`: passed — 145 tests across 36 files
- `pnpm db:test`: passed — fresh migrations, model mappings, subscription
  limits, ordinary-user model-slug isolation, Super Admin authorization, and
  audit logging
- `pnpm test:e2e`: passed — eight Chromium paths covering assistant chat and
  planning, source artifacts, schedules, usage visibility, workflow execution,
  Website Studio, and Agent authorization
- `pnpm build:web`: passed — 40 generated pages with tier-aware Assistant,
  Website Studio, and Super Admin controls
- `pnpm security:scan-client`: passed — 33 built client files inspected; the
  explicit server-side model-identifier scan also found no protected model
  mappings in the client bundle
- `pnpm build:desktop`: not applicable — no Desktop code changed

### Known limitations

- The listed model identifiers must exist on the corresponding provider account;
  disabled or unavailable mappings fail closed and Auto tries the next
  configured provider.
- Cost multipliers are conservative routing controls rather than provider
  invoices. Actual usage remains recorded after each request.
- Microsoft Store entitlement synchronization remains the sole paid-commerce
  source; the platform does not collect payment-card data.

### Commit

- `feat(web): add subscription-aware AI model tiers` (this phase commit)

### Production-readiness follow-up

- Ordinary Assistant and Website Studio selectors now show the allowlisted
  OpenAI, Claude, and Gemini model names behind every tier. Locked tiers remain
  visible so a member can understand the subscription upgrade path.
- Added cached server-side provider verification against each provider's model
  listing API. Auto skips credentials that fail authentication, providers at
  quota, unreachable providers, and model mappings unavailable to the provider
  account.
- Added safe bilingual errors for authentication, quota, missing-model, and
  temporary provider failures without returning provider response bodies,
  credentials, environment names, or administrative diagnostics to members.
- Upgraded the Super Admin provider page from key-presence indicators to
  verified, authentication-failed, quota-limited, temporarily-unavailable, or
  not-configured states.
- Provider health probes are bounded to five seconds, model-list responses are
  capped at 2 MB, successful results are cached for five minutes, and all
  external payloads are validated before routing decisions use them.

#### Follow-up validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 152 tests across 37 files
- `pnpm build:web`: passed — 40 generated pages, including verified provider
  status, tier model names, Assistant, and Website Studio
- `pnpm test:e2e`: passed — eight Chromium paths, including model-name
  visibility, streaming Ask, validated Plan, approval-aware execution, sources,
  schedules, usage, and Website Studio
- `pnpm security:scan-client`: passed — 33 built client files inspected; no
  credentials, server-only environment names, or local paths were present
- `pnpm build:desktop`: not applicable — no Desktop code changed

## Phase 26 — Responsive preview canvas

Status: completed

### Implemented

- Replaced the Website Studio preview placeholder with a bilingual Canvas that
  renders the latest validated Website Spec immediately after generation.
- Added desktop (1440 × 900), tablet (768 × 1024), and mobile (390 × 844)
  viewport controls, bounded 50–100% zoom, page selection, refresh, loading, and
  explicit failure states.
- Added an authenticated, Tenant-scoped preview endpoint. It loads only a
  project specification available to the current workspace and returns 404 for
  absent projects, absent generations, invalid slugs, or pages outside the
  validated specification.
- Added a deterministic renderer for all registered Hero, Feature Grid, Stats,
  Testimonial, Pricing, FAQ, CTA, Content, and Footer sections. Theme,
  typography, density, palette, radius, asset, navigation, and page data come
  only from the revalidated Website Spec.
- Escaped every model-provided text value before inserting it into static HTML.
  The renderer emits no script, form, arbitrary URL, model-generated CSS, or
  executable code.
- Isolated the preview in an iframe with an empty sandbox permission set. Its
  response CSP denies scripts, network connections, forms, media, plugins,
  base-URL changes, and non-self framing; permissions policy also denies camera,
  microphone, geolocation, payment, and USB.
- Added an authenticated HEAD preflight so missing or rejected preview responses
  reach the visible Canvas error state rather than appearing as a successful
  blank frame.
- Added deterministic-render, asset-reference, viewport, route, HTML escaping,
  missing-page, and CSP tests plus a browser flow that renders the generated
  site and exercises desktop, tablet, mobile, and zoom controls.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 158 tests across 38 files
- `pnpm build:web`: passed — 40 generated pages plus authenticated GET/HEAD
  website preview
- `pnpm security:scan-client`: passed — 33 built client files inspected
- `pnpm exec playwright test e2e/website-studio.spec.ts`: passed — validated
  Website Spec generation, isolated Canvas content, all three viewports, and
  bounded zoom
- `pnpm build:desktop`: not applicable — no Desktop code changed

### Known limitations

- The Canvas renders the validated specification but does not yet change it.
  Natural-language edits, direct property controls, reorder, duplicate,
  undo/redo, named versions, comparison, and restore begin in Phase 27.
- Preview actions are intentionally non-interactive labels. Form submission,
  external navigation, custom code, and publishing remain unavailable until
  their validated and explicitly approved phases.
- Assets remain ID-based project references and safe placeholders; upload,
  transformation, responsive image generation, and publishing storage are
  future work.
- This phase was not deployed to Vercel. A successful local build, Git commit,
  or GitHub push must not be described as a Production deployment or a
  published customer website.

### Commit

- `feat(web): add sandboxed responsive website canvas` (this phase commit)

## Phase 27 — Visual editing and versions

Status: completed

### Implemented

- Replaced the exposed tier-card grid with compact provider and performance
  dropdowns. Every tier option displays the real allowlisted OpenAI, Claude,
  and Gemini model names; subscription-locked tiers stay visible but disabled.
- Added bilingual, validated natural-language edits that must return a complete
  Website Spec. Model output still cannot insert executable code, arbitrary
  URLs, or unregistered components.
- Added direct page, section-copy, theme, reorder, and duplicate controls. Every
  edit produces a new immutable Website Spec version instead of mutating the
  current specification in place.
- Added named versions, deterministic comparisons, version history, restoration,
  and reversible Undo/Redo. Undo and Redo restore an earlier immutable
  specification as a newly audited version, preserving the complete history.
- Added exact-version Canvas previews and version-aware authenticated preview
  routing, so comparisons and restored specifications can be inspected without
  weakening iframe isolation.
- Added an atomic database audit trigger for every Website Spec insertion,
  version metadata, parent/restored-from relationships, Tenant-scoped API
  routes, service-role restrictions, and cross-Tenant database tests.
- Kept operational audit data free of natural-language prompts, secrets,
  unpublished content, and provider payloads.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 160 tests across 38 files
- `pnpm build:web`: passed — 40 generated pages plus authenticated edit,
  version, restore, and version-aware preview routes
- `pnpm db:test`: passed — fresh migrations, atomic version-audit trigger,
  Tenant isolation, service-role restrictions, and idempotent seed
- `pnpm exec playwright test e2e/website-studio.spec.ts`: passed — provider and
  tier dropdowns, direct editing, live Canvas refresh, version history,
  Undo, and Redo
- `pnpm build:desktop`: not applicable — no Desktop code changed

### Known limitations

- Website images still render as safe asset placeholders. Private,
  quota-controlled OpenAI/Gemini image generation and authenticated asset
  delivery begin in Phase 28.
- Website publishing, domains, production builds, and rollback remain locked
  until Phase 30 and still require explicit authenticated approval.

## Phase 28 — AI website image generation

Status: completed

### Implemented

- Added a bilingual AI image panel to Website Studio with compact provider and
  quality/cost dropdowns. Ordinary members can select Auto, OpenAI, or Gemini
  and see the exact image model names included in each subscription tier.
- Routed Free Auto image requests to the Economy tier, paid Auto requests to
  Standard, and warning/critical workspaces back to Economy. Explicit tiers
  remain bound by Microsoft Store plan entitlement, monthly allowance,
  per-request ceiling, and per-minute request rate.
- Added server-only OpenAI `gpt-image-2` and Gemini native-image adapters with
  bounded 55-second requests, capped provider JSON, strict response schemas,
  base64 validation, PNG signature/IHDR validation, 8 MB limits, and dimensions
  constrained to 1–4096 pixels.
- Kept Claude available for natural-language visual direction and prompt
  refinement while truthfully routing pixel generation only to OpenAI or
  Gemini.
- Added a private `website-assets` Supabase Storage bucket and Tenant-scoped
  `website_assets` metadata. Prompts are stored only as SHA-256 hashes; storage
  paths, prompts, credentials, and provider bodies never enter member payloads
  or operational audit metadata.
- Attached generated assets only to validated Hero, Content, or Testimonial
  sections. Each successful image creates a new immutable Website Spec version
  so Undo, Redo, comparison, history, and restoration continue to work.
- Added five-minute signed preview URLs and tightened the iframe CSP to permit
  only private Supabase image delivery and deterministic Mock PNG data. Model
  output cannot supply image URLs, HTML, CSS, script, or executable code.
- Added provider, schema, preview, quota operation, storage bucket, asset audit,
  RLS, cross-Tenant, and end-to-end Canvas image tests.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 168 tests across 39 files
- `pnpm build:web`: passed — 40 generated pages plus the authenticated,
  quota-controlled website image route
- `pnpm db:test`: passed — fresh migrations, private PNG bucket metadata,
  generated asset audit, service-role mutation boundary, and cross-Tenant RLS
- `pnpm exec playwright test e2e/website-studio.spec.ts`: passed — guided
  brief, specification, direct edit, Undo/Redo, image generation, private asset
  version, and rendered Canvas image
- `pnpm security:scan-client`: passed — 34 built client files inspected
- `pnpm build:desktop`: not applicable — no Desktop code changed

### Known limitations

- Real provider requests require valid server-only Vercel credentials, provider
  billing/quota, and access to the selected exact image model. Auto fails closed
  when neither configured image provider is currently healthy.
- Generated images are PNG-only and currently target one 16:9 website visual
  per request. Image editing, masks, uploaded reference images, responsive
  variants, and automatic focal-point crops are future work.
- Website publishing remains locked until Phase 30. A generated image or
  validated Canvas version is not itself a public website deployment.

## Phase 29 — Unified AI workspace

Status: completed

### Implemented

- Replaced the ordinary member model controls with one compact top selector.
  Exact OpenAI, Claude, and Gemini names are grouped under Economy, Standard,
  Advanced, and Flagship; Auto remains cost- and allowance-aware. Locked Store
  tiers remain visible but disabled, and the large lower model-card grid is no
  longer shown.
- Added an Image mode directly to durable AI conversations. It uses the same
  server-only OpenAI/Gemini image adapters, plan ceilings, monthly budget,
  request-rate limits, PNG validation, and 8 MB/4096-pixel bounds as Website
  Studio while leaving Website Studio available as a separate workspace.
- Added private `assistant-images` Storage and Tenant-scoped
  `ai_image_artifacts`. Conversation messages contain only validated image
  metadata and fetch bytes through an authenticated, authorization-checked
  route; prompts remain represented only by SHA-256 hashes.
- Added per-conversation delete controls with an explicit confirmation dialog.
  The server rechecks Tenant membership, deletes the selected message/source/
  Markdown/image graph in dependency order, and preserves only a content-free
  deletion audit event. Cross-Tenant deletion is rejected.
- Restoring a saved conversation now restores its exact model and tier when the
  choice remains available.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 171 tests across 40 files
- `pnpm db:test`: passed — fresh migration, private assistant image bucket,
  metadata-only audits, confirmed graph deletion, and cross-Tenant rejection
- `pnpm exec playwright test e2e/assistant-workspace.spec.ts`: passed — 4
  scenarios including exact-model grouping, image-in-chat, durable history,
  execution review, artifacts, and confirmed deletion
- `pnpm build:web`: passed — 41 generated pages plus authenticated private
  image generation, image retrieval, and conversation deletion routes
- `pnpm security:scan-client`: passed — 34 built client files inspected; no
  configured provider or platform secret was found
- `pnpm test:e2e`: passed — all 9 Chromium scenarios, including the preserved
  Website Studio guided draft and the unified Assistant image/delete flow
- `pnpm exec supabase migration list --linked`: passed — local and hosted
  migrations are aligned through `202607280007`

### Known limitations

- Claude can refine a visual request but cannot render pixels; Claude or Auto
  image requests safely route to a configured OpenAI or Gemini image model.
- Deleting a conversation is permanent. The confirmation dialog is therefore
  required and no model response can invoke the deletion endpoint.
- Website publishing remains a separate Phase 30 gate and still requires final
  authenticated approval.

### Commit

- `feat(web): unify AI workspace models and images` (this phase commit)

## Phase 30 — Prompt-to-site and confirmed publishing

Status: completed

### Implemented

- Made a bounded natural-language prompt the primary Website Studio entry
  point. The server derives only a strict brief patch, stores a Tenant-scoped
  conversation, and asks the next missing question instead of inventing
  unresolved business decisions.
- Preserved the original six-step brief as an optional advanced editor. Both
  entry paths converge on the same validated `WebsiteProject` and immutable
  `WebsiteSpec` model.
- Added a one-click Canvas build after all six decisions validate. Auto,
  OpenAI, Claude, Gemini, and entitled cost tiers still pass through the
  existing provider health, Store-plan, allowance, request-rate, and
  conservative cost-reservation controls.
- Continued conversational changes through the existing strict full-spec
  validation and immutable version history. Model output cannot add arbitrary
  HTML, CSS, JavaScript, URLs, forms, scripts, or executable commands.
- Added an explicit publication review panel. Publishing is disabled until an
  exact Canvas version exists and the authenticated editor checks a confirmation
  for that version.
- Added immutable `website_publications` releases. Publishing a newer version
  supersedes—but does not delete—the previous release while preserving one
  stable active public slug and a metadata-only audit event.
- Added a public server renderer at `/s/{siteSlug}`. It serves only registered
  components and the exact approved Website Spec, applies restrictive public
  CSP headers, exposes no provider credentials, and proxies only referenced
  project-owned assets.
- Added Tenant-scoped brief-message reads, service-only mutations, member
  authorization checks, viewer rejection, cross-Tenant RLS tests, publication
  history tests, and a full browser journey from one sentence to the live
  public route.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 174 tests across 40 files
- `pnpm build:web`: passed — 42 generated pages including prompt, brief chat,
  quick Canvas, confirmed publishing, public assets, and public site routes
- `pnpm db:test`: passed — fresh migrations, Tenant isolation, service-role
  restrictions, metadata-only audits, stable active slug, and immutable
  superseded releases
- `pnpm exec playwright test e2e/website-studio.spec.ts`: passed — one-sentence
  prompt, AI follow-up, Canvas generation, conversational edit, exact-version
  confirmation, public retrieval, and preserved advanced six-step flow
- `pnpm test:e2e`: passed — all 10 Chromium scenarios across Agent, Assistant,
  Workflow, Schedule, Usage, and both Website Studio entry paths
- `pnpm security:scan-client`: passed — 34 built client files inspected; no
  configured provider or platform secret was found
- `pnpm build:desktop`: not applicable — no Desktop code changed

### Known limitations

- A published site currently lives on the platform host under `/s/{siteSlug}`.
  Customer custom domains, per-site independent Vercel projects, sitemap
  generation, domain verification, release rollback UI, and deployment-history
  operations are follow-on hosting work.
- The public renderer intentionally provides registered presentation
  components and internal navigation only. Arbitrary customer scripts, forms,
  executable code, and unbounded external links remain unsupported.
- Real AI discovery and generation require a healthy server-only provider,
  billing/quota, and an entitled model tier. Mock mode remains deterministic
  for local and browser tests.

### Commit

- `feat(web): add prompt-to-site publishing` (this phase commit)

## Phase 31 — Prompt-to-workflow automation

Status: completed

### Implemented

- Replaced the standalone workflow composer's hard-coded Mock provider, Mock
  device, Mock folder, and fake save notification with cost-aware Auto routing
  through the configured OpenAI, Claude, or Gemini provider.
- Accepted meaningful workflow requests from two characters onward in both the
  workflow composer and Assistant Plan mode. The planner now treats short
  phrases as complete requests, infers a manual trigger and conservative
  bounded defaults, and records every inference as an assumption.
- Loaded the authenticated Tenant's real Desktop Agent and approved folder
  aliases. The planner prefers an online Agent, never sends absolute paths, and
  falls back to a safe cloud target when no Agent is paired.
- Switched workflow planning to provider-portable JSON generation: OpenAI uses
  Responses JSON mode, Gemini uses JSON MIME output without an incompatible
  shared response schema, and Claude relies on the strict JSON-only planner
  contract. Website generation retains its provider-native strict schema mode.
- Derived the canonical planner provider schema from the same strict Zod output
  contract used after generation. Every response still passes strict JSON,
  Workflow v1, registered-node, execution-target, DAG, permission, and bounded
  repair validation before the application can use it.
- Automatically persisted each validated plan as a real Tenant-scoped inactive
  workflow and immutable first version. Save failures keep the validated
  preview visible and offer a bounded retry instead of claiming success.
- Removed hard-coded order-folder and personal-device claims from the workflow
  review. Permission and risk summaries now reflect the selected trusted
  context and the actual generated nodes.
- Preserved explicit approval boundaries: automatic planning and draft
  persistence do not activate a workflow, dispatch a run, write a file, call an
  external service, or approve a destructive action.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 178 tests across 41 files
- `pnpm build:web`: passed — 42 generated pages, including the authenticated
  short-prompt workflow composer and draft APIs
- `pnpm exec playwright test e2e/mock-workflow.spec.ts`: passed — short prompt,
  automatic validated plan, real draft persistence, node review, and no-write
  Dry Run
- `pnpm build:desktop`: not applicable — no Desktop code changed

### Known limitations

- This phase has not been deployed to Vercel. The production site will keep its
  previous behavior until this commit is pushed and a Production deployment
  succeeds.
- Local Excel and folder automations require a paired Desktop Agent plus
  explicitly approved folder aliases. AI may plan only the safe cloud subset
  when no Agent is available and never fabricates local authority.
- Real provider success still depends on a valid server-only credential,
  account model access, provider billing/quota, and an enabled model mapping.
  Provider errors fail closed without persisting or executing a workflow.

### Commit

- `feat(web): automate short-prompt workflow planning` (this phase commit)

## Phase 32 — Account-verified AI model routing

Status: completed

### Implemented

- Added server-only model inventory discovery for the configured OpenAI,
  Anthropic, and Gemini accounts. Platform administration now reports the exact
  account response count and offers only account-returned IDs in each tier:
  Claude 10, Gemini 41, and OpenAI 125 during production acceptance.
- Replaced fixed member/provider routing with audited tier mappings that resolve
  the exact selected model for Assistant chat, workflow planning, the workflow
  composer, and Website Studio. Free members currently see the three enabled
  Economy choices while locked Store tiers remain visible and disabled.
- Added the hosted model-tier migration and database assertions so an enabled
  mapping must reference an exact account-verified model before ordinary member
  routing may use it.
- Added provider-specific request and response handling, model diagnostics, and
  safe error classification. The OpenAI `insufficient_quota` response is now
  rendered as a quota limitation instead of a generic provider failure.
- Preserved native structured-output schemas for bounded Website Spec
  generation while keeping the larger Workflow v1 request portable across the
  three providers.
- Added a canonical Workflow v1 example and bounded repair feedback to planning.
  If the final model response remains invalid, the rejected output is never
  released; the server substitutes a validated, disabled, read-only
  `data.validate` draft that preserves the authenticated execution target and
  requires an approved source or Desktop Agent before expansion.
- Capped workflow output at 4,096 tokens to match the reserved request budget.
  All provider repair attempts are aggregated into one usage settlement, and a
  reservation is settled exactly once on its terminal outcome.
- Deployed Vercel Production deployment
  `dpl_EJUopytHPpkz6Yu4Nom3d2whHSdt` and aliased it to
  `https://www.erin-aiworkflowstudio.com`.

### Production acceptance

- Claude `claude-haiku-4-5-20251001`: exact selection and live streaming chat
  passed.
- Gemini `gemini-3.5-flash-lite`: exact selection and live streaming chat
  passed.
- OpenAI `gpt-5.6-luna`: exact selection and provider call passed through the
  platform boundary; the configured OpenAI project returned
  `insufficient_quota`, and the member UI correctly displayed the quota warning.
- Gemini workflow planning: passed after bounded AI attempts and safe
  normalization. The resulting one-node Workflow v1 plan passed validation and
  was persisted as an immutable review draft with Read 1, Write 0, External 0,
  Destructive 0. No Run was created and no action was executed.
- Platform administration showed keys only as verified/not configured state and
  never returned credential values. Exact model inventory dropdowns rendered for
  all three providers.
- Authenticated smoke checks passed for Dashboard, Assistant, Website Studio,
  new Workflow, Schedules, Runs, Usage, Settings, and Platform Admin.
- Production logs showed successful Claude, Gemini, workflow-plan, and
  review-draft requests with no usage-settlement failure. The only provider
  error in the final pass was the expected OpenAI account quota response.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 189 tests across 43 files
- `pnpm build:web`: passed — 42 generated application pages
- Hosted Supabase migration
  `202607280009_account_verified_ai_models.sql`: applied successfully
- `pnpm build:desktop`: not applicable — no Desktop code changed

### Known limitations

- OpenAI generation is externally blocked until billing or credits are enabled
  for the same OpenAI project/service account that owns the Production key.
  Claude and Gemini remain available, and Auto can route around that provider.
- The Free plan unlocks only Economy models. Standard, Advanced, and Flagship
  choices require verified Microsoft Store entitlement mappings; the production
  administrator page currently reports zero Store product mappings.
- A safe-normalized workflow is intentionally conservative and read-only. File
  access, richer CSV processing, scheduling, and execution require a paired
  Desktop Agent or explicitly approved connector/folder authority.

### Commit

- `feat(web): route account-verified AI models` (this phase commit)

## Phase 33 — Production prompt-to-site acceptance

Status: completed

### Implemented

- Added a compact, schema-validated Website Blueprint contract for live model
  output and a deterministic server compiler that expands it into the existing
  registered-component Website Spec without accepting HTML, JavaScript, shell
  commands, credentials, arbitrary URLs, or unregistered components.
- Added bounded, server-constructed fallback briefs and Website Specs for
  safely recoverable provider and structured-output failures. Every fallback
  remains inside the existing Tenant allowance, usage settlement, immutable
  version, and validation boundaries.
- Added Gemini structured-output support that preserves prompt guidance while
  requesting JSON output, plus safer provider-response and error
  classification for production Website Studio operations.
- Hardened CTA normalization so an omitted title or body is derived only from
  existing validated brief content and cannot produce an invalid empty block.
- Repaired the production publication response path. The atomic Supabase RPC
  performs the release, then the server re-reads and verifies the active
  publication before returning success; a completed release can no longer be
  misreported as failed because of a provider-specific composite-row response
  shape.
- Deployed Vercel Production deployment
  `dpl_DuiUyQ3Eh3ZM9Rmpc3LCwpV9jdiE` and aliased it to
  `https://www.erin-aiworkflowstudio.com`.

### Production acceptance

- Gemini `gemini-3.5-flash-lite` created the validated Website Studio edit
  `v5 · Gemini 正式發布驗證` for the four-page city-florist project.
- Explicit authenticated publication confirmation completed without an error
  state, and the editor reported `目前公開版本 · v5`.
- An unauthenticated HTTP request to
  `https://www.erin-aiworkflowstudio.com/s/site-a45676dc-89ac69a7` returned
  `200 OK`, the public renderer CSP disabled scripts, forms, external
  connections, media, and embedding, and no dashboard authentication redirect
  occurred.
- Browser checks loaded both the public homepage and
  `/s/site-a45676dc-89ac69a7/services`, including their validated navigation,
  content, CTA, and footer.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 206 tests across 46 files
- `pnpm build:web`: passed — 42 generated application pages
- `pnpm build:desktop`: not applicable — no Desktop code changed

### Known limitations

- Published sites still use the platform path `/s/{siteSlug}`. Tenant wildcard
  subdomains, portable ZIP export, and customer-owned domains are the next
  isolated hosting phases.
- Customer-authored scripts, forms, executable code, arbitrary external assets,
  and model-supplied deployment configuration remain intentionally unsupported.

### Commit

- `feat(web): prove production prompt-to-site acceptance` (this phase commit)

## Phase 34 — Tenant wildcard subdomain hosting

Status: completed

### Implemented

- Added a strict host resolver for exactly one normalized publication slug below
  `sites.erin-aiworkflowstudio.com`. Apex, nested, unrelated, malformed, and
  port-bearing spoof variants are rejected before a publication lookup.
- Added a Proxy boundary that internally rewrites wildcard-host page requests to
  the existing `/s/{siteSlug}` safe renderer while removing any client-supplied
  internal routing header. Requests on ordinary platform hosts continue through
  the existing Supabase session refresh path.
- Kept wildcard site requests outside dashboard authentication and cookie
  refresh. Only the matching immutable public-asset endpoint bypasses the page
  rewrite; unrelated API paths cannot be reached through a customer site host.
- Added renderer routing modes so wildcard-host navigation uses clean
  publication paths such as `/services`, while the existing platform path
  remains a compatible fallback.
- Updated Website Studio's published-site action to open the stable HTTPS
  wildcard URL rather than the compatibility `/s/{siteSlug}` route.
- Added focused tests for hostname normalization, one-label isolation, inner
  page rewrites, asset scoping, stable HTTPS URLs, and clean wildcard
  navigation.
- Added `*.sites.erin-aiworkflowstudio.com` to Vercel and associated it with the
  production project. Vercel reports the wildcard on its edge network with the
  platform-managed nameservers.
- Deployed Vercel Production deployment
  `dpl_Bj8vxawybBsXny5MVx69eG34g5gG` and aliased it to both
  `https://www.erin-aiworkflowstudio.com` and the wildcard site host.

### Production acceptance

- Public DNS resolved
  `site-a45676dc-89ac69a7.sites.erin-aiworkflowstudio.com` to the Vercel edge.
- Unauthenticated HTTPS requests using the real wildcard hostname returned
  `200 OK` for both `/` and `/services`.
- The generated `/services` document contained clean `/index`, `/services`,
  `/story`, and `/contact` navigation links and did not expose the internal
  `/s/{siteSlug}` rewrite path.
- The public response retained the restrictive Website Studio CSP and matched
  the existing safe publication renderer rather than a dashboard route.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed, including a repeat after the production build
- `pnpm test`: passed — 212 tests across 47 files
- `pnpm build:web`: passed — 42 generated application pages
- `pnpm build:desktop`: not applicable — no Desktop code changed

### Known limitations

- DNS-negative caches in already-open browsers may briefly retain an earlier
  not-found result immediately after wildcard provisioning. Authoritative DNS
  and an unauthenticated TLS request to the Vercel edge passed.
- Published sites remain registered-component static documents. Customer
  scripts, server code, arbitrary uploads, and executable model output remain
  intentionally unsupported.
- Portable ZIP export and customer-owned domain onboarding are the next
  isolated phases.

### Commit

- `feat(web): add wildcard site hosting` (this phase commit)

## Phase 35 — Portable static website export

Status: completed

### Implemented

- Added an authenticated, tenant-scoped export route for one exact immutable
  Website Studio version:
  `/api/websites/{projectId}/versions/{versionNumber}/export`.
- Added a deterministic ZIP builder that emits portable `index.html` and
  `page-{slug}.html` files, validated local PNG assets, a machine-readable
  manifest, a human-readable README, and per-file SHA-256 integrity metadata.
- Kept exported navigation and image references local to the archive. The
  exported document does not depend on dashboard sessions, platform API paths,
  wildcard rewrites, or a running AI Workflow Studio server.
- Reused the registered-component safe renderer and rejected missing assets,
  invalid PNG content, unsupported asset references, path traversal, excessive
  file counts, and oversized archives before download.
- Added metadata-only `website.export.downloaded` audit events. Exported content,
  prompts, credentials, provider responses, and asset bytes are not written to
  the audit log.
- Added an exact-version `Export ZIP` action to every Website Studio version
  history row, including clear copy that the archive contains local HTML,
  assets, manifest metadata, and SHA-256 checksums.
- Restricted customer ZIP downloads to active paid plans, including the
  existing billing grace state. Free, trial, canceled, and incomplete customer
  subscriptions receive no download action and are rejected again by the
  server route. Platform administrators retain support and production-QA
  access without becoming a customer-plan bypass.
- Confirmed Website Studio AI discovery, initial generation,
  natural-language modification, and image generation already reserve and
  settle against the Tenant monthly AI cost allowance. Model-tier access and
  single-request ceilings continue to follow the subscription plan.
- Added `fflate` for bounded in-memory ZIP generation without temporary
  secret-bearing application state.
- Deployed Vercel Production deployment
  `dpl_GcCjW5aywd8RigHcM5ua44KyJ4uM` and aliased it to
  `https://www.erin-aiworkflowstudio.com`.

### Production acceptance

- An authenticated administrator downloaded
  `site-a45676dc-v5.zip` from the production Website Studio editor.
- The archive SHA-256 is
  `d2320c8d557633331f88995798d01a36f33346f9d1d6bf17130ccc32a589b24d`.
- `unzip -t` passed for all seven files. The archive contained four portable
  pages (`index`, `services`, `story`, and `contact`), `manifest.json`,
  `integrity.sha256`, and `README.txt`.
- `shasum -a 256 -c integrity.sha256` passed for every listed file.
- Every navigation target resolved to another local HTML file. Acceptance scans
  found no platform `/api/` or `/s/` dependency, script element, traversal
  segment, or absolute local-system path.
- After the paid-plan gate deployment, the platform administrator support path
  downloaded the same v5 archive again with the identical deterministic
  SHA-256. Unit acceptance covers denial for free, trial, canceled, and
  incomplete customer subscriptions.
- Browser interaction followed the production wildcard navigation through the
  homepage, services, story, contact, and back to the homepage. Every page
  loaded its expected heading and content without redirecting to authentication
  or a dashboard route.

### Validation

- Focused Website Studio renderer/export/access tests: passed — 17 tests
- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 220 tests across 49 files
- `pnpm build:web`: passed — 42 generated application pages, including the
  version export API route. The initial sandboxed attempt could not bind a
  Turbopack worker port; the same build passed on the permitted unrestricted
  retry and in Vercel Production.
- `pnpm build:desktop`: not applicable — no Desktop code changed

### Known limitations

- The archive is intentionally a static, registered-component website. It does
  not include customer-authored scripts, server code, secrets, executable model
  output, or platform credentials.
- This production version references no generated image assets, so its accepted
  archive has no `assets/` directory; PNG asset packaging is covered by focused
  deterministic export tests.
- Customer-owned domain onboarding is the next isolated hosting phase.

### Commit

- `feat(web): add portable website export` (this phase commit)

## Phase 36 — Customer-selected platform subdomains

Status: completed

### Implemented

- The user clarified that customer-owned external domains are not part of the
  desired product. The required experience is a customer-selected label on the
  existing verified wildcard:
  `{customer-name}.sites.erin-aiworkflowstudio.com`.
- The previously applied
  `202607280010_customer_custom_domains.sql` migration remains immutable in
  migration history but its external-domain table is not exposed by application
  routes or UI.
- Phase 36 now adds normalized 3–63 character platform labels, reserved-name
  rejection, authenticated availability checks, globally unique active
  publication reservation, stable re-publication, and transactional collision
  protection.
- Free and paid customers may publish on the platform wildcard. Customer source
  ZIP and future GitHub delivery remain paid-only.
- Added future Phase 37 AI-first website briefs, Phase 38 paid GitHub site
  publishing, Phase 39 guided safe payment/API integrations, and Phase 40
  end-to-end website delivery acceptance to the execution plan. Free users
  remain allowed to create, preview, and publish on platform hosting; ZIP and
  future customer GitHub delivery remain paid-only.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed after regenerating the current Next.js route types
- `pnpm test`: passed — 222 tests across 49 files
- `pnpm db:test`: passed against a fresh local database, including restricted
  RPC access, stable re-publication, and selected-label coverage
- `pnpm build:web`: passed — 42 routes, including the authenticated subdomain
  availability API and excluding the discarded external-domain routes
- `pnpm security:scan-client`: passed — 34 client files scanned
- `pnpm build:desktop`: not applicable — no desktop files changed
- `pnpm exec supabase db push --linked`: passed — applied
  `202607280011_platform_subdomain_names.sql` to the linked production project

### Production state

- Git commit `ca43162` was pushed to `codex/ai-workflow-platform`.
- Production deployment `dpl_6EB7E2b6qxi6aK4RzwbvP1fEr6Vk` is Ready and is
  aliased to the platform apex, `www`, Vercel fallback, and
  `*.sites.erin-aiworkflowstudio.com`.
- Unauthenticated HTTPS returned `200` for the platform homepage, an existing
  wildcard site homepage, and its `/story` inner page.
- Authenticated production browser acceptance confirmed that
  `erin-customer-demo-20260728` is reported available with the expected full
  wildcard URL, the reserved `www` label is rejected, and the existing active
  publication label remains available to its own project. The browser was
  restored to the existing label without publishing or changing the live site.
- Removed `VERCEL_CUSTOM_DOMAIN_TOKEN`,
  `VERCEL_CUSTOM_DOMAIN_PROJECT_ID`, and `VERCEL_CUSTOM_DOMAIN_TEAM_ID` from the
  Vercel project. The account-level token named
  `AI Workflow Studio Custom Domain Production` is no longer referenced and
  should be revoked after explicit account-deletion confirmation.
- The default Website Studio brief is still the six-step questionnaire. The
  user-approved Phase 37 design replaces it with one natural-language direction
  prompt, bounded AI follow-ups, an inferred review summary, and the existing
  questionnaire as optional advanced settings.
- Customer-generated sites are not yet pushed to a customer's GitHub account,
  and payment/API integration modules are not yet implemented. Those are the
  explicitly pending Phase 38 and Phase 39 scopes and must not be represented as
  available customer features.

### Commit

- `ca43162` — `feat(web): add customer-selected platform subdomains`

## Phase 37 — AI-first website brief

Status: completed

### Implemented

- Replaced the default six-step Website Studio entry with one prominent
  natural-language request. Customers can describe the business, desired
  feeling, pages, and outcomes in ordinary language before choosing a model and
  allowed performance tier.
- Added a schema-validated AI discovery contract that may infer conservative
  non-material defaults and return at most three unique material follow-up
  questions.
- Added one batch answer submission for all pending questions. The experience no
  longer forces the customer through a fixed six-question loop.
- Added a reviewable AI summary for purpose, audience, brand direction, content,
  pages, and calls to action before any Canvas generation or quota reservation.
- Kept the full six-step editor as a collapsed optional advanced section for
  customers who require precise overrides.
- Preserved all existing Website Brief and Website Spec validation, Tenant
  authorization, quota settlement, registered-component rendering, versioning,
  and explicit publishing controls.
- Updated the Website Studio copy and end-to-end acceptance to Phase 37 and the
  current customer-selected wildcard URL.
- Revoked the Vercel account token named
  `AI Workflow Studio Custom Domain Production`. Platform-selected subdomains do
  not need a Vercel access token or customer DNS automation.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 223 tests across 49 files
- `pnpm build:web`: passed — 42 generated application pages
- `pnpm security:scan-client`: passed — 34 client files scanned
- `pnpm exec playwright test e2e/website-studio.spec.ts --workers=1`: passed —
  2 tests
- `pnpm build:desktop`: not applicable — no Desktop code changed

### Production acceptance

- Git commit `788c9d8` was pushed to `codex/ai-workflow-platform`.
- Vercel Production deployment `dpl_A4cbwhPrkuwcUNBcVJynczfEDBzb` is Ready and
  aliased to `https://www.erin-aiworkflowstudio.com`,
  `https://erin-aiworkflowstudio.com`,
  `https://ai-workflow-studio-desktop.vercel.app`, and
  `https://*.sites.erin-aiworkflowstudio.com`.
- An authenticated production user entered one request for a fashionable,
  professional Taiwanese handmade fragrance brand website with four named
  pages. AI safely inferred the remaining purpose, audience, brand, content, and
  calls to action without unnecessary questions.
- The production review summary exposed all inferred decisions before
  generation. The advanced six-step editor remained collapsed.
- Explicit Canvas generation completed with Gemini in one validated attempt and
  produced a four-page, 16-block Website Spec.
- The production Canvas rendered the homepage and navigation for Home, Brand
  Story, Product Features, and Contact. Visual editing, responsive device
  controls, natural-language modification, image generation controls, version
  history, and explicit publishing remained available.
- The acceptance project is intentionally left as an unpublished draft named
  `台灣手作香氛品牌網站`; no public customer site was changed or published.

### Known limitations

- Phase 38 customer GitHub publishing and Phase 39 guided payment/API
  integrations remain intentionally unimplemented.
- A full Playwright invocation also exercised unrelated suites against a reused
  mock process; three unrelated tests observed accumulated mock state or
  ambiguous locators. The isolated Phase 37 Website Studio suite passed 2/2,
  and the complete Vitest suite passed 223/223.

### Commit

- `788c9d8` — `feat(web): add AI-first website brief`

## Phase 38 — Paid GitHub site publishing

Status: completed

### Implemented

- Added a paid-only GitHub delivery panel to Website Studio. Free members may
  still create, preview, edit, and publish on the platform wildcard, but only an
  active paid Tenant owner or admin can transfer source to GitHub.
- Added a revocable least-privilege GitHub App flow with an installation setup
  URL, OAuth callback with state and PKCE protection, exact installation-owner
  validation, short-lived repository-scoped installation tokens, and immediate
  revocation of the temporary GitHub user token.
- Added exact repository, immutable Website Spec version, and
  `ai-workflow-studio/` managed-branch selection. A separate confirmation is
  required before every new external write.
- Reused the deterministic Phase 35 static source builder and added a transfer
  scan that rejects unsafe paths, private keys, credential-like values, local
  absolute paths, and executable model output before GitHub receives any file.
- Added root-tree Git commits that do not rewrite the repository default branch.
  Existing managed branches can be updated only when their `manifest.json`
  identifies the same Website Project.
- Added idempotent publication attempts and server-only GitHub connection/
  publication tables. Stored and audited metadata is limited to identifiers,
  bounded state/error codes, integrity digests, and commit metadata; source,
  prompts, customer content, OAuth tokens, and installation tokens are not
  persisted.
- Added bilingual configuration, locked, connection, repository, confirmation,
  progress, failure, and success states without exposing provider configuration
  or credentials to ordinary users.
- Documented the GitHub App permissions, production callback/setup URLs,
  server-only Vercel variables, revocation boundary, and acceptance checklist.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 235 tests across 52 files
- `pnpm db:test`: passed — fresh migrations, RLS/privilege assertions,
  cross-Tenant checks, and seed validation
- `pnpm build:web`: passed — 47 generated application pages and the five new
  GitHub App/source-delivery server routes. The sandboxed attempt could not bind
  a Turbopack worker port; the same build passed on the permitted unrestricted
  retry and in Vercel Production.
- `pnpm security:scan-client`: passed — 34 client files scanned
- `pnpm exec playwright test e2e/website-studio.spec.ts --workers=1`: passed —
  2 tests, including exact version/repository selection, explicit confirmation,
  deterministic source digest, and successful idempotent Mock GitHub delivery
- `pnpm build:desktop`: not applicable — no Desktop code changed

### Production acceptance

- Applied `202607280012_paid_github_site_publishing.sql` to the linked
  production database and configured the GitHub App exclusively through five
  protected Vercel Production variables.
- The GitHub App is configured for Metadata read and Contents read/write, OAuth
  during installation, repository selection by the installing customer, no
  webhook delivery, and a production callback on the platform domain.
- Git commits `1ecbd0b`, `59b51a9`, `6be57e2`, `dc6802b`, `6db3531`,
  `a2f8e0f`, and `eb6f33c` were pushed to
  `codex/ai-workflow-platform`. The final account-normalization fix accepts the
  additional public fields in real GitHub installation responses but stores
  only the validated login and account type.
- Vercel Production deployment `dpl_Fm9zHKjUBHYDtuq4B2RpEtvj3MtU` is Ready.
  Authenticated acceptance through `https://www.erin-aiworkflowstudio.com`
  completed the state/PKCE OAuth flow and returned to the Website Studio project
  with a saved, revocable GitHub App connection.
- The live repository picker exposed only the repository selected during App
  installation. The exact immutable website v1 source was explicitly confirmed
  and pushed to `ai-workflow-studio/site-e1741111`; the repository default
  branch was not modified.
- GitHub returned commit
  `9f4719ce8f372388ae9b4a5257fae1a1e600f277`. Connector-backed readback verified
  `index.html`, three inner pages, `manifest.json`, `integrity.sha256`, and
  `README.txt` on the managed branch. The manifest identifies four pages and
  every file digest listed by the integrity document matches the deterministic
  source package metadata.

### Known limitations

- Phase 39 guided payment/API integrations remain intentionally unimplemented.
- GitHub delivery writes generated static site source to a managed branch; it
  does not deploy that repository or change its default branch.

### Commit

- `1ecbd0b` — `feat(web): add paid GitHub website publishing`
- `eb6f33c` — final live-response compatibility fix

## Phase 39 — Guided site delivery

Status: completed

### Implemented

- Replaced the sequential hosting and GitHub panels with one explicit delivery
  choice. Customers may choose platform hosting or GitHub/self-deployment
  without changing the validated Canvas version.
- Made the platform wildcard the recommended default. The UI now states that
  only the customer-selected address label is required and that GitHub, DNS,
  external hosting, and a separate deployment are not required.
- Replaced the GitHub repository picker with a pasted HTTPS GitHub repository
  URL. The URL parser rejects credentials, query strings, fragments, non-GitHub
  hosts, non-HTTPS schemes, ports, and malformed owner/repository paths.
- Matches the normalized URL only against repositories explicitly returned by
  the connected least-privilege GitHub App installation. A pasted repository
  that is valid but not authorized cannot enable the external write.
- Preserved paid-plan, owner/admin, immutable version, explicit confirmation,
  deterministic source digest, idempotency, managed-branch, and no-token
  controls from Phase 38.
- Added an automatically tailored deployment guide after a successful push. It
  carries the exact repository and managed branch into allowlisted Vercel,
  Cloudflare Pages, or GitHub Pages instructions and links only to official
  provider destinations.
- External deployment remains optional. Customers may switch back to the
  platform subdomain path and let AI Workflow Studio host the site directly.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 237 tests across 53 files
- `pnpm build:web`: passed — 47 generated application pages. The first
  sandboxed attempt could not bind a Turbopack worker port; the identical
  permitted retry compiled successfully.
- `pnpm security:scan-client`: passed — 34 client files scanned
- `pnpm exec playwright test e2e/website-studio.spec.ts --workers=1`: passed —
  2 tests covering prompt-to-site, Canvas, editing, versions, image generation,
  platform hosting, pasted GitHub URL validation, authorization matching,
  managed-branch push, and deployment-provider guidance
- `pnpm build:desktop`: not applicable — no Desktop code changed

### Known limitations

- The deployment assistant gives bounded, provider-specific instructions and
  opens the customer-owned provider console; it does not hold external provider
  credentials or deploy on the customer's behalf.
- Payment and external API integration guidance remains the isolated Phase 40
  scope. Complete free/paid delivery acceptance remains Phase 41.
- The requested operation video remains intentionally paused until Phase 40
  integrations and Phase 41 delivery acceptance are complete.

### Production acceptance

- Git commit `de221d6` was pushed to `codex/ai-workflow-platform`.
- Vercel Production deployment `dpl_YFtuLuaHGRmvGjXsEiXiYswKvNnv` is Ready and
  serves `https://www.erin-aiworkflowstudio.com` plus the existing wildcard
  platform-site domain.
- Authenticated production acceptance confirmed that an unauthorized pasted
  GitHub repository is rejected, an App-authorized repository is recognized,
  and the push action remains locked until the exact-version confirmation is
  checked. No additional repository write was made during acceptance.
- The recommended platform path accepts only the first wildcard subdomain label
  and reported `site-e1741111.sites.erin-aiworkflowstudio.com` as available
  without asking for GitHub, DNS, or deployment credentials.
- Read-only public acceptance verified the already published example site's
  `/index`, `/services`, `/story`, and `/contact` pages, including the expected
  page titles and main content.

### Commit

- `de221d6` — `feat(web): add guided website delivery`

## Phase 40 — Guided site integrations

Status: completed

### Implemented

- Added one persisted integration workspace for four allowlisted website
  modules: Resend contact delivery, Vercel Web Analytics, Stripe-hosted
  Checkout, and a Supabase Edge Function API proxy.
- Each guide declares the customer-owned provider account, official setup
  destination, required server component, exact callback/server paths, data
  flow, privacy impact, deployment prerequisites, public placeholder names,
  server-only secret names, and provider-specific test requirements.
- The browser accepts only completion booleans. It never accepts or persists a
  token, provider key, webhook secret, OAuth credential, payment credential, or
  arbitrary provider URL.
- Runtime Zod validation rejects a provider assigned to the wrong module and
  rejects explicit test acceptance until every prerequisite and provider test
  has passed.
- Saved readiness plans are Tenant- and Website Project-scoped. Only owners and
  workspace administrators may manage them; only the service role can access
  the database table.
- Test acceptance records the confirming user and time and writes a bounded
  audit entry containing only the module, allowlisted provider, and status.
- Static generated websites keep backend-dependent modules disabled. The
  readiness workspace does not claim that payment collection, message
  delivery, analytics, or API forwarding is live before the customer deploys
  and tests the required provider-owned service.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 240 tests across 54 files
- `pnpm db:test`: passed — fresh migrations, RLS/privilege assertions,
  cross-Tenant checks, and seed validation
- `pnpm build:web`: passed — 47 generated application pages, including the new
  Website Integration Plans server route. The sandboxed attempt could not bind
  a Turbopack worker port; the identical permitted retry compiled
  successfully.
- `pnpm security:scan-client`: passed — 34 client files scanned
- `pnpm exec playwright test e2e/website-studio.spec.ts --workers=1`: passed —
  2 tests covering prompt-to-site, Canvas, images, versions, publishing,
  delivery choices, provider guidance, all safety confirmations, and
  non-secret readiness persistence
- `pnpm build:desktop`: not applicable — no Desktop code changed

### Production acceptance

- Git commit `8aa108d` was pushed to `codex/ai-workflow-platform`, and
  `202607280013_guided_site_integrations.sql` was applied to the linked
  production database.
- Vercel Production deployment `dpl_9DmfHskRTz4NBj5MduTm4hXWfvMw` is Ready and
  serves the primary, apex, Vercel, and existing wildcard platform-site
  aliases.
- Authenticated read-only acceptance on the production Website Studio project
  confirmed that the four-module integration workspace loads successfully.
- The Stripe guide exposes only the allowlisted server variable names
  `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, includes no credential input,
  contains no test or live secret value pattern, and links to the official
  Stripe Sandbox key page.
- Explicit provider-test acceptance remains disabled until all provider
  account, server runtime, secret-location, callback, privacy, and test
  prerequisites are checked. Production acceptance did not falsely mark a
  payment or external API provider test as passed and made no provider write.

### Known limitations

- Phase 40 provides a validated, persisted, and auditable integration contract;
  it intentionally does not collect live payments, forward live customer data,
  or accept provider credentials inside AI Workflow Studio.
- A module becomes eligible for controlled implementation only after the
  customer deploys its backend in the customer-owned environment and completes
  the provider-specific test. This avoids showing a non-functional contact,
  checkout, analytics, or external API feature on a static site.
- Complete Free/paid/administrator delivery acceptance was deferred to Phase 41.
  The requested operation video remained paused until that acceptance completed.

## Phase 41 — Website delivery acceptance

Status: completed

### Implemented

- Centralized the Website Studio delivery entitlement matrix so the browser and
  server enforce the same rules:
  - Free owners may create, edit, preview, version, and publish platform-hosted
    websites, but may not download source, push to GitHub, or manage payment/API
    implementation guidance.
  - Active paid editors may download the selected immutable Website Spec version
    as a static ZIP, but may not perform GitHub writes or manage integrations.
  - Active paid owners and workspace administrators may download, publish to an
    authorized GitHub repository, and manage guided integrations.
  - Platform administrators retain the existing support override; ordinary
    members do not inherit it.
- Replaced the integration workspace with a bilingual paid-feature explanation
  when the session lacks the required plan or role. The corresponding server
  route independently rejects the same unauthorized request.
- Added deterministic acceptance coverage for Free, paid editor, paid workspace
  administrator, and platform administrator contexts.
- Added website AI usage acceptance coverage proving that generation reserves
  quota before work, records provider/model usage, settles the reservation, and
  increases the Tenant's metered cost after successful completion.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 244 tests across 55 files
- `pnpm db:test`: passed — every migration was applied to a fresh database and
  the RLS, Tenant isolation, idempotent seed, workflow run, Website publishing,
  subdomain, and model-mapping assertions passed
- `pnpm build:web`: passed — 47 application pages and all Website Studio server
  routes compiled successfully
- `pnpm security:scan-client`: passed — 34 generated client files scanned
- `pnpm exec playwright test e2e/website-studio.spec.ts`: passed — 2 Chromium
  tests covering one-sentence creation, necessary AI follow-up, advanced
  six-decision intake, Canvas preview, generated images, multi-page navigation,
  conversational editing, versions, explicit publishing, platform subdomains,
  paid delivery, GitHub guidance, and non-secret integration readiness
- `pnpm build:desktop`: not applicable — no Desktop code changed

### Production acceptance

- Git commit `4feaa83` was pushed to `codex/ai-workflow-platform`.
- Vercel Production deployment `dpl_95WXgG3S3RqqjJD1ydosgH9ewdRZ` is Ready and
  serves the primary, apex, Vercel, and wildcard platform-site aliases.
- Authenticated production acceptance confirmed that the platform administrator
  support session can load ZIP, GitHub, publishing, and the four-module guided
  integration workspace. The rendered browser content contained no password,
  Stripe test/live key pattern, or Google API-key pattern.
- Deterministic role-matrix tests cover the unavailable separate production
  Free, paid-editor, and paid-workspace-administrator sessions without creating
  temporary customer accounts or changing production subscriptions.
- Public read-only acceptance confirmed that the published example site's
  `/index`, `/services`, `/story`, and `/contact` pages return successfully with
  their expected page titles and contain no tested credential pattern.
- No integration was falsely enabled during acceptance. Payment, contact,
  analytics, and external API modules remain disabled until a customer-owned
  backend and provider-specific test are explicitly accepted.

### Video readiness

- Website functionality acceptance is complete. The operation video may now be
  produced only from the safe mock environment with synthetic files and cropped
  framing that excludes administrator identity, passwords, API keys, provider
  dashboards, and production credentials.

## Phase 42 — Full-stack website admin

Status: completed

### Implemented

- Added a bilingual, authenticated Website Project admin area reached from the
  existing Canvas workspace. Workspace viewers receive read-only access while
  owners and administrators can manage content and contact-message status.
- Added safe CMS entries with stable content keys, page targeting, draft versus
  published state, bounded titles and bodies, and runtime validation. Published
  entries are rendered only on the matching page of the active public site.
- Added an accessible server-rendered contact form to published pages that
  explicitly contain a validated contact action. Canvas previews and portable
  static exports remain non-submitting.
- Added a public contact endpoint with strict form schemas, a 16 KB request
  boundary, honeypot field, five-message ten-minute sender limit, escaped
  success/error documents, no client script, and no credential handling.
- Added a project-scoped contact inbox with `new`, `read`, and `archived`
  states. Status mutations are authenticated, Tenant checked, and audited.
- Added `website_content_entries` and `website_form_submissions` migrations with
  foreign keys, constraints, indexes, updated timestamps, RLS, authenticated
  member reads, service-only mutations, and bounded non-PII audit metadata.
- Added explicit future phase gates for site-user identity and roles, custom
  data and actions, files and analytics, and full-stack role acceptance. The UI
  labels those modules as planned instead of implying they are already live.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 247 tests across 56 files
- `pnpm db:test`: passed — fresh migrations, RLS/privilege assertions,
  cross-Tenant visibility, and authenticated mutation denial passed
- `pnpm build:web`: passed — 47 application pages, including the authenticated
  website admin page and both new server routes, compiled successfully. The
  sandboxed Turbopack attempt could not bind its worker port; the identical
  permitted retry passed.
- `pnpm security:scan-client`: passed — 35 generated client files scanned
- `pnpm exec playwright test e2e/website-studio.spec.ts --grep 'creates, refines'`:
  passed — one Chromium flow covered prompt-to-site, Canvas, publishing, CMS
  publication on the public page, public contact submission, inbox receipt,
  and status update
- `pnpm build:desktop`: not applicable — no Desktop code changed

### Known limitations

- This phase establishes a real website backend, but it is not yet full parity
  with a general full-stack website platform. Site-user registration and roles,
  custom collections/actions, private files, analytics, and their combined
  acceptance remain Phases 43–46.
- CMS entries are intentionally bounded text records rather than arbitrary HTML
  or executable customer code.
- Contact anti-abuse controls are intentionally conservative and do not replace
  a future provider-level bot or abuse service for high-volume public sites.
- Phase 42 has not been pushed or deployed to Production in this phase.

## Phase 43 — Site users and access

Status: completed

### Implemented

- Kept every published customer site on the existing platform-hosted URL model:
  the stable `/s/{siteSlug}` compatibility path and customer-selected
  `{name}.sites.erin-aiworkflowstudio.com` wildcard subdomain continue to serve
  the same reviewed Website Spec release.
- Added opt-in public registration, password login, logout, and a bilingual
  member account screen. Site identities use Supabase Auth in production but
  receive no AI Workflow Studio workspace membership or workspace permissions.
- Added distinct per-site `member`, `staff`, and `manager` roles plus active and
  suspended states. Each published page can remain public or require a reviewed
  minimum role; role hierarchy and suspension are enforced server-side before
  rendering any CMS content.
- Added a project-scoped Website Admin access panel with conservative
  deterministic suggestions, a complete per-page access matrix, explicit owner
  or workspace-administrator confirmation, registration control, member role
  management, and immediate suspension.
- Added atomic access-matrix persistence, site membership records, RLS,
  service-only writes, updated timestamps, audit events, foreign keys, bounded
  indexes, and a 5,000-member per-site safety limit.
- Added email-confirmation handling that returns confirmed site users to their
  site account without creating a platform workspace. Authentication pages use
  no client script, are not indexed or cached, and allow form submission only to
  the exact current platform or customer subdomain origin.
- Added the member account link to published navigation while preserving
  multi-page rendering, CMS content, contact forms, Canvas previews, versioned
  publishing, and the existing platform-subdomain workflow.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 252 tests across 58 files
- `pnpm db:test`: passed — all migrations applied to a fresh database; site
  access RLS, cross-Tenant isolation, workspace/site membership separation,
  service-only mutation, reviewed-matrix persistence, and audit assertions
  passed
- `pnpm build:web`: passed — 47 application pages and all site identity,
  confirmation, access-administration, and protected public-site routes compiled
  successfully. The sandboxed Turbopack attempt could not bind its worker port;
  the identical permitted retry passed.
- `pnpm security:scan-client`: passed — 35 generated client files scanned
- `pnpm test:e2e e2e/website-studio.spec.ts`: passed — 2 Chromium tests covered
  prompt-to-site, Canvas, versioned platform publishing, CMS, contact inbox,
  reviewed page protection, cross-origin authentication rejection, new site
  registration, protected content access, member suspension, paid delivery, and
  GitHub/integration guidance
- `pnpm build:desktop`: not applicable — no Desktop code changed

### Known limitations

- Phase 43 adds the safe identity and access foundation, not the entire Codex
  Sites feature set. Schema-driven site collections and bounded actions remain
  Phase 44; private files and site analytics remain Phase 45; combined
  multi-role production acceptance remains Phase 46.
- Site registration is disabled by default. AI suggestions never activate
  protection until an owner or workspace administrator reviews every current
  page and explicitly saves the complete matrix.
- Phase 43 has not been pushed or deployed to Production in this phase.

## Phase 44 — Site data and actions

Status: completed

### Implemented

- Added reviewed, declarative website collections with text, long-text, number,
  boolean, date, email, select, and same-site reference fields. Collection
  schemas are limited to 24 fields and cannot be changed after records exist.
- Added public and role-protected website forms tied to verified Canvas pages.
  Public forms expose only reviewed non-reference fields, enforce required
  values, and use same-origin checks, a 32 KB request boundary, honeypot
  protection, rate limits, and no-script HTML responses.
- Added safe create, update, and delete record actions with runtime field
  validation, per-request UUID idempotency, optimistic record versions, and
  explicit confirmation for destructive deletion.
- Added an atomic database action boundary that permits only schema-bound record
  mutations. It records metadata-only audit events, keeps values and credentials
  out of audit payloads, and never accepts arbitrary SQL, JavaScript, Python,
  shell commands, or provider credentials.
- Added a conservative `audit-record-created` workflow marker. It can record a
  reviewed creation event but cannot execute arbitrary workflow nodes or user
  code.
- Enforced service-only mutation, Tenant and project RLS, same-site
  relationships, 12 collections, 12 forms, and 5,000 records per site.
- Added a bilingual Website Admin data-and-forms workspace for reviewing
  collections, form roles and fields, active state, bounded workflow markers,
  records, versions, and confirmed deletion.
- Rendered active reviewed forms on the published platform path and wildcard
  subdomain while preserving page access roles from Phase 43.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 259 tests across 60 files
- `pnpm db:test`: passed — fresh migrations, idempotent action replay,
  optimistic updates, confirmed deletion, metadata-only audits, service-only
  mutation, role separation, and cross-Tenant RLS assertions passed
- `pnpm build:web`: passed — 47 application pages, including the authenticated
  website data administration route and public form submission route, compiled
  successfully. The sandboxed Turbopack attempt could not bind its worker port;
  the identical permitted retry passed.
- `pnpm security:scan-client`: passed — 35 generated client files scanned
- `pnpm test:e2e -- e2e/website-studio.spec.ts`: passed — all 10 Chromium
  acceptance tests passed, including collection and form creation, public
  rendering, same-origin submission, cross-origin denial, record visibility,
  version normalization, and explicit deletion.
- `pnpm build:desktop`: not applicable — no Desktop code changed

### Known limitations

- Phase 44 intentionally provides schema-bound server actions rather than
  arbitrary customer databases or executable server code.
- The `audit-record-created` marker records a safe event for later integration;
  it is not a general workflow-node executor.
- Private file uploads, analytics, and their site-level controls remain Phase 45. Combined public visitor, site-member, operator, workspace, and platform
  administrator acceptance remains Phase 46.
- Phase 44 has not been pushed or deployed to Production in this phase.

## Phase 47 — Intelligent Work cloud automation

Status: completed

### Implemented

- Expanded the versioned workflow allowlist with bounded Gmail read, Google
  Forms response read, AI summary, report composition, professional Google
  Slides creation, Gmail draft/send, and allowlisted Apps Script deployment
  nodes. Workflow intent coverage rejects drafts that omit a requested source or
  result.
- Rebuilt planning context on the server from Tenant-owned Google connections
  and paired Desktop folder aliases. Model output cannot inject a connection,
  device, or folder identifier supplied by the browser.
- Added encrypted, service-role-only Google Workspace connection persistence.
  OAuth scopes are explicit and cover only the implemented Gmail, Forms,
  Sheets, Slides, Drive-file, and reviewed Apps Script capabilities.
- Added production cloud execution through the versioned workflow engine with
  step timeouts, idempotency, progress records, approvals, usage controls,
  notifications, and metadata-only audit events. External mutations are never
  executed before approval.
- Added real provider-backed AI summaries. The Work model provider and model
  level selected by the user are written into the validated summary node and
  used again during execution. Platform administrators receive the complete
  configured Business model-level matrix; ordinary members retain Store plan
  and budget enforcement.
- Added a server and database platform-administrator override for monthly AI
  and metered-source allowances. It does not bypass provider health, model
  allowlists, per-request bounds, rate limits, audit events, or usage records.
- Added bounded Gmail body extraction, Google Forms response retrieval, Gmail
  draft creation, professional Slides generation with optional image and
  reference inputs, and three reviewed Apps Script templates. Arbitrary user or
  model-generated code is never deployed.
- Extended the Desktop Excel executor with automatic header discovery,
  multi-sheet and multi-workbook consolidation, deterministic data transforms,
  and styled Excel reporting.
- Added a bounded `data.inline` source plus intent coverage that rejects a
  summary/report plan unless it contains the complete source → AI summary →
  report path. The safe fallback now produces that three-node cloud flow instead
  of a single validation placeholder.
- Changed the assistant Work action to one-click automatic execution: one
  explicit user action creates the immutable validated version, activates the
  workflow, and starts the Cloud or Desktop run. External, write, and
  destructive nodes still pause at their required approval boundary.
- Added first-run approval reuse per immutable workflow version. An approved
  `first_run` version may continue automatically on later runs; nodes configured
  with `always` approval continue to pause every time.
- Added Cloud Work schedule targets and a durable, idempotent Production tick
  implementation. The explicitly authorized
  `202608010003_cloud_workflow_schedules.sql` migration is applied in Production.
- Improved the workflow Canvas with numbered service nodes, service icons, and
  visible directed connections while retaining the product's own identity.
- Ran the consolidation implementation against 481 actual `.xlsx` workbooks:
  776 worksheets and 3,911 detail rows were processed with 0 read failures; 533
  sheets exposed a numeric total. The verified workbook is stored locally at
  `outputs/phase47-cost-automation/成本單整合與分析報告.xlsx` and remains outside
  Git.
- Added a deterministic, grounded Desktop Excel plan for natural-language
  consolidation requests: approved-folder discovery, Excel read, duplicate
  removal, status aggregation, and styled Excel report generation are emitted
  as validated workflow JSON without arbitrary commands or hidden paths.
- Hardened Desktop job execution and packaging. Heartbeats now serialize only
  signed agent-protocol folder-alias fields, safe failure codes distinguish
  validation from unexpected errors without exposing local data, and ExcelJS is
  loaded as a packaged runtime dependency so `.xlsx` parsing behaves the same in
  tests and the Electron application.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 288 tests across 64 files, including complete Work
  intent coverage, the bounded inline source, Cloud schedule target validation,
  packaged Desktop Excel execution, and the existing usage-control, website,
  and Google Workspace tests
- `pnpm build:web`: passed — 47 application pages and all Work, Google, run,
  approval, schedule, and Website routes compiled successfully. The sandboxed
  Turbopack attempt could not bind its worker port; the identical permitted
  retry passed.
- `vercel env ls production`: confirmed the server-only `CRON_SECRET` is already
  configured for Production; no secret value was read or exposed.
- `pnpm build:desktop`: passed — packaged main, preload, and renderer bundles
  compiled successfully with the runtime spreadsheet parser externalized from
  the Electron main bundle
- `pnpm security:scan-client`: passed — 35 generated client files scanned
- `pnpm db:test`: passed — every migration applied to a fresh PostgreSQL 16
  container; Tenant isolation, platform-administrator boundaries, AI model
  mappings, website data actions, workflow schedules, idempotent seed, and all
  remaining database assertions passed
- The five explicitly authorized Supabase migrations were applied to
  Production and local/remote migration versions matched through
  `202608010002_platform_admin_usage_override.sql`.
- The sixth Cloud-schedule migration and seventh platform-administrator
  workflow-limit migration were explicitly authorized and applied to
  Production. Local and remote migration versions now match through
  `202608010004_platform_admin_workflow_limit_override.sql`.
- Commit `9794f24` was pushed to `codex/ai-workflow-platform`; Vercel Production
  deployment `dpl_AgBDuPZttxsdEk6nnDdURRwCJ83D` completed and was aliased to
  `https://www.erin-aiworkflowstudio.com`.
- Authenticated Production acceptance reached the Work planner with the
  platform administrator and verified that all configured providers and model
  levels were selectable. The request exposed a real quota defect:
  `USAGE_BUDGET_EXCEEDED` was returned for the administrator. The tested fix was
  applied through `202608010002_platform_admin_usage_override.sql` and matching
  server checks.

### Production acceptance

- `202608010003_cloud_workflow_schedules.sql` received explicit authorization
  and was applied successfully to Production on 2026-08-01. Local and remote
  migration versions now match through that migration.
- The owner confirmed the Production Vercel account is Pro. A secured
  fifteen-minute Vercel Cron tick is therefore included for unattended
  recurring Cloud and Desktop workflow dispatch.
- Authenticated Production testing exposed two additional defects before a run
  could be accepted: Auto stopped after the first provider failure, and the
  reviewed three-node plan failed while creating its immutable workflow draft.
  Auto now retries the next verified provider for bounded provider, quota,
  timeout, response, or validation failures. Draft persistence now reports only
  a safe stage name and database error code to server logs, without prompt,
  credential, or business-data content. The corrected cloud-fallback text also
  describes the complete source → AI summary → report flow it actually builds.
- A repeated authenticated Production attempt isolated the remaining `23514`
  failure to the Store subscription workflow-count trigger: the Tenant had
  reached its Free workflow allowance before the platform-administrator
  acceptance Run could create its immutable workflow. The applied migration
  `202608010004_platform_admin_workflow_limit_override.sql` gives only an active
  platform administrator a workflow/Run-count support override. Normal members,
  inactive administrators, device/member limits, validation, approval, provider,
  rate, audit, and usage controls remain enforced.
- The defect-fix verification passed `pnpm format:check`, `pnpm lint`,
  `pnpm typecheck`, all 279 tests, and the 47-page Production web build. The
  first sandboxed Turbopack attempt could not bind its worker port; the
  identical permitted retry passed.
- The workflow-limit fix passed formatting, lint, strict typecheck, all 279 unit
  tests, and the 47-page Production web build. Before authorization,
  `supabase db push --dry-run` confirmed that only
  `202608010004_platform_admin_workflow_limit_override.sql` was pending. After
  authorization, the linked push succeeded and the local/remote migration list
  matched. The isolated database test was subsequently completed successfully
  after the local Docker daemon became available; no test was disabled or
  bypassed.
- Authenticated Production acceptance then created immutable Workflow v1 and
  Run `bb978787-ab86-49ed-b4cb-fa7af0551cd8` from one natural-language request.
  The validated graph contained `data.inline` → `ai.summarize` →
  `report.compose`. Its single non-destructive first-run write approval was
  reviewed and approved; attempt 1 completed all three nodes successfully. The
  Run detail showed the complete queued, running, succeeded, and
  `cloud_run.succeeded` audit sequence plus completion notifications. Cloud Run
  success is recorded only after every step output summary is persisted.
- Initial acceptance showed that Google OAuth server variables were absent;
  after they were configured, the connected Production account passed bounded
  Gmail, Sheets, Forms, and Slides-capable connection acceptance. Gmail Run
  `89316612-1224-4124-b7db-e80113e8ecfb` completed as a self-addressed draft
  without sending mail; Sheets Run `807c1915-c17e-460a-ac92-379d628af04e` and
  Forms Run `501a7ad9-5dc3-4615-b951-683c3d16d226` completed successfully. No
  message body, credential, or customer content was recorded in these notes.
- A fresh Desktop Agent pairing completed a real packaged-Electron Excel
  workflow. Run `c9c8bc5f-a048-4baa-93c2-58bd2ba6f6c2` listed one approved
  workbook, read six rows, removed one duplicate, aggregated five rows into
  three status totals, and wrote a styled report. Independent workbook
  inspection confirmed Paid `4,970`, Pending `880`, and Cancelled `450`, with no
  spreadsheet formula errors.
- The local Docker daemon was started and the complete isolated database suite
  passed after aligning two test-only assertion grants with the service-role
  contexts they exercise. No Production table, role, or credential was changed
  by this test.
- The canonical Production application and previously deployed Phase 47 cloud
  routes were used for live acceptance. The new Desktop packaging and permanent
  regression-test changes are source changes for the next signed Desktop
  release; they do not alter the accepted cloud execution boundary.

## Phase 48 — Bilingual run operations

Status: completed

### Implemented

- Added a presentation-only localization boundary for workflow names,
  allowlisted node types, audit actions, actor types, and platform notification
  text. Immutable stored audit and notification records remain unchanged.
- Replaced technical node identifiers in Run details with readable Traditional
  Chinese or English step names. Unknown customer-defined values and future
  event codes remain visible instead of receiving an invented translation.
- Added bidirectional handling for the existing English Production Cloud
  notices and the Traditional Chinese Desktop notices, including dynamic
  workflow-completion messages.

### Validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 293 tests across 65 files, including five bilingual Run
  detail regression tests
- `pnpm build:web`: passed — all 47 application pages compiled successfully.
  The sandboxed Turbopack attempt could not bind its worker port; the identical
  permitted retry passed.
- `pnpm security:scan-client`: passed — 35 generated client files scanned
- `pnpm build:desktop`: not applicable; no Desktop source or packaging code was
  changed
- Vercel Production deployment `dpl_HTJN3B1zxpPzWLLGBdfpiWcwDDod` completed and
  was aliased to `https://www.erin-aiworkflowstudio.com`.
- Authenticated Production acceptance reopened successful Run
  `bb978787-ab86-49ed-b4cb-fa7af0551cd8`. Traditional Chinese showed `需求資料來源`
  → `AI 摘要` → `產生報告`, localized audit actions and localized completion
  notices. Switching to EN changed the same immutable records to English; the
  page was returned to Traditional Chinese after verification.

## Phase 49 — Drive Excel reporting and approved Slides automation

Status: implementation complete; Production acceptance pending

### Implemented

- Added validated `google_drive.read_excel_folder` and
  `google_drive.create_excel_report` nodes. The reader recursively discovers
  `.xls`, `.xlsx`, and Google Sheets in the selected folder, locates headers,
  merges columns and rows with source provenance, and enforces bounded file,
  sheet, row, and byte limits.
- `.xlsx` workbooks are parsed as inert workbook data with a value-only streaming
  reader so large folders do not require hundreds of temporary Google Sheets or
  full in-memory workbook models. Each downloaded workbook uses an isolated
  ephemeral server path that is deleted immediately after parsing; presentation
  styles are not retained, hyperlinks, drawings, and embedded code are excluded,
  formulas are read only as stored results, and macros are never executed.
  Legacy `.xls` files use temporary app-created Google Sheets that are deleted
  after reading. The generated report is uploaded as a new `.xlsx` file in the
  same Drive folder, never overwrites an existing customer file, and uses an
  idempotency marker to suppress duplicate retries.
- Natural-language Drive Excel requests now deterministically plan the complete
  six-node graph: Drive read → Excel report plus AI summary → composed report →
  professional Slides → approved GAS. Slides are moved into the requested
  folder and the GAS template is bound to the created presentation.
- Drive report, Slides, and GAS mutations remain explicit-approval operations.
  GAS remains limited to reviewed templates; no arbitrary JavaScript, Python,
  shell, SQL, or model-produced executable code is accepted.
- Auto model routing now falls back through lower-cost configured tiers after a
  bounded provider/model failure. An explicit member tier remains exact and is
  never silently downgraded.
- Google OAuth now requests `drive.readonly` in addition to the existing
  Workspace scopes. Existing Production connections must be re-authorized
  before the Drive reader can run.
- Gmail source detection is separate from email delivery. A request that says
  `不要寄送郵件` no longer invents a Gmail reader merely because it contains
  the word `郵件`; Gmail is included only when the request identifies inbox
  collection or reading as a source.
- The Drive Excel safety envelope now permits up to 2,000 worksheets, while the
  deterministic planner requests 1,000. This covers the currently observed 776
  worksheets without removing the per-file, row, or byte bounds.
- Connected Google Workspace plans now always target the Cloud executor, even
  when a paired Desktop Agent is available. Production acceptance exposed and
  cancelled one incorrectly queued Desktop attempt before it processed data.
- The grounded Drive planner now uses the existing 20 MB per-`.xlsx` source
  hard limit instead of a stricter 5 MB planning value. Production acceptance
  confirmed that the current folder also contains legacy `.xls` workbooks. A
  legacy file larger than the 5 MB multipart boundary now uses Drive's bounded
  resumable-upload protocol for temporary Google Sheets conversion and remains
  capped by the same reviewed 20 MB source limit.
- Production retry passed the former request-validation boundary and exposed
  the 120-second single-node execution timeout while reading the 481-workbook
  folder. Independent `.xlsx` downloads now use a fixed concurrency ceiling,
  while results remain merged in deterministic filename order.
- The bounded parallel implementation still reached the former 120-second
  limit during Production acceptance. Validated Cloud nodes now receive a
  four-minute ceiling inside the existing five-minute Vercel Pro route window;
  retry routes declare the same five-minute request duration explicitly.
- Authenticated Production Run `7d5bc26f-d245-4aaf-8a23-406c01cdfdb6` confirmed
  that the ExcelJS streaming reader still exceeded the new four-minute node
  ceiling before downstream writes began on attempt 2. The replacement reader
  directly parses only allowlisted workbook XML with SAX, rejects more than
  64 MB of selected decompressed XML, excludes workbook presentation metadata,
  creates no temporary workbook file, raises the bounded download ceiling from
  8 to 16, and has regression coverage at the hard 500-workbook envelope.
  A fresh Production Run `4f629f4b-3c97-4689-bcfe-13d8fca59309` verified that
  the replacement parser passed the former implementation boundary but still
  exceeded the four-minute node limit for the 481-workbook folder. The Vercel
  Pro Cloud routes now use the documented 800-second Fluid Compute ceiling, the
  Drive reader has a ten-minute per-step ceiling, and its deterministic bounded
  download pool is raised from 16 to 24. Retry initialization also starts a
  fresh bounded Run timeout window instead of retaining the previous attempt's
  expired deadline. Commit `c82bedb` was deployed as Vercel Production
  `dpl_2S2Yh4YAwCJn1Bkq3eTiKdCpCgM9`, and the canonical domain resolved to that
  deployment. Attempt 2 correctly received a new Run deadline and remained
  active beyond the former four-minute boundary, but the same Drive node still
  exceeded its new 600-second limit. No report, Slides, Apps Script project, or
  email was produced. Production acceptance therefore remains blocked on a
  resumable cloud-batch architecture; a single Vercel invocation is not an
  accepted execution strategy for this 481-workbook folder.
- Replaced that single-invocation boundary with an unattended, resumable Cloud
  source. Drive discovery creates a deterministic manifest; each invocation
  reads at most 40 files, obtains an optimistic ten-minute lease, and persists
  the validated cursor, rows, columns, source provenance, and bounded progress
  into the current Run step. Vercel Pro now invokes the secured scheduler every
  minute and resumes at most one eligible Drive batch per tick. The browser may
  close after the Run starts; no member retry is required between batches.
- The workflow engine can restore only validated outputs for node IDs present in
  the same immutable workflow. Restored source nodes are recorded as succeeded
  with zero new attempts, and downstream report, Slides, and approved GAS nodes
  execute only after the durable Drive source reaches its manifest boundary.
  Unknown node IDs, malformed checkpoints, cursor/file mismatches, overlapping
  leases, row/sheet/file limits, and oversized durable state fail closed.
- A new paired-Desktop handoff foundation avoids sending Google OAuth tokens or
  raw local paths across the control plane. A claimed Agent renews its lease,
  obtains a bounded manifest, and downloads each Google Sheet export or native
  `.xlsx` through a short-lived HMAC token bound to the exact job, node, and file.
  Filenames are kept outside the signed URL token and sanitized for macOS and
  Windows before use.
- The Desktop Agent stages at most 500 workbooks, each at most 20 MB, with a
  bounded six-download pool inside an authorized per-Run job directory. Writes
  are no-overwrite, atomic, hash-verified, retry-idempotent, and reject traversal
  and symlink work directories. Workbook reading uses a separate bounded pool,
  creates a new consolidated report, and can open only the verified `.xlsx`
  result through an injected operating-system handler.
- The grounded planner emits the five-step Drive download → local read → local
  merge → local report → open result graph only when the trusted request contains
  a paired device, approved folder alias, Google connection, and Drive folder.
  The local runtime separately requires read and write permission on that alias.
  The Gateway now validates grounded plans against intent and trusted execution
  context before bypassing a provider. An Excel-only flow no longer pretends to
  satisfy requested AI summary, report, Slides, GAS, or email work.
- This foundation does **not** satisfy visible human-like Computer Use. The merge
  still runs in the bounded local executor and only the completed workbook is
  opened. No claim is made that Excel menus, mouse, keyboard, browser Gmail, or
  other native application UI were operated. That acceptance belongs to pending
  Phase 50 and requires packaged-Agent, operating-system permission, state
  verification, user takeover, and high-impact approval tests.

### Local validation after the resumable Cloud implementation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 314 tests across 68 files, including Drive workbook
  conversion/merge/export, value-only streaming at the 500-workbook hard limit,
  three-batch checkpoint continuation, cursor-conflict rejection, restored-node
  execution boundaries, six-node planning, approval catalog, exact Slides
  count, GAS presentation binding, model-tier fallback, and fresh retry
  timeout-window initialization
- `pnpm build:web`: passed — all 47 application pages compiled successfully.
  The sandboxed Turbopack attempt could not bind its worker port; the identical
  permitted retry passed.
- `pnpm security:scan-client`: passed — 35 generated client files scanned
- `pnpm build:desktop`: not applicable; no Desktop source or packaging code was
  changed.

### Paired-Desktop handoff validation

- `pnpm format:check`: passed
- `pnpm lint`: passed
- `pnpm typecheck`: passed
- `pnpm test`: passed — 323 tests across 69 files, including claim-bound Drive
  transfer tokens, native workbook download and Google Sheets export, bounded
  staging, retry idempotency, filename collision handling, pre-creation symlink
  rejection, approved-folder containment, consolidated workbook creation, and
  the injected result-open boundary.
- `pnpm build:web`: passed — all 47 application pages compiled successfully.
  The sandboxed Turbopack attempt could not create its worker process; the
  identical permitted retry passed.
- `pnpm build:desktop`: passed — main, preload, and renderer bundles compiled.
- `pnpm security:scan-client`: passed — 35 generated client files scanned.
- Production deployment and packaged-Agent acceptance have not been performed
  for this handoff. Visible mouse, keyboard, Excel-menu, browser, Gmail, and LINE
  operation remains unimplemented and must not be presented as completed.

## Phase 50 — Visible Computer Use

Status: first Excel slice implemented; packaged-Agent acceptance pending

### Implemented

- Added the approval-gated `excel.visible_review` node. The grounded
  Drive-to-Desktop plan now ends with this node instead of presenting a plain
  operating-system `open` call as visible automation.
- Added a Desktop-only Computer Use controller that is disabled by default,
  requires a local opt-in, checks the operating-system accessibility grant, and
  exposes a bilingual local status plus an immediate user-takeover control.
- The first allowlist contains only fixed Excel semantic actions: open the
  approved workbook, select its visible worksheet, auto-fit rows and columns,
  save, and verify that the frontmost Excel window still belongs to the exact
  approved workbook. The model cannot provide AppleScript, PowerShell, shell,
  JavaScript, arbitrary keys, or screen coordinates.
- macOS uses a fixed System Events keyboard sequence against the frontmost
  Microsoft Excel process. Windows uses the fixed Excel ribbon key sequence
  through the visible foreground window. Both implementations fail closed when
  the expected workbook window cannot be verified.
- Added the macOS Apple Events usage description and hardened-runtime automation
  entitlement required by the packaged Agent. Accessibility permission remains
  a separate explicit user-controlled operating-system grant.
- Run progress accepts only the allowlisted Computer Use action codes and stores
  the current safe action in the existing step summary. Traditional Chinese and
  English Run views display that action without storing local paths, screen
  contents, workbook data, or credentials.
- Computer Use audit events contain action codes, platform identifiers, and a
  SHA-256 path hash. A raw local path is never included. Denied permissions,
  mismatched workbooks, interruption, and user takeover fail closed.

### Validation

- `pnpm format:check`: passed.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed across all 14 applicable workspace projects.
- `pnpm test`: passed — 332 tests across 70 files, with the separately gated
  real Excel acceptance test skipped by the deterministic suite.
- `pnpm build:web`: passed — all 47 application pages compiled successfully.
  The sandboxed Turbopack attempt could not bind its worker port; the identical
  permitted retry passed.
- `pnpm build:desktop`: passed — main, preload, and renderer bundles compiled.
- `pnpm security:scan-client`: passed — 35 generated browser files scanned.
- The fixed macOS Excel automation script passed a compile-only test without
  opening or changing a workbook.
- A real macOS acceptance attempt created and opened only a temporary workbook,
  then failed before the first keyboard action with operating-system error
  `-25211`: `osascript` was not allowed accessibility access. No customer file
  was modified. This test is intentionally recorded as failed, not passed.

### Remaining acceptance work

- Grant Accessibility and Automation permission to the signed, packaged Desktop
  Agent, then repeat the real temporary-workbook test and verify the visible
  selection, auto-fit, save, state checks, interruption, and takeover behavior.
- Repeat packaged acceptance on Windows. The Windows keyboard path is built and
  unit-tested through the common allowlisted controller but has not been run on
  a Windows host.
- This first slice visibly reviews and formats the verified consolidated output;
  the high-volume merge itself is still performed by the bounded deterministic
  local executor. It does not yet claim that hundreds of source workbooks are
  merged through Excel's visible UI.
- File-manager, Gmail, Google Sheets, and LINE visible operations remain outside
  this slice. They must reuse the accepted permission, action, takeover, state
  verification, approval, and redacted-audit runtime before they can be enabled.

### Visible Google Drive download slice

- Added the approval-gated Desktop-only
  `google_drive.visible_download_folder` node. The grounded planner now emits a
  visible Drive download before local Excel read, merge, report, and visible
  review when the user explicitly requests Chrome/Desktop-style operation.
- The model can provide only a validated Google Drive folder identifier, an
  approved local folder alias, and bounded file/count/time limits. It cannot
  provide JavaScript, AppleScript, shell commands, selectors, coordinates, or
  keystrokes.
- The macOS driver opens the exact allowlisted Drive folder in Chrome, verifies
  its origin and folder path, focuses a visible Drive item, asks the packaged
  Agent to issue the fixed Select All keyboard action, verifies the localized
  Download control, and clicks only that fixed control. Chrome's Apple Events
  JavaScript permission remains an explicit browser setting controlled by the
  local user.
- The Agent snapshots only the locally approved destination, waits for a new
  completed workbook or Drive ZIP, rejects partial or ambiguous downloads, and
  safely extracts only bounded `.xls` and `.xlsx` entries into a per-run work
  directory. ZIP traversal, symlinks, unsupported types, oversized entries,
  excess files, duplicate collisions, timeouts, and folder mismatches fail
  closed.
- Run progress and the local Agent show bilingual semantic actions for opening
  the approved folder, selecting items, requesting the download, and verifying
  the local result. Audit records contain only action codes, platform values,
  folder-ID/path hashes, counts, and content hashes; raw paths, Drive contents,
  credentials, and screen contents are not logged.

### Validation after the visible Drive slice

- `pnpm format:check`: passed.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed across all 14 applicable workspace projects.
- `pnpm test`: passed — 338 tests across 70 files, with one separately gated
  real operating-system acceptance test skipped by the deterministic suite.
- `pnpm build:web`: passed — all 47 application pages compiled successfully.
  The sandboxed Turbopack attempt could not create its worker process; the
  identical permitted retry passed.
- `pnpm build:desktop`: passed — main, preload, and renderer bundles compiled.
- `pnpm --filter @ai-workflow-studio/desktop package:test`: passed and produced
  an ad-hoc-signed macOS arm64 test application with the stable
  `com.aiworkflowstudio.agent` identifier. The earlier generic-`Electron`
  bundle was preserved at
  `/private/tmp/AI Workflow Studio Agent.unsigned-identifier.app`.
- The fixed Chrome AppleScript passed compile-only validation outside the Codex
  process sandbox; the sandbox cannot load Chrome's scripting dictionary but
  the identical non-executing macOS compile succeeded.
- The installed test bundle advertises the visible Drive capability. The local
  Accessibility switch has been enabled, but the first launch under the stable
  identity still requires the user-controlled macOS Keychain prompt to unlock
  the encrypted pairing record. Real Drive selection/download acceptance also
  requires explicit authorization of the browser download folder. No Drive
  item was selected, downloaded, or changed during this validation.
- Local macOS test packages are now ad-hoc signed after packaging with the
  stable `com.aiworkflowstudio.agent` identifier. This keeps Accessibility
  consent attached to the Agent bundle during local acceptance; it is not an
  Apple Developer ID signature or notarization.

### Desktop-to-Cloud report continuation

- Extended the grounded visible Drive plan so one approved natural-language
  request can continue after local Excel consolidation into `ai.summarize`,
  `report.compose`, `google_slides.create`, and the allowlisted
  `apps_script.deploy_template` node when those outputs are explicitly
  requested. The local Excel result remains a new non-overwriting workbook in
  the approved folder.
- Added a claim-bound Agent continuation route. It accepts only the four reviewed
  cloud node types from the immutable job, renews the existing lease, reconstructs
  the original authorized workspace on the server, and persists each result with
  a node-specific input hash before the Agent can complete the Run. A retry with
  the same hash reuses the saved result; a changed input fails closed.
- The Desktop Agent does not upload the workbook, rows, raw paths, filenames, or
  Google credentials. It computes a bounded path-free profile with row, sheet,
  file, numeric, and capped categorical statistics. Strict per-node schemas
  require profile → AI summary → report → Slides → GAS predecessor types and
  reject local paths, arbitrary payloads, or reordered continuation steps.
- The planner now honors a user-selected online Agent only after matching it to
  the Tenant-owned device list. A Downloads request chooses only a read/write
  alias named Downloads/下載項目; it never substitutes another folder. Ambiguous
  writable folders fail closed. Google-only work remains Cloud-targeted even
  when an Agent is online.
- Run details now display the validated AI summary and report content, a
  allowlisted `docs.google.com` Slides link, GAS deployment metadata, and the
  bilingual visible Drive action. Raw spreadsheet envelopes and untrusted URLs
  never enter the client Run schema.

### Validation after Desktop-to-Cloud continuation

- `pnpm format:check`: passed.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed across all 14 applicable workspace projects.
- `pnpm test`: passed — 351 tests across 71 files, with one separately gated real
  operating-system acceptance test skipped by the deterministic suite.
- `pnpm build:web`: passed — all 47 application pages and the new claim-bound
  Agent cloud-step route compiled. The sandboxed Turbopack attempt could not bind
  its worker port; the identical permitted retry passed.
- `pnpm build:desktop`: passed — main, preload, and renderer bundles compiled.
- `pnpm security:scan-client`: passed — 35 generated browser files scanned.
- No Production deployment, Google write, real Drive download, workbook upload,
  GAS deployment, or packaged-Agent acceptance was performed in this slice.
  Phase 50 remains in progress until the documented macOS and Windows real-app
  acceptance gates pass.

### Drive execution hardening and authorization guidance

- Corrected the Desktop Agent lease-renewal boundary to validate the server's
  wrapped `{ job }` response. Long-running download, consolidation, and cloud
  continuation work no longer aborts solely because the renewed lease was
  parsed as a bare Job.
- Hardened the fixed macOS Drive selection flow. The Agent now focuses a visible
  Drive item through a verified screen coordinate, issues the allowlisted Select
  All key code only after the item is focused, and checks that the selection is
  not a single unexpanded item before requesting a download.
- The download action now resolves exactly one visible and unobscured localized
  Download control, clicks it through System Events, and fails closed when the
  control is missing or ambiguous. It detects and closes a Share dialog rather
  than treating that unrelated external action as a requested download.
- The AI Workspace now presents the Drive → Downloads → Excel → summary →
  report → Slides → approved GAS request as its bilingual Plan example. Missing
  Google Workspace or Desktop/Downloads prerequisites receive specific guidance
  and direct links to Connections or Devices instead of a generic provider
  failure.

### Validation after Drive execution hardening

- `pnpm format:check`: passed.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed across all 14 applicable workspace projects.
- `pnpm test`: passed — 354 tests across 72 files; the separately gated real
  Excel operating-system acceptance test remains skipped by the deterministic
  suite.
- `pnpm build:web`: passed — all 47 application pages compiled successfully.
  The sandboxed Turbopack attempt could not bind its worker port; the identical
  permitted retry passed.
- `pnpm build:desktop`: passed — main, preload, and renderer bundles compiled.
- `pnpm security:scan-client`: passed — 35 generated browser files scanned.
- `pnpm --filter @ai-workflow-studio/desktop package:test`: passed after the
  permitted network retry and produced the ad-hoc-signed macOS arm64 test
  application.
- The fixed Chrome AppleScript passed a non-executing compile outside the
  process sandbox. Local browser QA confirmed the bilingual Drive-to-Excel
  heading and Plan example with no browser warnings or errors.
- No Production deployment, push, Google write, real Drive selection/download,
  workbook upload, Slides creation, or GAS deployment was performed. Phase 50
  remains in progress until the documented macOS and Windows real-app acceptance
  gates pass.

### Supabase Disk I/O retry-storm remediation

- Traced the production Disk I/O warning to a logical workflow-run
  compare-and-set conflict that raised PostgreSQL serialization SQLSTATE
  `40001`. PostgREST retried that business-state conflict continuously, creating
  millions of rollback log entries despite the database containing only a small
  amount of application data.
- Added immutable migration
  `202608030001_nonretryable_state_conflicts.sql`. Workflow-run and Google
  connection-operation state conflicts now return PostgREST `PT409`, preserving
  HTTP conflict semantics without triggering serialization retries.
- Added regression coverage for stale workflow-run transitions and repeated
  completion of the same idempotent Google connection operation. Both paths must
  raise `PT409`; authenticated clients still cannot execute either service-only
  database function.
- Updated the orchestration runbook to distinguish non-retryable business-state
  conflicts from retryable transaction failures.

### Validation after the Supabase retry-storm remediation

- `pnpm db:test`: passed — a fresh local Supabase database applied every
  migration and passed all tenant-isolation, idempotency, and SQL regression
  tests, including the two new `PT409` assertions.
- `pnpm format:check`: passed.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed across all 14 applicable workspace projects.
- `pnpm test`: passed outside the process sandbox — 354 tests across 72 files,
  with one separately gated real operating-system acceptance test skipped. The
  initial sandboxed run had one macOS AppleScript compiler service connection
  failure; the identical permitted run passed without a code change.
- `pnpm build:web`: passed — all 47 application pages compiled successfully.
  The initial sandboxed Turbopack run could not bind its worker port; the
  identical permitted retry passed.
- The linked-production migration dry-run passed and listed only
  `202608030001_nonretryable_state_conflicts.sql`.
- After explicit user approval, the production migration was applied to the
  linked Supabase project. Read-only verification confirmed both live functions
  contain `PT409` and no longer contain `40001`.
- The production `xact_rollback` counter had zero growth between two post-fix
  samples. Supabase Logs Explorer reported the latest `Run status conflict` 314
  seconds before the verification query, confirming that the retry/log storm
  stopped; the historical monitoring warning may remain visible until its
  rolling budget window refreshes.

### Outcome-first Work and local-first Visible Codex hardening

- Reworked the AI workspace into an outcome-first **Work / 工作** experience,
  informed by the interaction structure of OpenWorker without copying its
  branding, assets, or text. The default Plan mode now presents validated
  progress, completed artifacts, exact access requirements, and approvals in
  separate reviewable regions while retaining Ask and Image modes.
- Grounded the requested Visible Codex operation as one reviewed chain:
  visible Chrome Drive download → local Excel read/merge/report → visible Excel
  verification → metadata-only AI summary/report → optional Google Slides → an
  allowlisted Apps Script template. A GAS-only request uses
  `sheet-cost-summary` without inventing Slides; an explicit GAS presentation
  uses Slides and `slides-executive-report`.
- Raised the Desktop Agent protocol/application version to `0.2.0`. Production
  target selection, planning, dispatch, job listing, and direct job claim all
  fail closed for missing or older Agent versions. A stale Agent therefore
  cannot claim an already-pending job left from an earlier Web deployment.
  Device freshness also requires a recent bounded heartbeat; the Agent now sends
  independent heartbeats during long local work.
- Added safe live workbook progress for local `excel.read`. The Agent reports
  only total workbook count plus existing processed file/row counts, so a known
  481-workbook batch can display progress such as `40 / 481` without sending
  filenames, paths, or row data.
- Added bounded legacy `.xls` support through a dedicated worker thread with
  resource limits, timeout/abort handling, OLE signature validation, Traditional
  Chinese codepage support, cached formula values only, and strict file, row,
  sheet, and column bounds. The emitted worker was verified in the packaged
  macOS application.
- Tightened the Desktop-to-Cloud privacy boundary. Only ordinal columns,
  allowlisted semantic hints, counts, capped unlabeled frequencies, and
  sufficiently large metric cohorts may leave the computer. Raw headers,
  category labels, customer/status values, filenames, sheet names, local paths,
  workbook rows, and the workbook itself are rejected before network progress
  or cloud continuation.
- Added immutable migration `202608030002_agent_cloud_step_claim.sql`. Its
  service-role-only RPC atomically claims exactly one pending reviewed cloud
  step, binds it to the stored direct predecessor and canonical input hash, and
  rejects duplicate, reordered, changed-input, or cross-Tenant execution. A
  claimed cloud step now converges to a fixed safe failed record if provider
  execution, output validation, or result persistence fails; the separate audit
  event remains best-effort while the run-step record is authoritative.
- The local batch remains intentionally bounded to 500 workbooks, 100,000 total
  rows, 2,000 aggregate sheets, and configured per-file limits. The normal
  481-file dataset fits those workbook-count bounds, but processing is
  sequential for memory safety and is not represented as instant.

### Validation and production rollout after outcome-first Work

- `pnpm format:check`: passed after final formatting.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed across all 14 applicable workspace projects.
- `pnpm test`: passed outside the process sandbox — 413 tests across 77 files;
  one separately gated real Excel operating-system acceptance test remains
  skipped. The sandboxed AppleScript compiler-service attempt failed as
  expected; the identical permitted run passed without a code change.
- Focused Playwright acceptance passed: all 4 Work conversation/Plan/Image/source
  scenarios plus the existing reviewed mock-workflow scenario.
- `pnpm db:test`: passed against a fresh local Supabase database, including the
  atomic cloud-step claim, duplicate/input-change/predecessor, service-role, and
  Tenant-isolation assertions.
- `pnpm build:web`: passed — all 47 application pages and Agent routes compiled.
  The initial sandboxed Turbopack worker could not bind a port; the identical
  permitted build passed.
- `pnpm build:desktop`: passed; the main bundle includes the emitted
  `legacy-xls-worker.cjs` worker.
- `pnpm security:scan-client`: passed — 35 generated browser files scanned.
- `pnpm audit --prod`: passed with no known vulnerabilities.
- `pnpm --filter @ai-workflow-studio/desktop package:test`: passed and produced
  an ad-hoc-signed macOS arm64 `AI Workflow Studio Agent.app` version `0.2.0`.
- The linked production migration dry-run listed only
  `202608030002_agent_cloud_step_claim.sql`; it was then applied successfully,
  and the remote migration list confirmed local and remote `202608030002` match.
- Vercel production deployment `dpl_4UAFUfRFKwsEmFvsw5AHzgN7rLMQ` reached
  `READY` and was aliased to `https://www.erin-aiworkflowstudio.com`. Authenticated
  production smoke testing confirmed the `Work｜工作` page, default Plan mode,
  Progress/Artifacts/Access & approvals regions, no browser console errors, and
  an explicit update-required state for the connected pre-`0.2.0` Agent.
- No real Drive item was selected or downloaded, no 481-workbook consolidation
  was started, and no real Slides or GAS deployment was performed. Phase 50
  remains in progress until the user installs/opens Agent `0.2.0`, approves one
  exact read/write Downloads alias and macOS permissions, and completes the
  real-app acceptance run; Windows acceptance also remains outstanding.

### Production Desktop pairing recovery

- Production evidence isolated the pairing failure after the Web console had
  successfully created a one-time code. `/api/agent/pair/start` returned `201`,
  while four `/api/agent/pair/complete` attempts returned `500`; the matching
  PostgreSQL entries were SQLSTATE `23514` with the exact safe message
  `free plan device limit reached`.
- The Tenant already had one non-revoked pre-`0.2.0` Desktop device, consuming
  the Free plan's single active-device allowance. Its old authenticated session
  was rejected, and the local encrypted session was subsequently cleared. This
  was not a DNS, Vercel, Supabase connectivity, pairing-code creation, or
  current Desktop-version failure.
- Added the missing operator recovery path. Owners and administrators now get a
  two-stage revoke control that states the token, pending Jobs, active Runs, and
  local-session effects before confirmation. Editors and viewers receive an
  explicit administrator-access explanation. A failed device query now fails
  closed into the safe retry page instead of pretending that the device list is
  empty.
- Added the safe `AGENT_DEVICE_LIMIT_REACHED` protocol response. Only SQLSTATE
  `23514` plus the four exact allowlisted plan/device-limit messages maps to
  HTTP `409`; all other database details remain server-only. Desktop accepts
  only fixed allowlisted Agent error codes and renders bounded bilingual
  guidance without retaining a provider or database message.
- Raised both root and Desktop application versions to `0.2.1`. The Desktop
  preflights operating-system secure storage before consuming a pairing code,
  bounds successful and failed JSON bodies while streaming, bounds binary
  bodies before materializing them, and keeps executor startup an explicit
  local action.
- Added immutable migration
  `202608080001_safe_device_limits_and_revocation.sql`. A name-ordered trigger
  locks the Tenant before the existing active-device count trigger, preventing
  concurrent pairing codes from exceeding the plan allowance. The new
  actor-bound revocation RPC revokes tokens, cancels active Agent Jobs, converges
  their Run and unfinished step records, and writes Run/device audit events in
  one transaction. The unaudited legacy service-role RPC is disabled.
- Normal owners and members remain subject to device/member plan limits. The
  existing platform-administrator support override remains limited to Workflow
  and Run acceptance and does not bypass active-device limits.

### Validation and production rollout after Desktop pairing recovery

- `pnpm format:check`: passed.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed across all 14 applicable workspace projects.
- `pnpm test`: passed outside the process sandbox — 444 tests passed across 82
  files; one separately gated real Excel operating-system acceptance test
  remains skipped.
- `pnpm db:test`: passed against a fresh local Supabase database, including
  Free-plan quota rollback, actor-bound revocation, revoked-device enqueue and
  reactivation guards, terminal-job convergence, and timed-out Run cancellation
  before retry.
- `pnpm test:e2e`: passed — all 10 Chromium end-to-end tests. The two corrected
  assertions now follow the intended automatic Run navigation and the current
  `{ cloudBatches, schedules }` response contract.
- `pnpm build:web`: passed — all 47 application pages and Agent routes compiled.
- `pnpm build:desktop`: passed. The root and Desktop application versions are
  `0.2.1`.
- `pnpm security:scan-client`: passed — 35 generated browser files scanned.
- `pnpm --filter @ai-workflow-studio/desktop package:test`: passed and produced
  an ad-hoc-signed macOS arm64 test application. This is a local package
  acceptance result, not a notarized public Desktop release.
- The linked-production migration dry-run listed only
  `202608080001_safe_device_limits_and_revocation.sql`. It was applied
  successfully, and the remote migration list confirms local and remote
  `202608080001` match.
- Vercel production deployment `dpl_Br6tBj8qNMJxdJvmguFz7YQS2PhK` reached
  `READY` and is aliased to `https://www.erin-aiworkflowstudio.com` plus the
  existing apex and wildcard site aliases.
- Authenticated production smoke testing confirmed that the stale pre-`0.2.0`
  Desktop device is still visible, is correctly marked as requiring an Agent
  update, and exposes the new two-stage revoke warning to an authorized
  administrator. The warning was cancelled during acceptance, and the page
  reported no browser console errors.
- After later explicit user confirmation, the stale device was revoked through
  the production two-stage control and the Free-plan slot was released. A fresh
  one-time code completed pairing from the packaged `0.2.1` test application;
  the encrypted local Session was persisted with owner-only permissions. The
  already-installed compatible `0.2.0` application then loaded that Session,
  started the executor, and maintained recurring successful heartbeats.
- Authenticated Production verification showed exactly one compatible device
  with a fresh green online state and no browser errors. A separately reloaded
  Work page automatically selected the same device as an online execution
  target after the 90-second freshness boundary. No Agent Job or Computer Use
  action was started, and the Agent reported zero pending Jobs.
- Interactive local acceptance used a loopback-only debugging channel with no
  LAN listener. Removing that temporary channel requires one normal Agent
  restart followed by another explicit executor start; therefore the secure
  local handoff, approved Downloads alias, real Drive/Excel/Slides/GAS run, and
  Windows acceptance gates remain outstanding.

### Visible Drive download and GAS authorization hardening

- Raised the root and Desktop application versions to `0.2.2`. The visible
  Drive node now reproduces the reviewed human operation: it opens the exact
  allowlisted Drive folder in Chrome, selects the visible items, invokes the
  unique Download action, and supports either Chrome automatic download or the
  native macOS Save panel before local workbook processing begins.
- Raised the production execution-target compatibility floor to Desktop Agent
  `0.2.2`, so planning and dispatch cannot send this hardened visible Drive
  workflow to an older paired Agent that lacks the corrected download path.
- Bound native Save handling to the original Chrome window, exact Drive folder
  URL, unique `save-panel`, and fixed accessibility identifiers observed on the
  supported macOS build. The Agent enters only the approved Downloads root,
  uses a run-specific short filename, and stops the watcher as soon as the
  expected download is confirmed so it cannot act on a later unrelated dialog.
- Added trusted selection-count checks. A multi-item Drive selection accepts
  exactly one new ZIP; a single item accepts exactly one supported workbook or
  ZIP. A recent active `.crdownload`, multiple candidates, a changed baseline
  file, an unverified destination, or an unrelated file type now fails closed.
- Hardened local staging with bounded `O_NOFOLLOW` snapshots, repeated canonical
  approved-directory checks, abort-aware copy/read/write operations, atomic
  private outputs, deterministic retry naming, and macOS case-collision
  handling. ZIP traversal, symlinks, encryption, compression bombs, excess
  entries, excess workbooks, and byte limits are rejected before the next
  workbook is written.
- The Workflow Engine timeout signal now reaches visible Drive, visible Excel,
  and `excel.read` together with explicit user takeover. The Computer Use
  controller retains one fail-closed operation slot until the underlying visible
  promise actually settles; another visible call during that interval receives
  `COMPUTER_USE_OPERATION_IN_PROGRESS` instead of starting concurrently. This
  prevents overlapping Agent-side visible operations, but does not claim that a
  server retry waits automatically or that aborting the Agent cancels a transfer
  already owned by Chrome. Direct Chrome collision names such as `(1)` reuse
  identical staged content rather than changing the reviewed input set.
- Added Google's required `script.deployments` OAuth scope alongside
  `script.projects`. GAS execution checks both scopes before usage accounting,
  Token access, or the first Apps Script write, then verifies them again after
  Token refresh. Only allowlisted API-executable templates with manifest access
  restricted to `MYSELF` are supported; `web_app` fails before project creation.
- Legacy Google connections are marked for upgrade and excluded only from GAS
  planning. Those records predate storage of a stable Google provider principal,
  so the platform cannot prove a later OAuth grant belongs to the same Google
  account and must not replace credentials behind a reviewed reference. Only a
  Tenant owner or administrator may start and complete the short-lived
  HMAC-bound upgrade flow. Success creates a new encrypted connection with a new
  `connectionId`; the old Workflow and Run references remain unchanged, cannot
  be retried as upgraded, and require a fresh plan.
- Real-folder acceptance remains open. The Save panel exposes only the selected
  directory basename after navigation, so the Agent combines exact-path entry
  with approved-root observation rather than claiming a canonical UI path
  attestation. The large-folder download, snapshot, and ZIP extraction still
  share the 600-second node limit, and stopping the Agent cannot cancel a
  network transfer already owned by Chrome. A packaged `0.2.2` canary must run
  with no existing Save sheet, active partial download, or other concurrent
  browser download before the full Excel/Slides/GAS Run is approved.

### Validation after visible Drive and GAS authorization hardening

- `pnpm format:check`, `pnpm lint`, and `pnpm typecheck` passed across all 14
  applicable workspace projects.
- `pnpm test` passed outside the macOS service sandbox: 485 tests across 85
  files passed; the separately gated real Excel operating-system acceptance
  test remains skipped. The sandboxed AppleScript compiler-service attempt was
  rejected by HIServices, while the identical permitted run passed without a
  source change.
- `pnpm test:e2e` passed all 10 Chromium end-to-end scenarios.
- `pnpm build:web` passed and generated all 47 application pages and Agent
  routes. `pnpm security:scan-client` passed across 35 generated browser files.
- `pnpm build:desktop` passed. The packaged macOS arm64 test application reports
  version `0.2.2`; the ad-hoc signing acceptance verified the complete app and
  embedded helper/framework signatures. This is not a notarized public release.
- The dependency audit initially identified three newly published high-severity
  advisories in transitive packages. Exact pnpm overrides upgraded
  `brace-expansion`, `js-yaml`, and `nanoid` to their patched versions; the full
  test/build gates were repeated afterward and `pnpm audit --prod` then reported
  no known vulnerabilities.
- Focused Desktop regression coverage verifies both manual takeover and Workflow
  Engine timeout when the aborted driver settles asynchronously. In both cases a
  second visible operation fails closed while the first promise remains pending,
  and a later operation starts only after that promise has settled.
- No real Drive item was selected or downloaded, no local customer workbook was
  opened, and no Google Slides or Apps Script project was created during these
  automated gates. Production deployment, Google re-consent, packaged-Agent
  replacement, and the real-folder canary remain separate acceptance actions.

### Production rollout after visible Drive and GAS hardening

- GitHub commit `0ea69d5` was pushed to `codex/ai-workflow-platform`. Vercel
  production deployment `dpl_AdNBeFBeiubhm9WT8b3bYPLzk2eS` reached `READY`
  and received the canonical site, apex, wildcard Sites, and existing Vercel
  aliases.
- The locally packaged, ad-hoc-signed Desktop Agent `0.2.2` replaced the
  installed `0.2.1` test application through a graceful quit. The previous app
  was moved to Trash as a recoverable backup, the new bundle passed strict deep
  signature verification, and it was launched normally without a remote
  debugging listener.
- The new Agent reported version `0.2.2` and an idle Computer Use state. Because
  ad-hoc rebuilds do not preserve a stable Developer ID identity, macOS treated
  this build as a new Accessibility subject. The stale Accessibility decision
  was reset and the correct System Settings pane was opened; explicit local
  re-approval and executor startup remain pending.
- Google Workspace upgrade consent, a fresh GAS plan, the small real-Drive
  canary, and the full large-folder Run remain outstanding. No customer workbook
  or external Google artifact was created during rollout.

## Phase 51 — Visible Drive click hardening

Status: in progress

- Raised the root and Desktop Agent versions to `0.2.4` and raised the Web
  compatibility floor to `0.2.4`. The packaged macOS arm64 Agent was built,
  ad-hoc signed, installed, and verified against the packaged `app.asar`.
- Hardened the visible Drive action so Chrome is brought to the foreground and
  allowed to settle before the trusted coordinate click. Chrome window IDs are
  compared as text, preserving the exact front-window and Drive-folder trust
  checks. The native Save-panel compatibility path tolerates Chrome's missing
  `AXSubrole` attribute only when macOS reports the attribute as absent.
- The completed automated gates are: `pnpm format:check`, `pnpm lint`,
  `pnpm typecheck`, `pnpm test` (490 tests, one gated real-OS test skipped),
  `pnpm build:web`, `pnpm build:desktop`, `pnpm security:scan-client`,
  `pnpm audit --prod`, and 10 Chromium E2E scenarios in a clean server run.
- The first post-reauthorization canary confirmed `permission=granted` and
  reached the real Chrome Drive folder with one item selected. Its download
  verification did not observe a new local workbook, so the run was cancelled
  before Excel, Slides, or GAS nodes. This is an open acceptance issue; no
  customer workbook or external artifact was read or created.
- Corrected the planner route so Desktop Drive-to-Excel requests use the
  existing claim-bound `google_drive.download_excel_folder` transfer by default.
  This path uses the approved Google connection, keeps workbook bytes in the
  authorized local workspace, and does not depend on Chrome windows,
  AppleScript, or macOS Accessibility. `google_drive.visible_download_folder`
  remains available only when the user explicitly asks for visible Chrome or
  human-like clicking.
- Removed the legacy-format gap in the fast claim-bound transfer: Drive `.xls`
  files are now included in the manifest, transferred as bounded raw bytes to
  the approved local workspace, and parsed by the existing local XLS reader.
  They are not uploaded to Drive for per-file conversion, avoiding the slowest
  cloud round trip. Local staging reports a metadata-only workbook checkpoint
  every 20 files (and on completion), while retaining the existing six-file
  download concurrency, size limits, idempotent writes, and cancellation.
- A controlled API-transfer canary reached local staging, Excel read, merge,
  and report for one workbook. It was intentionally cancelled before cloud
  summary, Slides, and GAS because the pre-fix manifest omitted legacy `.xls`
  files. The corrected path is ready for a fresh canary; large-folder
  acceptance and final Slides/GAS continuation remain outstanding.
- The remaining acceptance work is to diagnose the missing local download,
  run a single-workbook API-transfer canary, then separately validate the large
  Drive folder and the complete Excel/report/Slides/GAS chain. This phase is
  not considered production-accepted until those runs succeed.
