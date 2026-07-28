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
  OAuth secrets, model provider keys, Microsoft Store service credentials, and
  cron secrets are server-only.
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

Microsoft Store entitlement verification additionally requires the server-only
`MICROSOFT_STORE_TENANT_ID`, `MICROSOFT_STORE_CLIENT_ID`,
`MICROSOFT_STORE_CLIENT_SECRET`, and `MICROSOFT_STORE_PLAN_MAPPINGS` values.
The short-lived Store ID key is sent by the signed-in Windows app to the
authenticated synchronization route; it is not a Vercel environment variable
and is never persisted. See
[usage control and Store entitlements](./USAGE_AND_STORE.md).

Customer custom-domain automation additionally requires
`VERCEL_CUSTOM_DOMAIN_PROJECT_ID`, an optional
`VERCEL_CUSTOM_DOMAIN_TEAM_ID`, and a server-only
`VERCEL_CUSTOM_DOMAIN_TOKEN`. The token must be limited to the Vercel scope and
team that owns the production project and must never use a `NEXT_PUBLIC_`
variable. Missing credentials keep the platform host and wildcard subdomains
available while the custom-domain claim control fails closed.

For each customer hostname, the server registers the hostname with the existing
Vercel project and returns the provider's exact ownership and routing records.
Do not copy a generic DNS value when Vercel supplies a different recommendation.
The application marks a hostname active only when Vercel reports both ownership
verification and a non-misconfigured DNS route. Vercel provisions TLS after
those checks pass; the application does not store certificate private keys.

Production setup order:

1. Apply the `website_custom_domains` migration.
2. Add the three server-only Vercel variables to Production.
3. Deploy the matching Git commit.
4. Claim a disposable customer-owned test hostname as a paid workspace owner.
5. Add the exact DNS records shown by the application.
6. Recheck until both verification badges pass.
7. Test `/` and every generated inner-page link over unauthenticated HTTPS.

Customer source ZIP download remains paid-only. Customer GitHub publishing and
guided payment/API integrations are separate gated delivery phases; a platform
repository push does not imply that a customer's generated website has been
pushed to that customer's GitHub account.

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

The hosted Web/Supabase authentication boundary, usage controls, Website Studio,
platform publishing, wildcard customer-site hosting, and paid static ZIP export
are deployed. The production project and aliases are healthy. Customer custom
domains require the Phase 36 migration plus the server-only Vercel domain
credentials before the claim control can be enabled.

No Microsoft Store package has been submitted, certified, or connected to the
entitlement endpoint, and no signed desktop release or GitHub Release has been
published. Microsoft Store remains the sole planned paid-commerce source; the
Web intentionally has no separate card checkout.
