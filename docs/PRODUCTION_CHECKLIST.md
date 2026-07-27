# Production environment checklist

This checklist prepares the web control plane for Vercel and the production data
plane for Supabase. It does not authorize a deployment. Record the owner and
completion evidence for every item outside the repository; never paste secret
values into an issue, build log, screenshot, or commit.

## Release boundary

- [ ] The Vercel project deploys only `apps/web`.
- [ ] The Supabase project is dedicated to the intended environment.
- [ ] Preview and production use different databases, OAuth clients, encryption
      keys, peppers, provider keys, and cron secrets.
- [ ] The Electron Agent is distributed separately through an approved desktop
      release channel.
- [ ] No local folder path, spreadsheet contents, device token, OAuth token, or
      AI provider key is sent to Vercel logs or browser telemetry.

## Vercel

- [ ] Import the GitHub repository into Vercel.
- [ ] Set Root Directory to `apps/web` and Framework Preset to Next.js.
- [ ] Keep Install Command as `pnpm install --frozen-lockfile`.
- [ ] Keep Build Command as `pnpm build`.
- [ ] Select Node.js 22 and the repository's Corepack-managed pnpm version.
- [ ] Protect the production branch and require the complete GitHub CI workflow.
- [ ] Configure the production domain and redirect HTTP to HTTPS.
- [ ] Set `NEXT_PUBLIC_APP_URL` to the canonical HTTPS origin without a trailing
      path.
- [ ] Review deployment logs and downloaded source maps for credentials or local
      absolute paths.

`NEXT_PUBLIC_MOCK_MODE=true` is suitable only for a public demonstration with
synthetic data. Supabase Auth and Tenant onboarding are implemented, but do not
switch the flag to `false` until migrations, redirect URLs, mail delivery,
service-role configuration, and durable production repositories pass staging.
Unavailable non-Mock operations fail closed by design.

## Supabase and authentication

- [ ] Apply every immutable migration to a fresh staging project before
      production.
- [ ] Run the database test suite against fresh PostgreSQL and retain only
      metadata-only evidence.
- [ ] Confirm Row Level Security is enabled on every tenant-owned table.
- [ ] Confirm `anon` and `authenticated` cannot call service-only Agent, Google,
      or Run transition functions.
- [ ] Set the Site URL and exact allowed redirect URLs to the canonical Vercel
      origins.
- [ ] Choose email confirmation, password policy, recovery, abuse protection,
      and rate-limit settings before enabling public sign-up.
- [x] Create the first platform Super Admin through an authenticated invitation
      and a server-side role grant. Never seed or store its password in SQL,
      source code, Vercel variables, or GitHub secrets.
- [ ] Enable database backups and test a restore procedure.

The schema provisions a profile when Supabase creates a user, automatically
creates the Free subscription for a new Tenant, and exposes guarded onboarding.
The Web implements registration, email confirmation, login, recovery, password
update, logout, and verified Tenant creation. Follow
[the administrator bootstrap guide](./PLATFORM_ADMIN_BOOTSTRAP.md) only after the
intended Auth user is verified.

## Environment variables

### Public browser values

- [ ] `NEXT_PUBLIC_APP_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (preferred) or the legacy
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `NEXT_PUBLIC_MOCK_MODE`

Only these intended browser values may use the `NEXT_PUBLIC_` prefix. The
Supabase anonymous key is designed for browser use and still relies on RLS; it
must never be substituted for the service-role key.

### Required server-only values

- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `APP_ENCRYPTION_KEY` — unique 32 random bytes encoded as padded base64
- [ ] `AGENT_TOKEN_PEPPER` — independent high-entropy value
- [ ] `CRON_SECRET` — independent high-entropy value

### Feature-specific server-only values

- [ ] Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the exact
      `GOOGLE_REDIRECT_URI`
- [ ] OpenAI: `OPENAI_API_KEY` and `OPENAI_MODEL`
- [ ] Anthropic: `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`
- [ ] Gemini: `GEMINI_API_KEY` and `GEMINI_MODEL`

AI providers are optional. Configure only approved providers, set budgets and
alerts in their consoles, and rotate a provider key immediately if it appears in
a client bundle or log.

## OAuth and external services

- [ ] Register the exact production HTTPS Google callback.
- [ ] Keep Google consent scopes limited to spreadsheet access and read-only
      Drive metadata.
- [ ] Verify token refresh, explicit revoke, disabled-client, and expired-token
      behavior in staging.
- [ ] Document service ownership, quota alerts, and credential rotation.
- [ ] Confirm webhook and scheduled routes reject missing or invalid secrets.
- [ ] Keep the Vercel schedule timer disabled until the durable Production Run
      and Desktop Agent dispatcher passes recurring-to-approval integration.
- [ ] After enabling it, verify concurrent schedule ticks create one fire and
      one Run idempotently.

## Operations and go-live

- [ ] Run format, lint, typecheck, unit, database, browser, and production web
      build gates from a clean checkout.
- [ ] Run the complete Mock acceptance path without optional credentials.
- [ ] Test public registration, email confirmation, login, recovery, logout,
      Tenant creation, and cross-tenant denial after real Auth is connected.
- [ ] Test Agent pairing, lease renewal, cancellation, approval, retry, and
      revocation against staging.
- [ ] Review structured logs for redaction and define retention.
- [ ] Define on-call ownership, incident response, key rotation, rollback,
      backup recovery, status communication, and customer support.
- [ ] Complete [the release checklist](./RELEASE_CHECKLIST.md).

## Current blockers

- Durable production Agent, Run, and Google repository adapters are not
  connected; their affected non-Mock operations fail closed.
- Entitlements are enforced in PostgreSQL, but checkout, invoices, tax, webhook
  processing, and a payment provider are not connected.
- No signed desktop installer, Microsoft Store submission/certification, or
  GitHub Release has been created. The Store identity, branded package assets,
  and bilingual listing copy remain drafts.
