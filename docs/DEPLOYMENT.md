# Deployment

## Deployment boundaries

- Vercel hosts only the Next.js web control plane and bounded server routes.
- Supabase hosts authentication and PostgreSQL with Row Level Security.
- Local folder watching and Excel processing run only in the Electron agent.
- GitHub Actions builds, tests, packages, checksums, and publishes desktop
  artifacts on their native operating systems.
- GitHub Releases distributes platform installers and update metadata.

## Planned Vercel configuration

| Setting         | Value                            |
| --------------- | -------------------------------- |
| Root Directory  | `apps/web`                       |
| Framework       | Next.js                          |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command   | `pnpm build`                     |

Workspace package resolution must be configured at the monorepo level. Shared
packages must not be copied into the web application.

## Environment classes

- Public browser values use the `NEXT_PUBLIC_` prefix and contain no secrets.
- Supabase service credentials, encryption keys, device-token pepper, Google
  OAuth secrets, model provider keys, and cron secrets are server-only.
- A provider key may be omitted; that provider then reports unavailable while
  mock mode and other configured providers continue to work.

The authoritative variable list will live in `apps/web/.env.example` once the web
application is introduced. Example files contain names and explanations only.

Google OAuth additionally requires an HTTPS callback registered exactly as
`GOOGLE_REDIRECT_URI` and a unique 32-byte base64 `APP_ENCRYPTION_KEY`. These
values are never exposed through `NEXT_PUBLIC_` variables. Missing Google values
disable live connection creation without breaking the build or Mock mode.

## Desktop releases

Windows artifacts are built on Windows runners and macOS artifacts on macOS
runners. Update download is user-initiated by default. Signing is conditional on
the appropriate secrets. Unsigned artifacts are development-only and must never
be described as production-ready.

Phase 8 adds the Electron Builder configuration and verifies an unsigned,
unpacked macOS development application. It deliberately sets no signing
identity, installer, checksum, or public release metadata. Native signed
installers and the GitHub update channel remain Phase 12 release gates.

## Current deployment status

The web application and desktop development package build locally. Nothing has
been deployed or released. Live Vercel, Supabase, signing, and GitHub Release
configuration remains intentionally deferred until Phase 12.
