# AI Workflow Studio

AI Workflow Studio turns a natural-language automation request into a validated,
versioned JSON workflow. A deterministic control plane and a paired local
Desktop Agent execute only registered operations after permission, risk, and
approval checks. AI output is always untrusted data and is never executed as
code, SQL, shell, or arbitrary network instructions.

The project is an active phased implementation. The authoritative completion
record is [`docs/STATUS.md`](docs/STATUS.md), and the phase gate is
[`docs/EXECUTION_PLAN.md`](docs/EXECUTION_PLAN.md).

## Workspace

```text
apps/web                  Next.js control plane
apps/desktop              Electron local Agent
packages/agent-protocol   Pairing and durable job contracts
packages/ai-gateway       Validated provider adapters
packages/google-sheets    OAuth and bounded Google Sheets operations
packages/local-executor   Bounded Excel/CSV processing
packages/workflow-schema  Workflow v1 schemas and catalog
packages/workflow-engine  Deterministic orchestration primitives
supabase                  PostgreSQL migrations and RLS
```

## Development

Node.js 22 or later and pnpm 11 are required.

```bash
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm db:test
pnpm build:web
pnpm build:desktop
```

Automated tests use deterministic Mock providers and fixtures. Paid APIs, live
customer data, and production credentials are not required.

## Excel and CSV MVP limits

The local executor supports `.xlsx` and CSV as separate, bounded formats. It
does not support legacy `.xls` or macro-enabled `.xlsm` files. It rejects VBA,
embedded objects, external workbook links, encrypted archives, traversal
entries, suspicious compression ratios, and configured file/row/sheet limits.
Formula text is never executed or propagated; only a safe cached scalar result
may be read. CSV formula-like output is neutralized.

New output files are the default. Existing source files are not overwritten by
normal workflows. The lower-level overwrite path requires a verified backup,
temporary output validation, same-directory atomic rename, and SHA-256
verification. The MVP does not promise preservation of VBA, pivot tables,
native charts, external data connections, complex workbook styling, or every
Excel-specific feature. See [`docs/EXCEL_EXECUTOR.md`](docs/EXCEL_EXECUTOR.md).

## Google Sheets

Google authorization is a separate, server-side OAuth connection using PKCE,
state validation, offline access, encrypted tokens, refresh and revoke support,
bounded Sheets requests, and durable idempotency contracts. Credentials are
optional for local builds; Mock integration tests never contact Google. See
[`docs/GOOGLE_SHEETS.md`](docs/GOOGLE_SHEETS.md).

## Release status

No production release has been published. Desktop packages created before the
formal release phase are unsigned development artifacts. Do not distribute them
as production installers.
