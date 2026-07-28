# Execution Plan

This document is the phase gate for AI Workflow Studio. A phase may begin only
after the previous phase has passed its applicable formatting, lint, typecheck,
test, and build checks and has been committed.

## Status legend

- `completed`: implementation, validation, status update, and commit are done.
- `in-progress`: this is the only phase that may be modified.
- `pending`: implementation has not started.
- `blocked`: an external decision, permission, or credential is required.

## Phases

| Phase | Scope                         | Acceptance gate                                                                  | Status    |
| ----- | ----------------------------- | -------------------------------------------------------------------------------- | --------- |
| 0     | Repository audit              | Repository state, build baseline, architecture, and risks documented             | completed |
| 1     | Monorepo and guardrails       | Install, format, lint, typecheck, and unit tests pass                            | completed |
| 2     | Next.js web foundation        | App Router shell, auth screens, mock mode, and production web build pass         | completed |
| 3     | Supabase schema and tenancy   | Fresh migrations and tenant-isolation tests pass                                 | completed |
| 4     | Workflow schema and engine    | Schema, registry, DAG, risk, dry-run, and executor tests pass                    | completed |
| 5     | Workflow web UI               | Mock workflow E2E and web build pass                                             | completed |
| 6     | AI gateway                    | Provider adapters build without keys; strict JSON and mock tests pass            | completed |
| 7     | Pairing and job API           | Token, tenant, claim, lease, and revocation tests pass                           | completed |
| 8     | Desktop agent foundation      | Development build and unsigned test package pass; folder access is constrained   | completed |
| 9     | Local Excel executor          | Fixture, idempotency, atomic output, backup, and traversal tests pass            | completed |
| 10    | Google Sheets connector       | Mock OAuth/Sheets tests pass; credentials are optional and server-only           | completed |
| 11    | Run orchestration             | End-to-end mock run, reconnect, approval, and de-duplication pass                | completed |
| 12    | GitHub release and Vercel     | CI, production web build, platform desktop builds, and secret checks pass        | completed |
| 13    | Security and final acceptance | Security review, go-live additions, and all MVP acceptance criteria pass         | completed |
| 14    | Hosted Web staging            | Hosted migrations, Auth configuration, Vercel deployment, and smoke test pass    | completed |
| 15    | Remote CI repair              | Linux quality checks and macOS/Windows package jobs pass remotely                | completed |
| 16    | Platform Admin bootstrap      | A verified Auth user has an active server-granted Super Admin role               | completed |
| 17    | AI conversation workspace     | Bilingual planner chat, safe modes, and configured model selection pass          | completed |
| 18    | Durable multi-model chat      | Authenticated streaming conversations persist with tenant isolation              | completed |
| 19    | Tool and artifact workspace   | Files, sources, tool registry, and generated artifacts are bounded and audited   | completed |
| 20    | Approval-aware execution      | Reviewed plans can dispatch idempotent jobs with explicit approval gates         | completed |
| 21    | Schedules and connectors      | Recurring runs and selected business connectors pass integration tests           | completed |
| 22    | Usage and operations          | Provider usage, quotas, billing controls, and production observability pass      | completed |
| 23    | Website Studio foundation     | Guided briefs create validated, tenant-isolated website projects                 | completed |
| 24    | AI website specification      | Multi-model guidance produces only validated component and content specs         | completed |
| 25    | Tier-aware AI model routing   | Store plan, task complexity, readiness, and budget bound exact model access      | completed |
| 26    | Responsive preview canvas     | Sandboxed desktop, tablet, and mobile previews remain isolated and deterministic | completed |
| 27    | Visual editing and versions   | Natural-language and direct edits are reversible, versioned, and auditable       | completed |
| 28    | AI website image generation   | Bounded provider images become private, validated, quota-controlled assets       | completed |
| 29    | Unified AI workspace          | Exact models, chat images, and confirmed deletion remain quota and Tenant safe   | completed |
| 30    | Prompt-to-site and publishing | Prompt, follow-up, Canvas, edits, and approved public releases pass all gates    | completed |
| 31    | Prompt-to-workflow automation | Short prompts create validated, persisted, approval-aware workflow drafts        | completed |
| 32    | Account-verified AI models    | Three providers route only to account-listed, tier-compatible text model IDs     | completed |
| 33    | Production site acceptance    | Live prompt-to-site, editing, approval, and public routes pass                   | completed |
| 34    | Wildcard subdomain hosting    | Every active publication receives a verified stable platform subdomain           | completed |
| 35    | Portable static export        | Paid users can download a bounded, secret-free, verifiable website ZIP           | completed |
| 36    | Customer-selected subdomains  | Each site can reserve a safe unique label on the platform wildcard               | completed |
| 37    | AI-first website brief        | One direction prompt creates a rich inferred brief with bounded follow-ups       | completed |
| 38    | Paid GitHub site publishing   | Paid users can explicitly push an exact safe release through a GitHub App        | completed |
| 39    | Guided site delivery          | Subdomain or pasted GitHub URL paths produce safe, actionable delivery guidance  | completed |
| 40    | Guided site integrations      | Allowlisted payment/API modules guide setup without exposing credentials         | pending   |
| 41    | Website delivery acceptance   | Free/paid gates, pages, domains, ZIP, GitHub, and integrations pass end to end   | pending   |

