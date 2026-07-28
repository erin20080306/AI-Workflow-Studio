# User guide

## Current supported experience

The complete local acceptance experience uses synthetic Mock data and does not
require an AI key, Google account, Supabase project, or customer files. The
non-Mock Web includes Supabase registration, confirmation, login, recovery,
logout, and Tenant onboarding, but those flows require a configured staging or
production Supabase project. A hosted Web/Auth boundary exists, but the newest
phase changes are not automatically deployed. The Web intentionally provides no
separate card checkout, and no Microsoft Store publication is represented as
complete.

## Review usage and plan allowance

1. Open **用量 / Usage** in the authenticated workspace.
2. Review the current plan, remaining internal AI cost allowance, monthly
   text-source bytes, tool calls, and request-rate limit.
3. Treat the 80% warning as an early signal and the 95% warning as a required
   review point. New metered operations stop at the 100% ceiling.
4. Paid plans are purchased through Microsoft Store only. The Web does not ask
   for card details or AI provider keys.

The cost values are conservative internal safety estimates, not provider
invoices. An individual text source remains limited to 1 MiB even when the
monthly plan allowance is larger.

## Create and publish a website

1. Open **網站工作室 / Website Studio** in the authenticated workspace.
2. Describe the desired website in one or more sentences, choose an entitled
   model/tier when needed, and ask AI to begin.
3. Answer the bounded follow-up questions. Use **進階六步驟需求設定** when you
   want to inspect or override purpose, audience, pages, brand, content, and
   calls to action manually.
4. Create the Canvas after all six decisions validate. Review desktop, tablet,
   and mobile views.
5. Modify the site with a natural-language request or the direct visual/version
   controls. Each successful change creates a restorable immutable version.
6. Open **檢查並發布**, verify the exact Canvas version, check the confirmation,
   and publish. AI cannot perform this confirmation for you.
7. Open the generated `/s/{siteSlug}` link to see the active public release.
   Publishing a later version keeps the same public URL and preserves the old
   release as superseded history.

Ordinary users never enter AI provider API keys. Published sites currently use
the platform host; customer custom-domain and rollback controls are follow-on
hosting work.

## Create and review a workflow

1. Open the Web application and choose **開始使用 / Get started**.
2. Enter the Mock workspace.
3. Open **工作流程 / Workflows**, then create a workflow.
4. Describe the desired result in plain language. Include the trigger, approved
   folder alias, transformation, and output.
5. Generate the plan with Mock Planner.
6. Review the diagram, each node, required permissions, data-transfer boundary,
   and risk summary.
7. Run the dry run. A dry run validates and previews; it does not write a file.
8. Save the validated draft.

AI output is never executed directly. Invalid JSON, unknown nodes, path text,
shell commands, source code, arbitrary URLs, and invalid graphs are rejected.

## Pair the Desktop Agent

1. Open **裝置 / Devices** in the Web console and request a pairing code.
2. Open the Desktop Agent and enter the short-lived code.
3. Confirm the device appears online.
4. Use the Agent's system picker to authorize a folder and select the minimum
   needed read/write permission.

The browser receives a folder alias and display name, not the raw local path.
Removing or revoking the grant prevents future access.

## Run an approved local workflow

1. Start the workflow from the Web dashboard.
2. Review the write/destructive/external actions.
3. Explicitly approve when required.
4. Leave the paired Agent running. It reconnects and claims the pending Job.
5. Follow redacted step status in **執行紀錄 / Runs**.
6. Verify the new report in the approved local folder.

Normal report workflows create a new file and do not overwrite the source.
Receipts and content hashes prevent the same input from being processed again
after a restart or lease reclaim.

## Cancel, retry, and revoke

- Cancellation requires confirmation and is observed by the Agent at its next
  lease check.
- Retry is bounded and reuses idempotency protection.
- Revoking a device invalidates its token and active authorization.
- Revoking Google clears locally stored token ciphertext even if the remote
  revoke endpoint is unavailable.

## Privacy expectations

Complete local spreadsheet content is not required in the cloud. The control
plane receives identifiers, status, timings, counts, bounded error codes, and
approved metadata. Do not put credentials, raw local paths, or confidential row
values into workflow descriptions or support requests.
