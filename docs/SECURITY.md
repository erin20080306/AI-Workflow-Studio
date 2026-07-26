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

## Device and job security

Device secrets are generated with sufficient entropy and stored in the cloud
only as peppered hashes. Each request binds authentication to tenant, device,
revocation status, and an acceptable timestamp. Jobs use atomic claims,
renewable leases, structured events, and idempotency keys.

## Data minimization

Desktop reports contain workflow/run identifiers, status, timing, counts,
structured error codes, masked messages, column names/types, and only explicitly
approved masked samples. Complete local spreadsheet data is not uploaded as a
required workflow step.

## Secrets

Secrets belong in local ignored environment files or managed deployment secret
stores. Example files never contain working values. Encryption and hashing keys
must be independently generated and rotatable. Tokens must not appear in URLs,
client state, workflow JSON, logs, fixtures, or artifacts.

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