## Phase 0 — Repository audit

### Deliverables

- Confirm Git root, branch, remote state, tracked files, and package-manager state.
- Record the build and test baseline without inventing unavailable commands.
- Establish project rules and the required documentation skeleton.
- Record architectural decisions, deployment boundaries, security invariants, and
  the testing strategy.

### Gate

- The empty-repository baseline is recorded in `docs/STATUS.md`.
- Repository paths were discovered rather than assumed.
- No application implementation or dependency installation is included.

## Phase 1 — Monorepo and guardrails

Create the pnpm workspace, root scripts, shared TypeScript configuration,
Prettier, ESLint, Vitest, Git ignores, CI baseline, and product configuration.
All required quality commands must execute successfully before the phase is
committed.

## Phase 2 — Next.js web foundation

Create the web app with App Router, Tailwind CSS, accessible public/auth screens,
dashboard shell, loading and error UI, environment validation, and a deterministic
mock mode.

## Phase 3 — Supabase schema and tenancy

Add immutable SQL migrations for the required tenant-owned tables, constraints,
indexes, triggers, Row Level Security policies, development seed data, and
database setup/type-generation documentation.

## Phase 4 — Workflow schema and engine

Implement the versioned Zod DSL, node registry, semantic/DAG validation, risk
classification, dry runs, deterministic execution contracts, cancellation,
timeouts, retries, and idempotency.

## Phase 5 — Workflow web UI

Implement workflow list, creation, detail/version views, node canvas, inspector,
validation feedback, risk summary, permission summary, approvals, and dry-run
experience.

## Phase 6 — AI gateway

Implement the common provider interface, server-only OpenAI/Anthropic/Gemini
adapters, mock adapter, bounded repair loop, strict JSON validation, provider
availability UI, and redacted usage accounting.

## Phase 7 — Pairing and job API

Implement pairing codes, hashed device tokens, heartbeat, pending job discovery,
atomic claim, leases, progress, completion/failure, revocation, tenant checks,
timestamps, and idempotency.

## Phase 8 — Desktop agent foundation

Create the Electron application, pair/status/folder UI, tray behavior, local
secure storage, reconnecting job client, structured redacted logs, startup
setting, privacy controls, and user-initiated update flow.

## Phase 9 — Local Excel executor

Implement authorized file access, watcher behavior, Excel/CSV readers and
writers, transformations, size/row/sheet limits, hashing, temporary output,
atomic rename, backup, and duplicate suppression.

## Phase 10 — Google Sheets connector

