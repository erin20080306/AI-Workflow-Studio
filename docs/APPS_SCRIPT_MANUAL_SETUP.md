# Manual Apps Script Setup Mode

## Why

The `apps_script.deploy_template` node's `api_executable` deployment calls the
Apps Script API to create, version, and deploy a script project. That path fails
(`GOOGLE_REQUEST_FAILED`) when the **Apps Script API is not enabled** in the
user's Google Cloud project, or the connection lacks the script-management
scope — a setup step most users have not done.

The `manual` deployment mode avoids the API entirely: the node emits the
approved template source, the required OAuth scopes, and step-by-step
instructions so the customer installs the script themselves at
script.google.com. It performs **no external call**, so it cannot fail.

## How it works

- **Schema** (`packages/workflow-schema/src/node-configs.ts`):
  `apps_script.deploy_template` `deployment` enum is `api_executable | manual |
web_app`.
- **Planner** (`packages/ai-gateway/src/prompts.ts`): the grounded Drive-Excel
  plan now defaults GAS to `deployment: 'manual'`.
- **Executor** (`apps/web/src/lib/cloud-workflow-executor.ts`): when
  `deployment === 'manual'`, it returns `buildAppsScriptManualSetup(...)` instead
  of calling the deploy path.
- **Builder** (`apps/web/src/lib/cloud-workflow-output.ts`):
  `buildAppsScriptManualSetup(template, title, locale)` returns
  `{ kind: 'apps_script_manual', template, title, files: [{ name, source }],
requiredScopes, steps }`. The template source and scopes come from the
  existing, exported `safeScriptTemplate` — only the reviewed templates
  (`email-order-summary`, `sheet-cost-summary`, `slides-executive-report`) are
  available; no model-produced code is ever emitted.
- **Run view** (`packages/run-orchestrator/src/schemas.ts` + `types.ts`): the
  `apps_script_manual` result kind is validated on the run step.
- **UI** (`apps/web/src/components/runs/run-details-panel.tsx`): a titled card
  renders the numbered steps, the required scopes, and each file
  (`appsscript.json` + `*.gs`) in a copy-to-clipboard code block. Bilingual
  (zh-Hant / en).

## Customer flow (what the card tells them)

1. Open https://script.google.com and click "New project".
2. Delete the default `Code.gs` contents and paste the provided `.gs` code.
3. Project Settings → enable "Show appsscript.json manifest file in editor".
4. Open `appsscript.json` and paste the provided manifest (it lists the scopes).
5. Save, choose the function to run, click Run, and approve the one-time
   authorization.

## Switching a plan back to API deployment

Set the node config `deployment: 'api_executable'` (requires the Apps Script API
enabled in the Google Cloud project and the script-management scope). `web_app`
remains unsupported and is rejected.

## Tests

- `apps/web/src/lib/cloud-workflow-executor.test.ts` — asserts the manual output
  carries the manifest, a `.gs` file with the template function, the scopes, and
  the steps.
- `packages/ai-gateway/src/prompts.test.ts` — asserts the grounded plan emits
  `deployment: 'manual'`.
