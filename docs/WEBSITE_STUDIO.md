# Website Studio

## Phase 24 boundary

Website Studio is a separate authenticated workspace for planning a website
before publishing is allowed. Phase 24 creates Tenant-isolated Website Projects,
validates the brief, and lets Auto, OpenAI, Claude, Gemini, or development Mock
produce a versioned Website Spec. It does not execute, preview, deploy, or
publish website code.

The six required decisions are:

1. Purpose
2. Audience
3. Pages
4. Brand direction
5. Content
6. Calls to action

Every decision is saved through an authenticated server route. A project cannot
become a `draft` until the complete brief passes the shared Zod schema.

## Data model and authorization

`website_projects` stores the project name, tenant slug, status, bounded brief
JSON, completion count, and timestamps. `website_specs` stores immutable
versioned specifications, provider/model audit metadata, validation attempts,
and timestamps. Both tables have RLS enabled.
Authenticated members may read only their Tenant rows. Browser roles receive no
insert, update, or delete privilege; mutations use the existing server-only
Supabase administrator client after deriving the actor and Tenant from the
verified session.

Viewer memberships cannot mutate. API routes never accept a client-provided
Tenant identifier. Cross-Tenant project identifiers are returned as not found.

Audit events record only the project identifier, action, completed-step count,
names of changed fields, provider, model, schema version, specification version,
and validation-attempt count. They do not copy the brief, generated content,
credentials, prompts, provider response bodies, or unpublished customer
material.

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

## Draft lifecycle

`briefing` projects may be updated step by step. Creating a draft is idempotent
and requires all six validated decisions. Phase 23 then locks the draft to avoid
silent unversioned changes.

Phase 24 creates specification version 1 idempotently. Phase 26 introduces
reversible versioned editing. Until then, a changed brief should be created as a
new Website Project.

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

## Future gated phases

- Phase 26: isolated desktop, tablet, and mobile preview canvas.
- Phase 27: validated direct and natural-language edits, undo/redo, versions,
  comparison, and restoration.
- Phase 30: explicit publish approval, quality gates, deployment, domains,
  history, and rollback.

No model output may release executable JavaScript, Python, shell commands, build
scripts, HTML/CSS source, or unbounded URLs.