Implement independent OAuth connections, encrypted refresh tokens, refresh and
revoke behavior, health checks, lists, read/append/update/sync operations, batch
requests, bounded exponential backoff, and mock integration tests.

## Phase 11 — Run orchestration

Connect cloud run creation, approvals, agent jobs, leases, step progress, retry,
cancel, timeout, reconnection, audit logs, notifications, and run detail UI.

## Phase 12 — GitHub release and Vercel

Complete least-privilege CI and cross-platform desktop release workflows,
checksums, signing-aware metadata, Vercel workspace configuration, production
environment checklist, and release checklist.

## Phase 13 — Security and final acceptance

Review dependencies, RLS, API authorization, path containment, token handling,
client bundles, redaction, destructive actions, documentation, troubleshooting,
and the complete MVP acceptance path. The user-requested go-live scope also
includes real Supabase registration/session/Tenant onboarding, a separately
authorized platform Super Admin, subscription entitlements, bilingual
Traditional Chinese/English product UI, branded Store assets, and truthful
deployment/release verification. External publication remains blocked until its
corresponding provider access and release requirements are available.

## Phase 14 — Hosted Web staging

Configure the explicitly authorized hosted Supabase and Vercel projects without
committing provider credentials. Match the hosted PostgreSQL major version,
apply and verify immutable migrations, configure secure Auth redirects and
confirmation controls, store server-only values in protected Vercel environment
variables, deploy the Web workspace, and smoke-test the real registration and
session boundary.

## Phase 15 — Remote CI repair

Repair GitHub Actions runner bootstrap ordering so the configured pnpm version
exists before `setup-node` requests its pnpm cache. Keep third-party actions
pinned to immutable commits, make browser-test locators resilient to framework
developer tooling, and verify Linux quality/Web checks plus unsigned macOS and
Windows package jobs on the remote runners.

## Phase 16 — Platform Admin bootstrap

Verify the intended production Auth user through the protected provider
boundary, grant the initial `super_admin` role with the documented server-side
transaction, and read the resulting role record back without committing any
user identifier, email address, handle, credential, or provider response.

## Phase 17 — AI conversation workspace

Add a Codex-inspired bilingual workspace where an authenticated user can enter a
natural-language automation request, choose Auto, OpenAI, Claude, Gemini, or the
development-only Mock provider, and receive a validated Workflow v1 plan in a
conversation layout. The model picker must reflect server-side configuration
without exposing API keys. Live keys remain exclusively in Vercel server-only
environment variables. Ordinary workspaces may display public provider labels
and allowlisted model names needed to make a selection. Provider readiness,
credential state, environment names, and mapping controls remain restricted to
platform administration. Only Plan mode is active in this phase; Ask, Run,
attachments, and durable history must be visibly labeled as later phases.

## Phase 18 — Durable multi-model chat

Add tenant-isolated conversation and message persistence, server-side streaming,
provider-neutral chat contracts, cancellation, bounded context, usage records,
and safe conversation continuation for OpenAI, Anthropic, and Gemini.

## Phase 19 — Tool and artifact workspace

Add a typed tool registry, approved file/context attachment, source citations,
artifact previews and downloads, and auditable tool results. Tool output must be
validated and must not expand filesystem or credential authority.

## Phase 20 — Approval-aware execution

Turn a reviewed plan into a versioned workflow draft and connect explicit
approval to the existing run orchestrator and Desktop Agent. Ask and Plan remain
read-only; Run may dispatch only validated nodes and must preserve idempotency,
audit events, folder boundaries, and destructive-action approvals.

## Phase 21 — Schedules and connectors

Add recurring schedules and prioritized business connectors behind explicit
workspace authorization. Each connector must use server-only credentials,
bounded scopes, revocation, health checks, retries, and integration tests.

## Phase 22 — Usage and operations

