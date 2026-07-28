# Security

## Non-negotiable invariants

- AI output is data, never code.
- No executor uses `eval`, a `Function` constructor, arbitrary dynamic imports,
  arbitrary SQL, or AI-generated shell commands.
- Only registered node type/version pairs can execute.
- Write, destructive, and external operations follow explicit risk and approval
  policies.
- Tenant access is enforced in the database and again at privileged API
  boundaries.
- Browser bundles never contain service-role, OAuth, encryption, device, or AI
  provider secrets.
- Cloud records never need a user's raw local filesystem path.
- Logs and API errors redact credentials, full local paths, and sensitive row
  values.

## Filesystem authorization

The desktop agent stores a canonical path for a system-picker-approved folder.
Each operation resolves the target, checks that it is contained by that approved
root, rejects traversal and symlink escape, verifies the requested permission,
and records a content hash. Writes use temporary output and atomic rename; source
overwrite is not the default and requires backup plus approval.

The renderer cannot create grants from path text. It sees only device-scoped
aliases and display names. The main process rechecks ownership, permission,
canonical containment, and symlink resolution for every access. Folder grants
are stored locally and raw paths are removed from logs and renderer responses.

## Desktop application boundary

The Electron renderer has context isolation, Chromium sandboxing, disabled Node
integration, disabled webviews and new windows, denied permission requests, and
an exact allowlisted preload bridge. Production assets are served only from the
packaged renderer directory through a constrained custom protocol. IPC handlers
validate both the sender and payload.

Device sessions are encrypted with the operating system's Electron `safeStorage`
provider before atomic private-mode persistence. The Agent fails closed if
secure storage is unavailable or Linux exposes only the `basic_text` backend.
Device tokens never enter renderer state, logs, URLs, settings, or folder-grant
files.

`.xlsx` files are inspected as bounded ZIP archives before parsing. Encrypted
entries, traversal names, VBA, embedded objects, external workbook links,
excessive expansion, and suspicious compression fail closed. Formula text is
discarded and never evaluated. CSV formula-trigger characters are neutralized
on output.

New outputs use an exclusive local lock and private same-directory temporary
file. The Agent flushes and rereads the temporary output, revalidates limits,
hashes it, atomically renames it, and verifies the final hash. Destructive
overwrite is unavailable to current Workflow v1 output nodes; the lower-level
path requires a hash-verified backup.

The updater never auto-downloads. Check and download require separate user
actions, and unsigned Phase 8 packages are development-only. Formal releases
must pass signing and artifact verification gates before the update channel is
enabled.

## Device and job security

Device secrets are generated with sufficient entropy and stored in the cloud
only as peppered hashes. Each request binds authentication to tenant, device,
revocation status, and an acceptable timestamp. Jobs use atomic claims,
renewable leases, structured events, and idempotency keys.

Pairing codes are 12-character, short-lived, single-use secrets and are also
stored only as domain-separated HMAC-SHA-256 values. Device and claim tokens
carry 256 bits of randomness and have distinct HMAC domains. Device tokens
expire after 90 days; revocation invalidates the device and all associated
tokens. The application never accepts tenant or device identity from an Agent
request body.

Agent requests are capped at 32 KB and use strict schemas. The device token,
device status, token expiry/revocation, timestamp window, tenant, device, job
status, attempt limit, lease, and claim-token hash are validated before state
changes. Progress and terminal event UUIDs are unique per job. Pairing hashes
and job state-transition functions are service-role-only in PostgreSQL.

Run completion additionally requires every Workflow node to have a successful
or skipped terminal step. Browser roles cannot directly mutate Run rows or call
the compare-and-set transition function. Cancellation changes the active Job
state; a Desktop executor aborts when its next lease renewal is rejected.

The local Job engine receives folder aliases only and registers a closed subset
of Workflow v1 nodes. Folder enumeration is capped, does not recurse, and
ignores symlinks. Progress deliberately omits node output, so rows and paths
cannot enter browser Run views, audit metadata, or notifications.

## Data minimization

Desktop reports contain workflow/run identifiers, status, timing, counts,
structured error codes, masked messages, column names/types, and only explicitly
approved masked samples. Complete local spreadsheet data is not uploaded as a
required workflow step.

Google list routes return spreadsheet and sheet metadata only. OAuth token
responses, refresh tokens, access tokens, and ciphertext are excluded from the
browser view and API error envelope. Google writes store only request hashes and
result counts in the idempotency ledger.

## Secrets

Secrets belong in local ignored environment files or managed deployment secret
stores. Example files never contain working values. Encryption and hashing keys
must be independently generated and rotatable. Tokens must not appear in URLs,
client state, workflow JSON, logs, fixtures, or artifacts.

