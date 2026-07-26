# Architecture

## Product boundary

AI Workflow Studio converts a natural-language request into a versioned,
validated workflow plan. AI output is treated as untrusted data. Only a
deterministic executor can perform registered operations after schema, semantic,
permission, and risk checks.

```text
Natural language
  -> AI planner
  -> workflow JSON
  -> schema validation
  -> semantic and registry validation
  -> permission and risk validation
  -> dry run
  -> user approval where required
  -> deterministic executor
  -> auditable run and step results
```

## Planned monorepo

```text
apps/
  web/                  Next.js control plane and server APIs
  desktop/              Electron local agent
packages/
  agent-protocol/       Pairing, device authentication, claims, leases, job state
  ai-gateway/           Server-only AI provider adapters and validation boundary
  local-executor/       Bounded Excel/CSV I/O, transforms, watcher, and ledger
  workflow-schema/      Versioned Zod DSL and semantic validation
  workflow-engine/      Registry and deterministic orchestration
  connector-sdk/        Connector contracts and safe helpers
  shared/               Product config, errors, auth, and utility contracts
  ui/                   Shared presentation primitives
supabase/
  migrations/           Immutable PostgreSQL schema and RLS migrations
docs/                   Operations and engineering documentation
```

## Control plane

The Next.js application owns authentication UX, tenant-aware workflow APIs,
planner APIs, Google OAuth callbacks, job coordination, approvals, audit
visibility, and run dashboards. Supabase PostgreSQL is the source of truth.
Realtime is only a wake-up hint and is never the sole job-delivery mechanism.

The planner API accepts bounded context, selects a server-only provider adapter,
and treats every completion as untrusted text. Provider JSON modes improve
reliability, but the complete application-side Workflow v1 structural and
semantic validators remain authoritative. A bounded repair loop may request a
complete replacement plan; it never patches, executes, or returns invalid
content. See `docs/AI_GATEWAY.md`.

## Desktop data plane

Electron owns local folder authorization, file watching, Excel processing,
desktop notifications, and device job execution. It returns redacted metadata
and progress, not complete local spreadsheets. Local paths are represented in
cloud workflow data only by device-scoped folder aliases.

The sandboxed renderer receives an exact preload API and has no Node.js,
filesystem, token, or generic IPC access. The main process owns OS-encrypted
device credentials, the system folder picker, canonical grant paths, redacted
logs, polling, tray behavior, and user-initiated updates. See
`docs/DESKTOP_AGENT.md`.

The main process binds the local executor to a paired device's private folder
grant store. Excel/CSV readers apply file, row, sheet, column, ZIP-entry,
decompression, and compression-ratio limits before materializing safe scalar
rows. Writers use exclusive locks, private temporary files, reread validation,
atomic rename, verified backups where explicitly required, and SHA-256 receipt
deduplication. See `docs/EXCEL_EXECUTOR.md`.

## Agent job protocol

The database remains the durable Agent Job source. An opaque device token binds
every request to one tenant and device; job identifiers never establish
authorization. Polling discovers pending or expired-leased work, an atomic
claim issues a separate one-time claim credential, and bounded renewable leases
prevent active duplicate execution. Progress and terminal event UUIDs provide
request-level idempotency. See `docs/AGENT_PROTOCOL.md`.

## Trust boundaries

1. Browser input and AI responses are untrusted and runtime-validated.
2. Tenant membership is enforced by both RLS and explicit service-role checks.
3. Device requests require a revocable token hash, tenant/device binding,
   timestamp validation, and strict request schemas.
4. File operations resolve real paths and remain under a user-authorized root.
5. OAuth/provider credentials remain server-side and encrypted at rest.
6. Node types and versions must be registered; arbitrary executable content is
   never accepted.
7. The Electron renderer is sandboxed and cannot name filesystem paths or IPC
   channels.

## Initial architecture risks

| Risk                                                | Consequence                | Planned control                                                        |
| --------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| AI returns executable or invented operations        | Arbitrary execution        | Strict JSON, Zod, registry allowlist, bounded repair                   |
| Tenant identifier is trusted from a client          | Cross-tenant exposure      | Auth-derived tenant context, membership checks, RLS                    |
| Folder path traversal or symlink escape             | Unauthorized local access  | Canonical paths, realpath containment, permission grants               |
| Duplicate/leased jobs execute twice                 | Duplicate writes           | Atomic claim, leases, idempotency keys, file hashes                    |
| Token or row data leaks through logs                | Credential/privacy breach  | Central redaction and metadata-only desktop reporting                  |
| Partial Excel writes corrupt output                 | Data loss                  | New output by default, temp files, verification, atomic rename, backup |
| Provider credentials missing at build time          | Broken development/release | Optional adapters and deterministic mock mode                          |
| Unsigned desktop release is presented as production | User trust/security issue  | Development artifact labeling and signing-aware release gates          |

## Product naming

The product name will be exported by one shared configuration module in Phase 1.
Application code and metadata must consume that configuration instead of
scattering string literals.
