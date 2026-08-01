# Google Sheets Connector

## Boundary

Google Sheets authorization is an independent tenant connection. It is not the
website login session, a device token, or a value embedded in Workflow JSON. A
workflow stores only the connection UUID plus validated spreadsheet, range, and
operation configuration.

The connector is implemented in `packages/google-sheets`. The Next.js routes
and connection-health UI are under `apps/web`; durable write claims are defined
by `202607260003_google_connection_operations.sql`.

## Server configuration

These variables are optional at build time and server-only at runtime:

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://app.example.com/api/connections/google/callback
APP_ENCRYPTION_KEY=
```

`APP_ENCRYPTION_KEY` must be exactly 32 random bytes encoded as padded base64.
Generate a new deployment-specific value with `openssl rand -base64 32`. Do not
reuse the device-token pepper, Supabase key, or an AI provider key.

When any value is absent, the web build remains valid, OAuth start fails closed,
and local development shows a clearly labeled Mock connection.

## OAuth flow

1. `GET /api/connections/google/start` creates a 256-bit state value and an
   independent PKCE S256 verifier/challenge.
2. State and verifier are stored for ten minutes in `HttpOnly`, `SameSite=Lax`
   cookies scoped only to the callback path. Production cookies are `Secure`.
3. The authorization request asks for offline access and explicit consent.
4. `GET /api/connections/google/callback` validates the bounded query, consumes
   both cookies, compares state in constant time, and performs the code exchange
   on the server.
5. A connection is accepted only when Google returns a refresh token and all
   required scopes.

The current scopes are:

- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/drive.metadata.readonly`
- `https://www.googleapis.com/auth/drive.file`
- `https://www.googleapis.com/auth/drive.readonly`
- `https://www.googleapis.com/auth/forms.responses.readonly`
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/presentations`
- `https://www.googleapis.com/auth/script.projects`

Drive content access is read-only and is used to discover and download selected
folder workbooks. Existing connections must be explicitly re-authorized after
this scope is added. External writes use the explicit `drive.file` scope only
for files the application creates or opens with the user. The implementation
follows Google's
[web-server OAuth guidance](https://developers.google.com/identity/protocols/oauth2/web-server)
and [OAuth security practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices).

## Drive Excel folder operations

The Drive Excel reader accepts one validated folder identifier from the
authenticated Tenant connection. It supports Google Sheets and binary `.xls`
or `.xlsx` files, recursively visits approved subfolders, locates the first
usable header row, merges a union of columns, and appends `_source_file` and
`_source_sheet` provenance fields. `.xlsx` files are parsed as inert workbook
data in server memory; formulas are read only as stored results and macros or
embedded code are never executed. Legacy `.xls` files are converted to
temporary app-created Google Sheets and deleted after reading.

The matching report writer creates a styled `.xlsx` workbook in server memory
and uploads it as a new file in the same Drive folder. It never overwrites a
customer file and uses an app-owned idempotency marker so a repeated workflow
attempt returns the same metadata result. The workflow schema bounds each
request to 20 MB per `.xlsx` or legacy `.xls` source file,
500 files, 2,000 sheets, and 100,000 merged rows. The deterministic planner
uses the 20 MB source-file limit and a reviewed default of 1,000 sheets so the
current cost folder's 776 worksheets remain inside the safe envelope. The
complete limits are visible
in the reviewed workflow before execution, and external outputs still require
approval. Read operations fail closed when an existing OAuth connection lacks
`drive.readonly`.

Legacy `.xls` files at or below 5 MB use a bounded multipart conversion. Larger
legacy files use Drive's resumable upload protocol, remain capped at the same
20 MB reviewed source limit, are converted only to a temporary Google Sheet,
and are deleted after their inert cell values have been read.

Independent `.xlsx` downloads use a fixed eight-request concurrency ceiling and
are merged back in the deterministic Drive filename order. This keeps large
folders within the Cloud execution window without changing file, worksheet,
row, or byte limits.

Production Cloud workflow requests are capped at five minutes, while each
validated node has a four-minute timeout. The remaining minute is reserved for
persisting step results, audit events, and a bounded failure response.

## Token protection

Access and refresh tokens are encrypted separately with AES-256-GCM. The
versioned envelope includes a key identifier, random 96-bit IV, ciphertext, and
authentication tag. Additional authenticated data binds every envelope to:

```text
tenant UUID + connection UUID + access/refresh token kind
```

Moving ciphertext between tenants, connections, or token columns therefore
fails authentication. The key identifier permits controlled key rotation.
Repository records expose a token-free `GoogleConnectionView`; browser routes
return that view only. Revocation attempts Google's revoke endpoint and clears
both local ciphertexts in a `finally` path.

## Sheets operations

| Operation         | Behavior                                                        |
| ----------------- | --------------------------------------------------------------- |
| List spreadsheets | Read-only Drive discovery, newest first, maximum 100            |
| List sheets       | Sheet ID, title, row count, and column count only               |
| Read              | A1 range, rows, unformatted scalar values                       |
| Append            | Raw values, inserted rows, guarded against ambiguous retries    |
| Update            | Up to 100 A1 ranges through `values:batchUpdate`                |
| Sync              | Read, deterministic key merge, then one idempotent batch update |

Inputs and responses are runtime-validated. A request is limited to 2 MB, a
response to 5 MB, a range to 500 characters, a batch to 100 ranges, a row to 200
cells, and a call to 10,000 rows. Tokens are sent only in an Authorization
header, never a URL.

Reads and idempotent updates retry network failures and HTTP
408/429/500/502/503/504 up to five attempts. Backoff uses capped exponential
delay, jitter, and a bounded `Retry-After`, never exceeding 32 seconds. This
matches Google's [quota and backoff guidance](https://developers.google.com/workspace/sheets/api/limits).

Append is different: a lost response after transmission or an HTTP 5xx can mean
Google applied the rows even though the caller did not receive confirmation.
That outcome is marked `ambiguous` and is not automatically retried. Only a
definite 429 before success is retried.

## Idempotency

Every write requires an 8–200 character idempotency key and stores a SHA-256
hash of the normalized request. The same key and hash replays the completed
metadata result; a different hash, active request, or ambiguous append fails
closed.

`connection_operations` and its service-only claim/finish/release functions
provide the durable PostgreSQL implementation. Tenant and connection are a
composite foreign key, browser roles have no table or function privileges, and
the stored result is metadata-only.

## Mock and production integration

Automated tests inject local OAuth and Sheets transports. They cover PKCE,
offline scopes, exchange, refresh, revoke, encryption context, metadata lists,
bounded retry, batch replay, ambiguous append suppression, sync conflicts, and
health-state changes without contacting Google.

The current web control plane uses an in-memory encrypted repository only in
Mock mode. A production deployment must bind the `GoogleConnectionRepository`
and `GoogleOperationStore` ports to authenticated service-side persistence in
the `connections` and `connection_operations` tables. Until that authenticated
tenant adapter is configured, live web connection routes fail closed.
