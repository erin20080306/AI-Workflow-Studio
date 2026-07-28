# Testing

## Principles

- Every phase must finish with all applicable deterministic checks passing.
- Tests must terminate; CI never uses watch mode or leaves a server running.
- Paid APIs and real user data are not required for automated tests.
- A failure is fixed at its cause and is not hidden by disabling a test or
  weakening strict types.

## Standard phase checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm db:test
pnpm build:web
pnpm build:desktop
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @ai-workflow-studio/desktop package:test
```

Only checks relevant to code that exists in the current phase are required. The
status report records each check as passed, failed, or not applicable.

## Planned test layers

### Unit

Unit coverage includes workflow schemas, cycle and unknown-node rejection, risk
classification, path authorization/traversal/symlinks, hashes, Excel
transformations, column mapping, job claim/lease/idempotency, token hashing,
redaction, invalid AI JSON, provider fallback, and Google refresh errors.

Phase 9 spreadsheet fixtures create a real two-sheet `.xlsx`, a CSV, formula
cells with cached values, repeated business keys, and bounded-output targets.
Tests verify Excel/CSV reads, ZIP expansion limits, row/sheet limits, merge,
mapping, filter, deduplication, CSV formula neutralization, source preservation,
temporary-output reread, SHA-256, mandatory overwrite backup, restart-safe
duplicate receipts, stable folder watching, output symlink rejection, and
lexical/real-path traversal rejection.

AI provider tests use injected local transports. They assert endpoint and header
construction, structured-output configuration, response and usage parsing,
bounded repair, refusal/truncation handling, secret-safe errors, and the
invariant that invalid or unaccounted output is never released.
Streaming tests additionally normalize OpenAI, Anthropic, and Gemini SSE events,
enforce bounded chat context/output, propagate cancellation, and require one
terminal provider/usage event before a reply is considered complete.

### Integration

Integration tests cover tenant-aware workflow/version/run/job lifecycles,
completion and failure propagation, role restrictions, tenant isolation, and
destructive-node approvals. Database tests use disposable local or CI instances.

`pnpm db:test` uses a portless, volume-free PostgreSQL 16 container. It creates a
fresh database, applies every migration, verifies required tables and RLS,
exercises owner/viewer and cross-tenant behavior, applies the development seed
twice to verify idempotency, and stops the container through an exit trap.
Agent database assertions also verify hidden pairing hashes, service-role-only
functions, tenant/device-bound atomic claims, active duplicate-claim rejection,
claim-token-bound leases, expired-lease rejection, and event idempotency.
Google database assertions verify that connection ciphertext and write claims
are inaccessible to authenticated clients, tenant/connection foreign keys hold,
idempotency hashes conflict safely, and completed metadata results replay.
Run database assertions verify that authenticated roles cannot mutate Runs or
call service transitions, expected-status compare-and-set transitions succeed,
invalid terminal transitions fail, and audit/notification rows are created in
the same transaction.
AI conversation assertions verify tenant-scoped reads, cross-tenant composite
foreign keys, and service-role-only conversation, message, and usage writes.
Usage-control assertions additionally verify atomic reservations, request-rate
limits, 80%/95%/100% thresholds, actual-cost recording, reservation release,
monthly source/tool allowance consumption, Store-only billing constraints,
service-role-only entitlement synchronization, and audit-safe internal
overrides.
Website Studio database assertions verify Tenant A cannot read Tenant B's
project, brief conversation, or publication history; authenticated browser
roles cannot mutate those resources; a stored draft must carry all six
completion steps and required timestamps; only an authorized service RPC can
publish; and a second release preserves one active slug plus an immutable
superseded record.

### End to end

The required mock path signs in a test user, creates a mock device and folder
alias, plans a workflow with the mock provider, renders its validated preview,
runs a dry run, and displays run details. It must not call OpenAI, Google, or any
paid service.

`pnpm test:e2e` starts the Next.js application on an isolated localhost port,
runs the workflow path in Playwright Chromium, and terminates both browser and
server. The flow also verifies Mock provider selection and the server-secret
boundary on the AI model settings page. A second API E2E pairs a Mock Agent,
heartbeats, polls, claims, renews, reports deduplicated progress, completes
idempotently, revokes the device, and verifies the old token fails. CI installs
only Chromium immediately before this test.

The workflow browser E2E also opens the Google connection settings page,
performs a Mock health check, renders the spreadsheet metadata list, and asserts
that token fixture values do not appear in the page. Connector integration tests
inject OAuth and Sheets transports, so no Google credential or network call is
required.

The AI Workspace browser E2E streams a deterministic Ask reply, reloads and
reopens the saved conversation, then creates a Plan conversation and verifies
that only a validated four-step Workflow plan is rendered from persisted
metadata.

The usage-operations E2E opens the bilingual allowance workspace, verifies plan
limits and Microsoft Store single-commerce disclosure, confirms that ordinary
users receive no API credential or Store configuration detail, and checks the
platform operations summary and internal-override labeling. Microsoft Store
service tests inject local transports and assert exact product/SKU selection,
server-only RPC metadata, fail-closed malformed keys, and the absence of raw
Store ID keys from persistence calls.

The Website Studio E2E covers both entry paths. The primary journey describes a
site in one sentence, answers an AI follow-up, creates a validated Canvas,
applies a conversational edit, explicitly confirms one version, and retrieves
the public route. The advanced journey completes purpose, audience, pages,
brand direction, content, and calls to action, proves incomplete briefs cannot
create drafts, verifies immutable editing/Undo/Redo and private AI images, and
proves an unversioned post-draft update fails closed.

The Agent API E2E starts a write-capable Run while its paired Agent is offline,
asserts no Job exists before approval, approves it, reconnects, claims exactly
one Job, renews the lease, reports all four Workflow steps, replays duplicate
events, completes, and verifies the output-free Run details. Desktop integration
tests independently execute an authorized CSV-to-XLSX Workflow twice and prove
that the source and first output hashes remain unchanged.

### Build and packaging

Web production builds run without optional provider credentials. Desktop
development builds run on supported hosts; release workflows package Windows on
Windows and macOS on macOS. Artifact checks verify metadata, checksums, absence
of secrets, and accurate signed/unsigned labeling.

Desktop unit tests inject filesystem roots, a fake secure cipher, and local
protocol transports. They verify encrypted-at-rest device sessions, fail-closed
secure storage, recursive secret/path/row log redaction, traversal rejection,
symlink escape rejection, device-bound grants, permission checks, token headers,
response validation, polling, reconnect, and clean executor shutdown. The
Phase 8 native package gate is unsigned and unpacked by design.

## Phase 0 baseline

The audited repository had no package manifest, source, test configuration, or
build command. Running pnpm checks would therefore not be meaningful until the
workspace is created in Phase 1.
