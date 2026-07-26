# Desktop Agent Pairing and Job Protocol

## Trust model

The cloud database is the durable job source. Realtime notifications may wake a
Desktop Agent but never replace polling `GET /api/agent/jobs`. Phase 7 also
provides an in-memory Mock store so the complete protocol builds and runs
without Supabase credentials.

Device requests never accept a tenant or device identifier from the request
body. Those values are derived from the presented device token and checked
again against every job record.

## Pairing

1. An authenticated tenant owner or administrator requests a 12-character
   pairing code with `POST /api/agent/pair/start`.
2. The server stores only a domain-separated HMAC-SHA-256 code hash. The code
   expires after ten minutes and is single use.
3. The Desktop Agent submits the code and its version to
   `POST /api/agent/pair/complete`.
4. The server atomically consumes the code, creates the device, and returns a
   256-bit `dvt_...` token exactly once.
5. Only the token HMAC, an eight-character hint, expiry, revocation, and
   last-used timestamps are stored. Tokens expire after 90 days and can be
   revoked immediately.

`AGENT_TOKEN_PEPPER` must be an independently generated secret of at least 32
bytes. Mock mode uses an explicit test-only fallback. Non-Mock mode fails closed
when the secret or authenticated tenant context is unavailable.

## Agent authentication

Every heartbeat and job request requires:

```text
Authorization: Bearer dvt_<opaque-token>
X-Request-Timestamp: <ISO-8601 timestamp with offset>
```

The timestamp may be at most five minutes old or 30 seconds in the future. The
token must exist, be unexpired and unrevoked, and belong to a non-revoked
device. The API derives `tenantId` and `deviceId` only after these checks.

Claimed-job mutations additionally require:

```text
X-Job-Claim-Token: clm_<opaque-token>
```

The claim token is returned exactly once by a successful claim. Only its
domain-separated HMAC is stored.

## Endpoints

| Method | Endpoint                        | Purpose                                      |
| ------ | ------------------------------- | -------------------------------------------- |
| POST   | `/api/agent/pair/start`         | Create a bounded, expiring pairing code      |
| POST   | `/api/agent/pair/complete`      | Consume the code and issue a device token    |
| POST   | `/api/agent/heartbeat`          | Record version, executor state, and metadata |
| GET    | `/api/agent/jobs`               | Poll pending or reclaimable expired jobs     |
| POST   | `/api/agent/jobs/:id/claim`     | Atomically acquire a job and lease           |
| POST   | `/api/agent/jobs/:id/lease`     | Renew a live 30–120 second lease             |
| POST   | `/api/agent/jobs/:id/progress`  | Record an idempotent structured step event   |
| POST   | `/api/agent/jobs/:id/complete`  | Complete a job idempotently                  |
| POST   | `/api/agent/jobs/:id/fail`      | Fail a job with a bounded structured error   |
| POST   | `/api/agent/devices/:id/revoke` | Revoke the device and all its tokens         |

Request bodies are strict Zod objects and limited to 32 KB. Unknown fields,
invalid UUIDs, oversized metadata, unbounded leases, raw exceptions, and
unstructured failure payloads are rejected.

## Atomic claim and lease rules

- A pending job can be claimed only when `available_at` has passed and
  `attempt < max_attempts`.
- A claimed or running job can be reclaimed only after its lease expires. The
  new claim atomically replaces the old claim-token hash and increments the
  attempt.
- An active lease prevents a second claim, including a claim from the same
  device process.
- Lease renewal, progress, completion, and failure require the current device,
  tenant, unexpired lease, and claim-token hash.
- Each progress or terminal call carries a UUID event key. The database unique
  index and service store return duplicate calls idempotently instead of
  creating duplicate events.
- Completion and failure are terminal. Retry scheduling remains an
  orchestration decision rather than an Agent-controlled state transition.

After polling, the Electron Agent claims each Job before invoking a local
executor. It renews a 120-second lease every 45 seconds, aborts execution when
the lease is lost, sends metadata-only step events, and reports one terminal
event. A Job claimed by another live process is skipped rather than treated as
a reconnect failure.

## PostgreSQL boundary

Migration `202607260002_agent_pairing_jobs.sql` adds the protected pairing-code
table, event idempotency key, and service-role-only functions:

- `claim_agent_job`
- `renew_agent_job_lease`
- `record_agent_job_progress`
- `finish_agent_job`

The functions use tenant, device, status, attempt, lease, and claim-hash
predicates in the same row operation. Terminal transitions lock the job row
before writing the terminal event. Browser-authenticated roles cannot read code
hashes or execute these functions.

## Mock and production storage

Mock mode uses the same protocol service, HMAC rules, schemas, lease state
machine, Run dispatcher, and idempotency behavior with in-memory stores. Pairing
does not create work; only an approved/idempotent Run dispatches a Job. It is
intended for E2E and desktop development only.

The database migration is production-ready, but the live Next.js store is
deliberately unavailable until authenticated Supabase session and service-role
repository wiring are introduced. The API returns a redacted 503 rather than
silently falling back to process memory in a configured production environment.