Add provider usage and cost visibility, tenant quotas, subscription enforcement,
rate limits, operational dashboards, alerting, and a final production acceptance
pass for the expanded AI workspace. Microsoft Store subscription add-ons are the
only paid-commerce source for the first release: the application must verify and
sync Store entitlements to Supabase Tenant access without collecting payment-card
data or adding a separate Web payment processor. Plan allowances must convert
provider, generation, file-processing, and tool costs into a bounded monthly cost
budget with 80% and 95% warnings, a fail-closed 100% ceiling, auditable overrides,
and administrator-visible revenue, estimated cost, remaining allowance, and
margin reporting.

## Phase 23 — Website Studio foundation

Add a separate Website Studio product area with tenant-isolated projects and a
Codex-style guided brief. The assistant must collect purpose, audience, pages,
brand direction, content, and desired calls to action before it can create a
site draft. Projects remain drafts and cannot publish in this phase.

## Phase 24 — AI website specification

Add OpenAI, Claude, Gemini, Auto, and development Mock support for a versioned
Website Spec schema. Models may produce only validated layout, theme, content,
asset-reference, and registered-component JSON. They must never produce or
execute arbitrary JavaScript, Python, shell commands, build scripts, or
unbounded URLs.

## Phase 25 — Tier-aware AI model routing

Add Economy, Standard, Advanced, and Flagship model tiers across OpenAI, Claude,
and Gemini. Ordinary members may see the allowlisted public model names behind
each tier, but never credential state, environment names, provider responses, or
administrative mapping controls.
Microsoft Store-backed plan entitlements must decide the highest selectable
tier. Auto routing must consider operation complexity, remaining monthly budget,
provider readiness, and a provider-specific cost multiplier. Enforce both
monthly and per-request cost ceilings before provider calls, allow high-cost
Preview and Fable models only within paid-plan quotas, and keep model mappings
editable only by audited platform Super Admin actions.

## Phase 26 — Responsive preview canvas

Render validated Website Specs in a sandboxed preview canvas with desktop,
tablet, and mobile viewports, zoom, page navigation, loading and error states,
and strict preview-origin isolation. Add accessibility, overflow, responsive,
asset, and deterministic-render tests before any publishing work begins.

## Phase 27 — Visual editing and versions

Add natural-language section edits, direct property controls, reorder and
duplicate operations, undo/redo, named versions, comparison, and restoration.
Every model and user change must be validated, reversible, tenant-scoped, and
recorded without prompts, secrets, or unpublished private content leaking into
operational logs.

## Phase 28 — AI website image generation

Add explicit website-image generation from bounded prompts using configured
OpenAI or Gemini server credentials. Store generated bytes in private,
Tenant-scoped storage, reference only validated asset IDs from Website Specs,
serve assets through authenticated and authorization-checked routes, and
enforce plan, per-request, monthly, size, MIME, dimension, and provider-cost
limits before generation. Claude may help refine image instructions but must
route actual image rendering through a configured image-capable provider.
Preview and version history must remain reversible, auditable, and free of
arbitrary model-provided URLs, code, data URIs, or client-visible credentials.

## Phase 29 — Unified AI workspace

Replace the separate provider and tier-card presentation with one compact model
selector grouped by Economy, Standard, Advanced, and Flagship. Keep every
allowlisted exact model visible while disabling choices outside the current
Microsoft Store entitlement or provider readiness. Add quota-controlled image
generation directly to durable conversations using only configured server-side
OpenAI or Gemini credentials. Store images privately and serve them only through
Tenant-authorized routes. Add explicit, confirmed conversation deletion that
atomically removes messages, sources, artifacts, and image metadata while
retaining a content-free audit event. Website Studio remains a separate,
available workspace.

## Phase 30 — Prompt-to-site and publishing

Make a natural-language request the primary Website Studio entry point. The
assistant may infer only a validated brief patch, ask a bounded set of missing
questions, and create the first Canvas preview only after all required fields
validate. Keep the six-step brief as an optional advanced editor.

Continue changes through the existing immutable Website Spec version engine.
Publishing requires an explicit authenticated confirmation, freezes an immutable
release against one validated spec version, serves only registered components and
private project assets through authorization-aware public routes, and supports a
safe subsequent release without exposing provider or platform credentials.

