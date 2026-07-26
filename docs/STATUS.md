# Project Status

## Current phase

Phase 13 — Security and final acceptance (completed locally)

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
