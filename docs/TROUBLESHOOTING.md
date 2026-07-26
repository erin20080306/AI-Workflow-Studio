# Troubleshooting

## Start with a clean diagnosis

From the repository root, run:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

Do not delete the lockfile, disable a test, or add a second package manager.
Keep `.env` values out of terminal screenshots and issue text.

## Web

### The dashboard redirects to login

`NEXT_PUBLIC_MOCK_MODE=false` deliberately fails closed until real Supabase Web
Auth is connected. For local synthetic-data testing, omit external credentials
and use `NEXT_PUBLIC_MOCK_MODE=true`.

### An AI provider returns `AI_EXTERNAL_PROVIDER_REQUIRES_AUTH`

External providers are intentionally disabled before authenticated workspace
context exists. Use Mock Planner for local acceptance. Do not work around the
guard by exposing a provider key in a `NEXT_PUBLIC_` variable.

### Production build fails in a restricted sandbox

Turbopack can require an internal local port while building. Re-run the same
`pnpm build:web` command in the approved host environment; do not change the
build script to hide the failure.

### Client-bundle scan fails

Run `pnpm build:web`, then `pnpm security:scan-client`. Remove the referenced
server-only import/value from all Client Components. Rotate any real credential
that may have appeared in an artifact.

## Database

`pnpm db:test` requires a working Docker daemon. The script creates an isolated
PostgreSQL container, applies every immutable migration, runs authorization
tests, and removes the container on exit. If it fails:

1. Confirm Docker is running.
2. Inspect the first SQL error.
3. Add a new migration; never rewrite a migration already applied to a shared
   environment.
4. Re-run the complete database test.

## Desktop Agent

### Pairing fails

- Confirm the 12-character code has not expired or been used.
- Confirm Web and Agent point to the same HTTPS control plane.
- Check the system clock; Agent requests enforce a timestamp window.
- Revoke the old device and start a new pairing instead of copying token files.

### A folder cannot be used

Choose it through the Agent's system folder picker. Typed paths, symlinks that
escape the approved root, traversal segments, and access outside the stored
grant are rejected.

### Excel processing is rejected

The MVP supports `.xlsx` and CSV, not `.xls` or `.xlsm`. It rejects encrypted
archives, VBA, embedded objects, external links, suspicious ZIP expansion, and
configured file/row/sheet limits. Preserve the original file and review the
structured error code.

## Google OAuth

The callback URL must exactly match `GOOGLE_REDIRECT_URI`. Missing client ID,
client secret, redirect URI, or 32-byte base64 encryption key disables the live
connector without breaking Mock mode. Never paste an OAuth code, token, or
encryption key into support messages.

## Packaging and release

- AppX/MSIX packaging must run on Windows because `makeappx` is Windows-only.
- Store draft filenames contain `DRAFT-DO-NOT-SUBMIT`; do not submit default
  Electron artwork.
- Unsigned direct-download installers are prerelease/test artifacts only.
- Stable macOS direct downloads require Developer ID signing/notarization.
- Verify `SHA256SUMS` and machine-readable release metadata before testing an
  installer.
