# Website Studio

## Product boundary

Website Studio is a separate authenticated workspace for planning a website
and publishing an explicitly approved Canvas version. Phase 30 makes a
natural-language request the primary entry point, asks only for missing
decisions, produces a validated versioned Website Spec, and serves the exact
confirmed version from a stable platform URL. It never executes model-generated
website code.

The six required decisions are:

1. Purpose
2. Audience
3. Pages
4. Brand direction
5. Content
6. Calls to action

Every decision is saved through an authenticated server route. The conversational
entry and optional advanced editor share the same schema. A project cannot
become a `draft` or create a Canvas version until the complete brief passes the
shared Zod schema.

## Data model and authorization

`website_projects` stores the project name, tenant slug, status, bounded brief
JSON, completion count, and timestamps. `website_brief_messages` stores bounded
prompt/question/answer/ready messages. `website_specs` stores immutable
versioned specifications, provider/model audit metadata, validation attempts,
and timestamps. `website_publications` freezes the approved spec version and
keeps superseded release history. All tables have RLS enabled.
Authenticated members may read only their Tenant rows. Browser roles receive no
insert, update, or delete privilege; mutations use the existing server-only
Supabase administrator client after deriving the actor and Tenant from the
verified session.

Viewer memberships cannot mutate. API routes never accept a client-provided
Tenant identifier. Cross-Tenant project identifiers are returned as not found.

Audit events record only the project identifier, action, completed-step count,
names of changed fields, provider, model, schema version, specification version,
conversation message kind/step, publication slug, and validation-attempt count.
They do not copy the brief, generated content, credentials, prompts, answers,
provider response bodies, or unpublished customer material.

`website_github_connections` stores only the Tenant, connecting actor, GitHub
App installation/account identifiers, account label/type, state, and timestamps.
`website_github_publications` records an exact immutable Website Spec version,
repository identifier/name, platform-managed branch, deterministic source/tree/
commit digests, idempotency key, and bounded outcome metadata. Browser roles
receive no privileges on either table.

## Validation and limits

- Project names: 2–120 characters.
- Purpose, audience, and brand direction: 10–1,000 characters when complete.
- Content notes: 10–6,000 characters when complete.
- Pages: 1–12, each with a unique lowercase URL slug, title, and goal.
- Calls to action: 1–8 unique bounded labels.
- Unknown properties and malformed JSON fail closed.
- Requests are limited to 32 KB.
- Website Specs accept only registered sections, curated theme tokens, bounded
  text, internal page/section/contact actions, and ID-based asset references.
- Page slugs must exactly match the validated brief.
- Duplicate IDs, missing targets, missing assets, code fences, scripts,
  commands, HTML, and external/data URLs fail closed.
- Provider output is limited to 1 MB and receives at most one bounded repair
  attempt containing validation paths only, never rejected output.

The database additionally constrains status/progress/timestamp combinations. A
stored `draft` must have all six steps, a completion timestamp, and a draft
timestamp.

## Prompt, Canvas, and draft lifecycle

The first prompt passes through structured AI output validation. It may fill only
known brief fields and return bounded follow-up questions. Each answer updates
one named missing step; the server calculates the next question from the
validated brief rather than trusting a model-supplied workflow.

`briefing` projects may also be updated with the advanced six-step editor.
Creating a draft is idempotent and requires all six validated decisions. The
first Canvas build locks the brief and creates specification version 1.
Conversational and direct changes create new immutable versions; comparison,
restore, Undo, and Redo never rewrite an existing version.

## Publication boundary

- Publishing requires an authenticated non-viewer and an explicit `confirmed:
true` request for one exact existing version.
- A model response cannot call or satisfy the confirmation endpoint.
- The database RPC locks the project, verifies Tenant membership and the exact
  spec version, supersedes the old active release, inserts an immutable release,
  and writes a content-free audit record.
- Only one active release and one active public slug may exist per project.
  Superseded rows remain available for audit and future rollback work.
- `/s/{siteSlug}` renders the stored Website Spec on the server. It does not
  compile or execute customer HTML, CSS, JavaScript, Python, or shell content.
- Public asset requests resolve an ID already referenced by the approved spec
  and proxy project-owned private storage. They do not accept storage paths from
  the URL.
- Restrictive CSP, frame, content-type, and referrer headers are attached to
  public HTML and asset responses.

## Paid GitHub delivery boundary

- Free members may create, preview, edit, and publish on the platform wildcard,
  but cannot download source or write it to GitHub.
- A paid Tenant owner or admin connects a revocable GitHub App installation.
  The browser never accepts a personal access token and never receives a GitHub
  App private key, client secret, installation token, or user access token.
- The user must select one repository, one exact immutable Website Spec version,
  and a branch below `ai-workflow-studio/`, then check a separate confirmation
  before the server performs the external write.
- The server regenerates the same registered-component static source used by
  paid ZIP export. It rejects unsafe paths, credential-like values, private-key
  material, local absolute paths, and executable model output before transfer.
- Each attempt uses a deterministic idempotency key. A successful retry returns
  the existing recorded commit rather than creating another external write.
- Installation access tokens are repository-scoped and short lived. The
  platform stores installation metadata only; the temporary OAuth user token is
  revoked after the installation is verified.
- A pre-existing managed branch is updated only when its `manifest.json`
  identifies the same Website Project. The source branch does not rewrite the
  repository's default branch.
- Audit and publication records contain identifiers, integrity digests, commit
  metadata, and bounded error codes only. They never contain source files,
  prompts, customer content, or credentials.

## Model and credential boundary

- Auto safely routes to the first verified provider and mapped model.
- Ordinary users see provider labels, generation levels, and the allowlisted
  public model names behind those levels. They do not receive provider
  readiness diagnostics, environment names, credential state, keys, or
  administrative mapping controls.
- Provider keys remain server-only Vercel variables. See
  `docs/AI_PROVIDER_SETUP.md`.
- Usage is conservatively reserved before provider access and recorded against
  the Tenant's `website_generation` budget.

## Follow-on hosting work

- Per-site independent deployment projects where commercially required.
- Generated sitemap/robots indexes for multi-page sites.
- Publication-history and rollback controls in the member UI.
- Expanded accessibility, broken-link, and SEO quality reports before approval.

No model output may release executable JavaScript, Python, shell commands, build
scripts, HTML/CSS source, or unbounded URLs.