Add explicit publish approval, safe server rendering, SEO metadata, immutable
release history, and credential-safe platform hosting. Publishing is a material
external action and must never occur from a model response without the
authenticated user's final approval. Customer-selected platform subdomains,
independent per-site deployment projects, sitemap indexes, rollback controls,
and expanded accessibility/link reports continue as follow-on hosting
operations after this prompt-to-public-route milestone.

## Phase 31 — Prompt-to-workflow automation

Replace the remaining Mock-only workflow composer with real, cost-aware Auto
routing across configured OpenAI, Claude, and Gemini models. A request as short
as a few meaningful characters must be accepted; the planner should infer a
manual trigger and conservative bounded defaults when the user does not provide
them, while recording every inference as an assumption.

Provider output must remain valid JSON and pass the existing strict Workflow v1
schema, registered-node, DAG, execution-target, folder-alias, and permission
validation before it is persisted. A validated plan is automatically saved as a
Tenant-scoped draft and may be dry-run without writes. Activation, external
calls, writes, and destructive actions remain separate explicit approvals and
must never be initiated by model output.

## Phase 32 — Account-verified AI model routing

Replace aspirational provider model labels with the exact model IDs returned by
the configured OpenAI, Anthropic, and Gemini accounts. Discover provider model
inventories only from server-side credentials, keep the inventories and mapping
controls restricted to platform Super Admin, and expose ordinary members only to
the exact allowlisted choices available to their Store-backed tier.

Route Assistant chat, workflow planning, and Website Studio through the selected
account-verified model. Distinguish authentication, quota, rate-limit, timeout,
and malformed-response failures without returning credentials or provider
bodies. Aggregate all bounded repair attempts into one cost settlement. If a
provider's final workflow JSON still fails strict validation, release only a
server-constructed, validated, read-only fallback draft; never release or
execute the rejected model output.

Deploy the verified source to Vercel Production and repeat authenticated
end-to-end checks for exact-model selection, Claude and Gemini chat, OpenAI
provider status, safe workflow planning, review-draft persistence, administrator
inventory visibility, and all primary workspace routes.

## Phase 33 — Production prompt-to-site acceptance

Repair and prove the complete production Website Studio path from one natural
language request through bounded questions, validated Canvas generation,
conversation-based edits, explicit publish confirmation, and the public release
route. Live account-verified models remain the first choice.

When a provider returns malformed structured output or a transient provider
failure, use only a server-constructed, schema-validated fallback brief or
registered-component Website Spec. The fallback must be visibly auditable in
version metadata, must never bypass Tenant usage limits, and must not accept
HTML, scripts, commands, credentials, arbitrary code, or unregistered
components. Provider, quota, and validation errors that are not safely
recoverable must reach the member as classified responses rather than an opaque
state conflict.

## Phase 34 — Tenant wildcard subdomain hosting

Add a stable platform-hosted subdomain for every active publication, using the
shape `{siteSlug}.sites.erin-aiworkflowstudio.com`. Resolve only normalized
hostnames to an active publication, rewrite internally to the existing safe
public renderer, and preserve page paths, asset authorization, immutable release
selection, CSP, and Tenant isolation.

The platform wildcard must be configured and verified through Vercel without
exposing dashboard sessions to customer-site hosts. Existing `/s/{siteSlug}`
routes remain compatible fallbacks. Do not claim wildcard availability until an
unauthenticated request to a real generated subdomain and at least one inner
page both return the expected publication.

## Phase 35 — Portable static website export

Add an authenticated, audited ZIP export for an exact validated Website Spec
version. The archive may contain only deterministic static HTML, local CSS,
referenced validated assets, a manifest, and integrity metadata. It must not
contain provider credentials, platform secrets, prompts, private version
history, unpublished assets, absolute local paths, server code, arbitrary
scripts, or executable commands.

