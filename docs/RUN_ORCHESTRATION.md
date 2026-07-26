# Run Orchestration

## Execution boundary

A Run is the control-plane record for one immutable Workflow version. The
control plane validates the actor, tenant, device target, Workflow v1 document,
approval requirement, timeout, attempt limit, and idempotency key before a
Desktop Job can exist. The Desktop Agent receives only a device-bound job and
folder aliases; it never receives a raw local path.

The normal path is:

```text
create Run
  -> awaiting approval when a write/external/destructive node exists
  -> queue one device-bound Agent Job
  -> Agent reconnects and polls
  -> atomic claim + renewable lease
  -> registered local node execution
  -> metadata-only step events
  -> succeeded / failed / cancelled / timed out
```

## State machine

Run statuses are closed:

```text
pending
  -> awaiting_approval -> queued
  -> queued

queued -> running -> succeeded
                  -> failed
                  -> cancelled
                  -> timed_out

failed | timed_out -> queued   (bounded retry only)
```

Invalid, stale, cross-tenant, or terminal transitions fail. A success
transition is rejected until every Workflow node is `succeeded` or `skipped`.
Run attempt numbers increment only when a new Job is queued and cannot exceed
`maxAttempts`.

The start idempotency key is tenant-scoped and bound to a hash of the Workflow,
version, target device, timeout, and retry configuration. An exact replay
returns the existing Run. Reusing a key for different input fails with a
conflict and never dispatches another Job.

## Approval

Write, destructive, and external behavior remains held in
`awaiting_approval`. The Run detail page shows the risk counts before exposing
Approve or Reject. Approval IDs are single-use and expire after 15 minutes.
Only owner, admin, and editor actors can resolve approval; viewer is read-only.

Approval creates exactly one Agent Job. Reject or expiry cancels the Run
without dispatch. The Mock UI also requires a second click to confirm
cancellation of a queued or running Run.

## Desktop execution

The Desktop Agent:

1. Heartbeats and polls after reconnect.
2. Atomically claims a pending or expired-lease Job.
3. Renews its 120-second lease while executing.
4. Validates the embedded Workflow again.
5. Runs only registered local node implementations.
6. Reports UUID-keyed structured progress.
7. Completes or fails with a bounded metadata summary.

Phase 11 binds these local nodes:

- `folder.list_files`
- `excel.read`
- `excel.merge`
- `excel.write`
- `excel.create_report`
- `data.filter`
- `data.map_columns`
- `data.deduplicate`

Unknown or cloud-only nodes fail closed. Folder listing is non-recursive,
single-pattern, capped at 1,000 real files, and never follows symlinks. Reads
and writes still pass through the device-owned grant service. Output writes use
the persistent content-hash ledger, so a reclaimed Job after a crash cannot
produce the same output twice.

Losing the lease aborts the local Workflow engine. A control-plane cancellation
changes the Job to `cancelled`; the next renewal fails and stops the Agent.

## Progress and privacy

Step events may contain status, timestamps, file count, row count, and a
bounded safe error. The control plane discards step output before persistence.
Raw spreadsheet rows, canonical paths, access tokens, claim tokens, and device
tokens are never part of the Run view, audit metadata, notification, or browser
response.

Every progress and terminal event has a UUID idempotency key. Duplicate delivery
returns the prior state without another transition or audit entry.

## Retry, timeout, and cancellation

Retryable Agent failures may automatically queue a fresh Job while attempts
remain. Manual retry is allowed only from `failed` or `timed_out`. Every retry
uses a new Job ID and preserves the Run correlation ID.

The timeout sweep transitions active Runs to `timed_out`, cancels active Agent
Jobs, marks unfinished steps, records a safe timeout error, and creates an error
notification. Cancellation follows the same Job-stop path but does not become
retryable.

## Audit and notifications

Run creation, approval request/resolution, dispatch, step progress, retry,
success, failure, cancellation, and timeout append metadata-only audit entries.
Approval, terminal success, failure, timeout, and cancellation create bounded
notifications shown in Run details.

## API

Browser control-plane routes:

| Method | Endpoint                       | Purpose                   |
| ------ | ------------------------------ | ------------------------- |
| GET    | `/api/runs`                    | List tenant Runs          |
| POST   | `/api/runs`                    | Start an idempotent Run   |
| GET    | `/api/runs/:id`                | Read Run details          |
| POST   | `/api/runs/:id/approval`       | Approve or reject         |
| POST   | `/api/runs/:id/cancel`         | Cancel an active Run      |
| POST   | `/api/runs/:id/retry`          | Retry a failed/timed Run  |
| POST   | `/api/agent/jobs/:id/progress` | Sync a claimed step event |
| POST   | `/api/agent/jobs/:id/complete` | Complete Job and Run      |
| POST   | `/api/agent/jobs/:id/fail`     | Fail and optionally retry |

All inputs are size-bounded and runtime-validated. Device identity comes from
the token, while browser identity comes from the authenticated tenant actor.

## PostgreSQL boundary

Migration `202607260004_run_orchestration.sql` adds attempts, timeouts,
cancellation timestamps, durable notifications, Agent event UUID uniqueness,
and the service-role-only `transition_workflow_run` function. The function uses
an expected-status compare-and-set, updates terminal timestamps, cancels active
Jobs, and appends audit/notification rows in one database transaction.

Authenticated browser roles can select their tenant-visible Runs and
notifications but cannot directly insert, update, delete, or execute the
service transition function.

Mock mode uses the same orchestration state machine with an in-memory store.
Production intentionally fails closed until the existing ports are wired to an
authenticated Supabase repository and service-role adapter.
