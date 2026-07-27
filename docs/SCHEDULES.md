# Safe recurring schedules

## User model

Schedules are created from an active, immutable workflow version and its exact
Desktop Agent target. The browser can choose only these validated presets:

- every 15 minutes;
- hourly;
- daily at a local `HH:mm`;
- weekdays at a local `HH:mm`.

The server validates a real IANA timezone and derives the Cron expression. The
product does not accept an arbitrary Cron string, JavaScript, Python, shell
command, or user-defined scheduler code.

## Security boundaries

- Owners, admins, and editors can create, pause, or resume schedules. Viewers
  have read-only access.
- The browser can read safe schedule metadata but cannot mutate database rows
  directly, claim an occurrence, or access connector credentials.
- Every occurrence receives
  `schedule:<scheduleId>:<dueAt>` as a stable idempotency key.
- Database uniqueness protects both the idempotency key and the
  `(schedule_id, due_at)` occurrence.
- A scheduled occurrence creates a normal Run request. It does not grant new
  folder, connector, credential, tool, write, or destructive authority.
- Three consecutive dispatch failures automatically pause the schedule. Only a
  bounded safe error code is stored in the schedule metadata.

## HTTP boundaries

- `GET /api/schedules` lists tenant schedules and eligible active targets.
- `POST /api/schedules` creates a validated schedule.
- `PATCH /api/schedules/:scheduleId` pauses or resumes a schedule.
- `GET /api/internal/schedules/tick` is internal and requires
  `Authorization: Bearer <CRON_SECRET>`.

Mock mode uses a test-only Cron secret and accepts a deterministic `at` query
parameter for integration tests. Production ignores `at` and uses server time.

## Current Production gate

Production schedule records are durable in Supabase. The internal tick remains
fail-closed until the durable Production Run and Desktop Agent dispatcher is
configured. Therefore `apps/web/vercel.json` intentionally does not register a
Vercel Cron job yet. Enabling a timer before the downstream dispatcher exists
would create misleading failures.

Once the durable adapter is complete:

1. set an independent high-entropy `CRON_SECRET` in Vercel Production;
2. add the internal tick path to Vercel Cron;
3. verify missing and invalid bearer values return `401`;
4. test concurrent ticks against the same due occurrence;
5. confirm the resulting Run is visible, audited, and still requires its normal
   approval;
6. verify three consecutive downstream failures pause the schedule.

## Google Sheets

Google Sheets is the first authorized business connector used by scheduled
workflows. It retains the Phase 10 controls: encrypted server-only OAuth tokens,
bounded spreadsheet and read-only Drive metadata scopes, explicit revocation,
health checks, bounded retries, and operation-level idempotency. Schedules never
receive or display OAuth tokens.
