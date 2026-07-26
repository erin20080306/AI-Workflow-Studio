# Workflow DSL and Engine

AI Workflow Studio accepts automation plans only through the reviewed Workflow
JSON DSL. AI responses, API requests, stored workflow versions, and desktop jobs
must validate against the same schemas exported by
`@ai-workflow-studio/workflow-schema`. No workflow may contain source code,
shell commands, raw local paths, credentials, or an unregistered node type.

## Version 1 envelope

```json
{
  "schemaVersion": 1,
  "name": "Create a weekly report",
  "description": "Read approved files and create a report.",
  "executionTarget": {
    "type": "desktop",
    "deviceId": "00000000-0000-4000-8000-000000000101"
  },
  "trigger": {
    "type": "manual.trigger",
    "config": {}
  },
  "nodes": [],
  "edges": []
}
```

The structural schema rejects unknown fields. Semantic validation then checks
graph integrity, node references, cycles, connected components, and execution
location compatibility. Node IDs are workflow-local identifiers; database IDs,
device IDs, connection IDs, and folder-alias IDs use UUIDs where applicable.

## Node catalog

Version 1 has 26 allowlisted types:

- Triggers: manual, schedule, folder-created, and folder-changed.
- Local files: list, move, rename, and archive.
- Excel: read, merge, write, create report, and split by field.
- Deterministic data transforms: map, filter, sort, group, aggregate,
  deduplicate, and validate.
- Google Sheets: read, append, update, and sync.
- Outputs: desktop notification and allowlisted webhook call.

Each catalog entry declares where it may run, its risk level, and whether
approval is required. File nodes reference a user-approved folder alias instead
of accepting an absolute path. Webhooks reference a configured connection and
endpoint alias instead of accepting arbitrary URLs.

## Risk and approval rules

| Risk        | Examples                      | Default approval |
| ----------- | ----------------------------- | ---------------- |
| Read        | list/read/filter/aggregate    | None             |
| Write       | create file or notification   | First live run   |
| External    | Sheets mutation or webhook    | Every live run   |
| Destructive | move, rename, or archive file | Every live run   |

Dry runs never invoke side-effect executors and therefore do not require
approval. They still perform full schema, semantic, registry, and risk checks
and return a stable topological execution plan.

## Execution contract

The engine accepts only registered `(type, version)` executors. Live execution:

1. validates the workflow and bounded execution options;
2. verifies that every executor is registered;
3. checks the mode-scoped idempotency key and approval set;
4. processes nodes in stable topological order;
5. validates each node configuration again at the executor boundary;
6. enforces cancellation, per-step timeout, and bounded retry behavior;
7. emits structured progress and returns structured steps; and
8. records only a successful result for duplicate replay.

The Phase 4 registry is intentionally a deterministic mock. Later phases replace
specific node implementations while retaining this contract and its safety
checks.

## Schema evolution

Existing schema and migration versions are immutable. Breaking DSL changes
require a new `schemaVersion`, conversion logic, compatibility tests, and an
explicit node catalog review. Adding an executor alone does not make a node
valid; its configuration schema and catalog entry must also be reviewed.
