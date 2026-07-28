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

Customer websites use the verified wildcard
`*.sites.erin-aiworkflowstudio.com`. Customers choose only the first label in
Website Studio. The server validates and reserves that label during publishing;
customers do not add DNS records or provide domain credentials. No Vercel API
token is required for per-site publishing.

Production setup order:

1. Keep `*.sites.erin-aiworkflowstudio.com` attached to the Production project.
2. Apply the platform-subdomain publishing migration.
3. Deploy the matching Git commit.
4. Publish using an unused label from Website Studio.
5. Test `/` and every generated inner-page link through the resulting wildcard
   URL over unauthenticated HTTPS.

Customer source ZIP download and GitHub publishing remain paid-only. Guided
payment/API integrations are a separate gated delivery phase.

### GitHub App for paid source delivery

Create a dedicated GitHub App rather than accepting personal access tokens.
Configure:

| GitHub App setting     | Production value                                                         |
| ---------------------- | ------------------------------------------------------------------------ |
| Homepage URL           | `https://www.erin-aiworkflowstudio.com`                                  |
| Callback URL           | `https://www.erin-aiworkflowstudio.com/api/integrations/github/callback` |
| OAuth during install   | Enabled; the install request carries a short-lived state and PKCE pair   |
| Setup URL              | Disabled and ignored while OAuth during installation is enabled          |
| Repository permissions | Metadata: read; Contents: read and write                                 |
| Installation scope     | Any account; each installer chooses selected repositories                |

Store the resulting values as server-only Vercel Production variables:

- `GITHUB_APP_ID`
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_APP_CLIENT_SECRET`
- `GITHUB_APP_PRIVATE_KEY_BASE64`
- `GITHUB_APP_SLUG`

Encode the complete PEM private-key file as one padded base64 value before
setting `GITHUB_APP_PRIVATE_KEY_BASE64`. Never prefix these variables with
`NEXT_PUBLIC_`, paste them into generated source, or expose them in screenshots
or support tickets. Apply the paid GitHub publishing migration before enabling
the feature. Revoking an installation immediately prevents new repository
writes; removing the local connection clears the platform association without
storing a long-lived GitHub credential.

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
are deployed. The production project and aliases are healthy. Platform
subdomain publishing does not require a per-customer Vercel credential. Paid
GitHub delivery becomes available only after its migration, matching GitHub App,
and five server-only variables are present.

No Microsoft Store package has been submitted, certified, or connected to the
entitlement endpoint, and no signed desktop release or GitHub Release has been
published. Microsoft Store remains the sole planned paid-commerce source; the
Web intentionally has no separate card checkout.