Generate archives on demand with bounded file counts and byte limits, validate
every archive path against traversal, and stream the result without persisting
secret-bearing temporary state. Verify the downloaded ZIP can be extracted and
opened as a portable multi-page site.

## Phase 36 — Customer-selected platform subdomains

Allow every Website Studio customer to choose the first label of the existing
platform wildcard URL, for example
`customer-name.sites.erin-aiworkflowstudio.com`. The customer enters only the
label; the application normalizes it, rejects invalid or reserved names, checks
global active-publication availability, and reserves it transactionally during
explicit publishing.

Keep the current platform wildcard, TLS, Proxy renderer, immutable publication,
asset boundary, compatibility route, and Tenant authorization. Re-publishing
the same project may retain or intentionally change its label, while a
concurrent or cross-Tenant collision must fail without superseding the existing
release. This phase requires no customer DNS changes, customer-owned domains, or
Vercel access token.

## Phase 37 — AI-first website brief

Replace the six-step questionnaire as the default Website Studio entry with one
prominent natural-language direction field. The user should be able to describe
the desired business, audience, feeling, pages, and outcomes in ordinary words;
AI must infer the purpose, target audience, information architecture, brand
direction, content strategy, calls to action, page imagery, and safe interactive
modules into the existing validated Website Brief and Website Spec contracts.

If a safe, useful draft cannot be produced, ask only one to three material
follow-up questions in the conversation. Do not require the user to complete
every former questionnaire field. Keep the existing six-step editor under a
collapsed optional `Advanced settings` section for precise overrides, and show a
reviewable AI summary before generating the first Canvas version.

The generated site must include purposeful per-page composition rather than
duplicated placeholder layouts. Story, contact, services, and other requested
pages should receive context-appropriate validated image assignments and
registered smart modules such as FAQ, contact/lead capture, or appointment
intent when the request calls for them. AI output remains schema-validated,
quota-controlled, reversible, and unable to emit executable customer code.

## Phase 38 — Paid GitHub site publishing

Allow free members to continue creating, previewing, and publishing sites on the
platform host, while reserving source ZIP download and customer GitHub publishing
for an active paid subscription. Use a GitHub App installation or equivalent
revocable least-privilege authorization; do not accept broad personal access
tokens in the browser or place GitHub credentials in a generated website.

An authenticated owner or admin must select the exact immutable Website Spec
version, repository, and branch and explicitly confirm the external write.
Generate the same bounded static source accepted by Phase 35, reject secret or
path patterns before transfer, make retries idempotent, and record only
repository identifiers, commit metadata, integrity digest, and outcome in the
audit log. AI suggestions may prepare the release but may never push on their
own.

## Phase 39 — Guided site integrations

Add a step-by-step integration workspace for allowlisted capabilities such as
contact delivery, analytics, an approved payment provider, and selected APIs.
Each module must declare its required server component, provider account,
redirect/webhook URLs, test mode, secret names, data flow, privacy impact, and
deployment prerequisites before it may be enabled.

Generated source may include validated client configuration placeholders and a
documented server contract, but never live secrets. Provider keys, webhook
secrets, OAuth credentials, and payment credentials remain server-only in the
chosen deployment platform. Static-only releases must clearly disable features
that require a backend rather than presenting non-functional forms or checkout
buttons. Enabling external writes or payment collection requires an
authenticated explicit confirmation and provider-specific test acceptance.

## Phase 40 — Website delivery acceptance

Verify the complete website product with separate Free, paid member, workspace
administrator, and platform administrator sessions. Cover creation, all
generated page links, Canvas previews, conversational edits, version restore,
image assets, platform publishing, customer-selected platform subdomains, paid
ZIP export, paid GitHub publishing, and every enabled integration in its
provider test mode.

Confirm quota settlement for AI-assisted website work, denial of paid delivery
features to Free accounts, absence of secrets from browser bundles and exported
source, idempotent external writes, and public availability of each accepted
release before describing the website product as fully implemented.
