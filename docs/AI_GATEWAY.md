# AI Gateway

## Purpose

The AI gateway converts a bounded natural-language request into untrusted
Workflow v1 JSON. It never executes a workflow. The validated result still has
to pass the normal draft review, risk, permission, approval, and deterministic
executor boundaries.

```text
browser request
  -> strict request schema and 20 KB API limit
  -> server-only provider adapter
  -> provider JSON response mode
  -> exact JSON parse (no Markdown extraction)
  -> AI planner envelope schema
  -> Workflow v1 structural and semantic validation
  -> redacted usage record
  -> validated draft only
```

Provider JSON modes reduce malformed output but are not a trust decision. The
application-side Zod and semantic validators are always authoritative.

## Providers

All adapters implement the same `AiProviderAdapter` interface and use a bounded
45-second HTTP request with a 1 MB response ceiling.

| Provider  | Default model       | API and response mode                               |
| --------- | ------------------- | --------------------------------------------------- |
| Mock      | `mock-planner-v1`   | Deterministic in-process JSON fixture               |
| OpenAI    | `gpt-5.6-sol`       | Responses API with JSON object output               |
| Anthropic | `claude-sonnet-4-6` | Messages API with a JSON-schema output format       |
| Gemini    | `gemini-3.6-flash`  | GenerateContent with JSON MIME type and JSON schema |

The OpenAI adapter uses the Responses API with storage disabled and medium
reasoning effort. Anthropic and Gemini use their structured-output request
fields. Every response is parsed again by the complete application schema
because provider-side schema support and enforcement can differ.

Reference documentation:

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Anthropic Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Gemini Structured Outputs](https://ai.google.dev/gemini-api/docs/structured-output)

## Configuration

The build and all automated tests require no API key. Mock is always available.
Live providers become selectable only when their corresponding server
environment variable is configured:

```text
OPENAI_API_KEY
OPENAI_MODEL
ANTHROPIC_API_KEY
ANTHROPIC_MODEL
GEMINI_API_KEY
GEMINI_MODEL
```

Keys are read only by the server-only adapter factory. The browser receives
provider availability and model names, never key values. Provider base URLs are
fixed to official HTTPS services by default rather than accepted from planner
requests.

Production key values are configured only as encrypted Vercel environment
variables without a `NEXT_PUBLIC_` prefix. The platform-administration provider
page reports only a boolean readiness state, the environment-variable name, and
the selected model. It contains no key input and never receives a key value.
Ordinary workspace settings have no provider-configuration route or card.

## Validation and repair

- Requests permit only a prompt, locale, timezone, a trusted execution target,
  and already-authorized folder-alias IDs.
- Prompts are limited to 8,000 characters and API request bodies to 20 KB.
- Provider output is limited to 1 MB and must be one exact JSON object. Markdown
  fences, prefix/suffix prose, invented fields, unknown nodes, raw paths,
  arbitrary URLs, code, and shell operations are rejected.
- A request may allow zero to two repair attempts; the default is one. The
  repair prompt contains only bounded validation codes and paths, not the
  rejected provider body.
- Exhausted repairs return `AI_OUTPUT_INVALID`. Invalid content is never
  returned as a workflow and never reaches the executor.
- Refusal, safety, truncation, authentication, rate-limit, timeout, and malformed
  provider responses map to stable redacted gateway errors.

## Usage and privacy

Each attempt records provider, model, operation, attempt number, duration,
outcome, token counts, and validation codes. Prompt text, generated content,
provider response bodies, keys, raw file paths, and spreadsheet rows are not
part of usage records. If usage recording fails, the otherwise valid output is
withheld.

Phase 6 uses a redacted server log sink. A tenant-bound persistent sink can be
connected to the existing `usage_records` table when authenticated
orchestration is introduced.

## Testing

Unit tests inject fake HTTP transports and therefore never call paid provider
services. They verify exact endpoints, authorization placement, JSON response
configuration, usage parsing, provider error redaction, bounded repair, invalid
JSON rejection, unknown executable-node rejection, truncation rejection, and
fail-closed usage logging. The browser E2E uses only the Mock adapter.
