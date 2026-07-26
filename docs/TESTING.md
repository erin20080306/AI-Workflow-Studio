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
```

Only checks relevant to code that exists in the current phase are required. The
status report records each check as passed, failed, or not applicable.

## Planned test layers

### Unit

Unit coverage includes workflow schemas, cycle and unknown-node rejection, risk
classification, path authorization/traversal/symlinks, hashes, Excel
transformations, column mapping, job claim/lease/idempotency, token hashing,
redaction, invalid AI JSON, provider fallback, and Google refresh errors.

AI provider tests use injected local transports. They assert endpoint and header
construction, structured-output configuration, response and usage parsing,
bounded repair, refusal/truncation handling, secret-safe errors, and the
invariant that invalid or unaccounted output is never released.

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

### Build and packaging

Web production builds run without optional provider credentials. Desktop
development builds run on supported hosts; release workflows package Windows on
Windows and macOS on macOS. Artifact checks verify metadata, checksums, absence
of secrets, and accurate signed/unsigned labeling.

## Phase 0 baseline

The audited repository had no package manifest, source, test configuration, or
build command. Running pnpm checks would therefore not be meaningful until the
workspace is created in Phase 1.
