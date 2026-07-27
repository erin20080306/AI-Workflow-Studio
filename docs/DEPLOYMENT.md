# Deployment

## Deployment boundaries

- Vercel hosts only the Next.js web control plane and bounded server routes.
- Supabase hosts authentication and PostgreSQL with Row Level Security.
- Local folder watching and Excel processing run only in the Electron agent.
- GitHub Actions builds, tests, packages, checksums, and publishes desktop
  artifacts on their native operating systems.
- GitHub Releases distributes platform installers and update metadata.

## Vercel configuration

| Setting         | Value                            |
| --------------- | -------------------------------- |
| Root Directory  | `apps/web`                       |
| Framework       | Next.js                          |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command   | `pnpm build`                     |

The checked-in `apps/web/vercel.json` records the install and build commands.
Vercel resolves workspace packages through the repository's pnpm workspace and
root lockfile; shared packages are not copied into the web application. Use
[the production checklist](./PRODUCTION_CHECKLIST.md) before connecting a live
domain.

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

The internal schedule tick requires
`Authorization: Bearer <CRON_SECRET>`. Do not register the route as a Vercel
Cron job until the durable Production Run and Desktop Agent dispatcher is
configured; the route intentionally fails closed before that boundary exists.
See [safe recurring schedules](./SCHEDULES.md).

## Desktop release channels

Windows artifacts are built on Windows runners and macOS artifacts on macOS
runners. Update download is user-initiated by default.

- Prerelease tags may publish explicitly marked unsigned installers for
  controlled testing at no signing cost.
- Stable tags fail unless macOS signing/notarization and Windows Authenticode
  credentials are configured. A successful stable workflow creates a draft for
  human review.
- Each channel includes SHA-256 files, signing-aware JSON metadata, and a scan
  for credential patterns and local paths.

Microsoft Store AppX/MSIX is the planned zero-certificate-cost Windows
production alternative. The Partner Center product name and identity are
reserved, and a manual Windows-only workflow can produce x64/arm64 package
drafts. Those drafts are not interchangeable with an unsigned GitHub EXE and
must not be submitted until branded assets, native installation, Windows App
Certification Kit, listing, privacy, and support checks pass. See
[the release checklist](./RELEASE_CHECKLIST.md).

## Current deployment status

The web application and desktop development package build locally. Vercel
configuration, CI, direct release, and Microsoft Store package workflow
definitions are checked in, but nothing has been deployed, submitted to
Microsoft Store, signed, or released. Production Supabase adapters, real
registration, platform Super Admin, and billing remain required before go-live.
