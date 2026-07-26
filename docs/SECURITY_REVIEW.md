# Security review

## Scope and severity policy

This review covers source, dependencies, browser output, PostgreSQL privileges
and Row Level Security, server routes, Agent authentication, local path access,
logs, destructive operations, and packaged artifacts. A Critical or High issue
blocks Phase 13. Medium issues must either be fixed or explicitly prevent the
affected feature from entering production.

## Findings

| ID      | Severity | Finding                                                                                        | Resolution                                                                                         |
| ------- | -------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| SEC-001 | High     | A configured paid AI provider could be called before Web Auth existed.                         | Fixed: only Mock is allowed before authenticated workspace context.                                |
| SEC-002 | Medium   | Google OAuth start did not require the same web-actor gate as callback persistence.            | Fixed: actor validation occurs before state/PKCE cookies or redirect.                              |
| SEC-003 | High     | Vulnerable transitive `sharp`, `postcss`, `brace-expansion`, and `uuid` versions were present. | Fixed with scoped pnpm overrides; audit now reports no known vulnerabilities.                      |
| SEC-004 | High     | Real Auth and production repository adapters are not connected.                                | Contained: non-Mock dashboard and server adapters fail closed; production go-live remains blocked. |

There are no unresolved Critical or High vulnerabilities in the currently
enabled Mock/development boundary. SEC-004 is not treated as a completed
production feature: the application refuses that mode, and Phase 13 remains in
progress until real Auth and authorization are implemented and tested.

## Review evidence

### Dependencies

- `pnpm audit --audit-level high`: no known vulnerabilities.
- Overrides are scoped in `pnpm-workspace.yaml`; the lockfile records the
  resolved versions.
- Quality/build gates verify that major transitive replacements do not break
  the supported runtime.

### Browser bundle and secrets

- Only the application URL, Mock flag, Supabase URL, and Supabase browser key
  may use `NEXT_PUBLIC_`.
- `scripts/scan-client-bundle.mjs` scans built static assets for server-only
  variable names, actual configured secret values, known credential formats,
  private keys, and the local workspace path.
- Server-only provider, OAuth, encryption, service-role, pepper, and cron values
  are read only from server modules.

### RLS and privileged database functions

- Every tenant-owned table enables and forces Row Level Security.
- Cross-tenant composite foreign keys prevent a child record from referencing
  another Tenant's parent.
- Browser roles cannot read token/ciphertext tables or call Agent/Google/Run
  service transition functions.
- Database tests cover Tenant A/Tenant B denial, viewer write denial, owner
  invariants, function grants, state-transition validation, and seed
  idempotency.

### API authorization

| Boundary              | Current control                                                                         |
| --------------------- | --------------------------------------------------------------------------------------- |
| Mock browser APIs     | Fixed synthetic Tenant and user; no production/customer data                            |
| Non-Mock browser APIs | Fail closed until Supabase session context is connected                                 |
| AI planner            | Strict bounded JSON input; only Mock is anonymous                                       |
| Google OAuth          | Actor gate, state, PKCE S256, HttpOnly callback cookies, encrypted tokens               |
| Agent endpoints       | Bearer device token hash, timestamp window, tenant/device binding, revocation, body cap |
| Run mutation          | Web actor role checks plus closed Run state transitions                                 |

Real Supabase Web Auth is a remaining Phase 13 gate. No service-role API may be
enabled until it derives the user and Tenant membership from the verified
session and repeats the authorization check server-side.

### Local paths and file operations

- Folder grants originate only from the Electron system picker.
- Every access rechecks canonical containment and rejects traversal and symlink
  escape.
- Excel/CSV parsing and ZIP expansion are bounded.
- New outputs are the default; atomic overwrite requires verified backup.
- Content hashes and receipts suppress restart/reclaim duplicates.

### Logging and error handling

- Desktop structured logs redact authorization, tokens, secrets, prompts,
  rows/content, and full paths.
- AI usage logging contains provider/model/count/timing metadata only.
- Agent/Google/Run API error envelopes return bounded codes and safe messages,
  not credentials or row payloads.

### Destructive and external actions

- Workflow schema accepts only registered nodes.
- Write, destructive, and external-transfer nodes require explicit approval
  according to the catalog.
- AI output cannot define shell, JavaScript, Python, SQL, arbitrary URLs, or
  unregistered executors.
- Cancellation, retry, lease, and idempotency checks prevent accidental replay.

## MVP acceptance status

Items 3–19 pass in the deterministic local Mock acceptance path, including
pairing, offline reconnect, approval-before-dispatch, authorized folder access,
new Excel output, redacted progress, deduplication, and database Tenant
isolation. Items 1–2 require real Web registration and Tenant onboarding.
Items 20–22 have local workflow/configuration evidence but require remote
GitHub Actions, a real Vercel project, and a published GitHub prerelease before
they can be marked passed. No remote outcome is claimed.