Google access and refresh tokens use separate AES-256-GCM envelopes with
tenant/connection/type additional authenticated data. OAuth state is
constant-time validated, PKCE uses S256, callback cookies are HttpOnly and
single-purpose, and revocation clears local ciphertext even if the remote revoke
call fails.

## AI provider boundary

AI provider keys are read only in the server-only adapter factory and are sent
in provider authorization headers, never in request bodies, browser state, or
workflow JSON. Provider output is capped, parsed as exact JSON, and validated by
the closed Workflow v1 schema and semantic validator before it can be released
as a draft. Unknown fields and nodes, Markdown-wrapped JSON, source code, shell
commands, raw local paths, arbitrary URLs, and invalid graphs fail closed.

Repair attempts are bounded from zero to two. Repair feedback includes only
validation classifications and paths; the rejected raw response is not logged
or echoed. Usage records exclude prompts and generated content. A usage-record
failure withholds the output rather than creating an unaccounted plan.

Ask mode uses a separate provider-neutral streaming boundary with no tools.
Chat context and streamed output are bounded, client cancellation propagates to
the provider request, and incomplete replies are stored with cancelled or
failed status. Conversation and message writes require an authenticated,
server-derived tenant context and the service role; authenticated browser roles
receive read-only tenant-scoped RLS access. Usage metadata records provider,
model, units, duration, outcome, and conversation identifier only.

## Usage and Microsoft Store boundary

Paid access is derived only from a server-verified Microsoft Store entitlement.
The browser cannot select a paid plan or call the database synchronization
function directly. The authenticated Store synchronization route validates the
caller's Tenant role, validates the short-lived Store ID key, exchanges
server-only Microsoft Entra credentials, requires an exact product/SKU mapping,
and fails closed on invalid, oversized, or paginated responses.

Store ID keys, Microsoft access tokens, client secrets, and raw Store responses
are not persisted. PostgreSQL stores only the external subscription identifier,
mapped plan, normalized state, timestamps, and a reconciliation hash. Ordinary
users see allowance and entitlement state, while platform administration
exposes configuration presence only.

AI calls reserve a conservative maximum cost before provider access. The
database atomically enforces Tenant, monthly budget, reservation expiry,
per-minute request limits, text-source bytes, and tool-call allowances. Actual
usage releases the reservation in the same transaction. The 100% ceiling fails
closed; 80% and 95% thresholds produce warnings. A Super Admin manual override
is audit logged, clears stale external entitlement metadata, and does not count
as Store revenue.

Until the authenticated production session/repository boundary is connected,
the public development control plane permits only the deterministic Mock
planner. Supplying a real provider key does not make an external provider
callable by an anonymous browser. Non-Mock dashboard access and Google OAuth
start also fail closed.

## Website Studio boundary

Website Project reads are RLS-filtered by Tenant. Creates and updates use only
the authenticated server route after `WorkspaceContext` derives the Tenant and
actor; a request cannot select its own Tenant, and viewers cannot mutate.
Website briefs pass the shared strict schema before persistence, and all six
bounded decisions must validate before draft creation.

The prompt assistant accepts only strict, bounded brief patches and questions.
It cannot produce executable code, arbitrary URLs, deployment configuration,
domain mutation, or API credentials. Audit metadata contains only message
kind/step, field names, progress, version, and release identifiers—never prompt,
answer, brief, provider body, or generated content.

Publishing is a separate authenticated RPC requiring a non-viewer, an existing
validated spec version, and an explicit confirmation submitted by the browser.
A model response cannot satisfy that confirmation. Releases are immutable;
new releases supersede old rows and only the active slug is public. The public
renderer uses registered components, ID-based approved assets, a restrictive
CSP, and no customer script/form/external-URL execution path. See
[`WEBSITE_STUDIO.md`](./WEBSITE_STUDIO.md).

Platform subdomain labels are normalized and checked by the authenticated
server. Reserved system names and invalid DNS labels are rejected. A partial
unique index protects the active publication label globally, and the publishing
transaction fails without superseding the current release when another project
already owns that label. Customers never receive Vercel, DNS, or TLS
credentials.

Portable source and future GitHub releases reuse the registered-component static
renderer. They must not include provider keys, OAuth tokens, payment secrets,
webhook secrets, local paths, prompts, private version history, arbitrary
scripts, or executable model output. Future integration modules may expose only
validated public configuration and secret-name placeholders; all functional
provider credentials remain in a server-side deployment boundary.

## Security review gates

- Dependency and license audit.
- RLS and tenant-isolation tests.
- Service-role authorization review.
- Client-bundle secret scan.
- Path containment and symlink tests.
- Token hashing and revocation tests.
- Log and error redaction tests.
- Destructive-action and external-transfer approval review.
- Artifact secret scan and checksum verification.

The recorded Phase 13 findings, evidence, and unresolved go-live items are in
[`SECURITY_REVIEW.md`](./SECURITY_REVIEW.md).
