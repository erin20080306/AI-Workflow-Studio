# Website Studio

## Phase 23 boundary

Website Studio is a separate authenticated workspace for planning a website
before any model generation or publishing is allowed. The current phase creates
tenant-isolated Website Projects and a validated brief. It does not create,
execute, preview, deploy, or publish website code.

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
JSON, completion count, and timestamps. The table has RLS enabled.
Authenticated members may read only their Tenant rows. Browser roles receive no
insert, update, or delete privilege; mutations use the existing server-only
Supabase administrator client after deriving the actor and Tenant from the
verified session.

Viewer memberships cannot mutate. API routes never accept a client-provided
Tenant identifier. Cross-Tenant project identifiers are returned as not found.

Audit events record only the project identifier, action, completed-step count,
and names of changed fields. They do not copy the brief, generated content,
credentials, provider output, or unpublished customer material.

## Validation and limits

- Project names: 2–120 characters.
- Purpose, audience, and brand direction: 10–1,000 characters when complete.
- Content notes: 10–6,000 characters when complete.
- Pages: 1–12, each with a unique lowercase URL slug, title, and goal.
- Calls to action: 1–8 unique bounded labels.
- Unknown properties and malformed JSON fail closed.
- Requests are limited to 32 KB.

The database additionally constrains status/progress/timestamp combinations. A
stored `draft` must have all six steps, a completion timestamp, and a draft
timestamp.

## Draft lifecycle

`briefing` projects may be updated step by step. Creating a draft is idempotent
and requires all six validated decisions. Phase 23 then locks the draft to avoid
silent unversioned changes.

Phase 26 introduces reversible and versioned editing. Until then, a changed
brief should be created as a new Website Project.

## Future gated phases

- Phase 24: OpenAI, Claude, Gemini, Auto, development Mock, and a strict
  versioned Website Spec made only from registered component/content JSON.
- Phase 25: isolated desktop, tablet, and mobile preview canvas.
- Phase 26: validated direct and natural-language edits, undo/redo, versions,
  comparison, and restoration.
- Phase 27: explicit publish approval, quality gates, deployment, domains,
  history, and rollback.

No model may return executable JavaScript, Python, shell commands, build scripts,
or unbounded URLs. API keys remain server-only deployment variables and are
never entered by ordinary users.
