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

### Integration

Integration tests cover tenant-aware workflow/version/run/job lifecycles,
completion and failure propagation, role restrictions, tenant isolation, and
destructive-node approvals. Database tests use disposable local or CI instances.

### End to end

The required mock path signs in a test user, creates a mock device and folder
alias, plans a workflow with the mock provider, renders its validated preview,
runs a dry run, and displays run details. It must not call OpenAI, Google, or any
paid service.

### Build and packaging

Web production builds run without optional provider credentials. Desktop
development builds run on supported hosts; release workflows package Windows on
Windows and macOS on macOS. Artifact checks verify metadata, checksums, absence
of secrets, and accurate signed/unsigned labeling.

## Phase 0 baseline

The audited repository had no package manifest, source, test configuration, or
build command. Running pnpm checks would therefore not be meaningful until the
workspace is created in Phase 1.
