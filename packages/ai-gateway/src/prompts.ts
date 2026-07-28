import { NODE_CATALOG, type WorkflowValidationIssue } from '@ai-workflow-studio/workflow-schema';

import type { PlannerRequest } from './types';

const ALLOWED_NODE_TYPES = NODE_CATALOG.map((node) => node.type).join(', ');

export const PLANNER_SYSTEM_PROMPT = `Role: Convert a user's automation requirement into one safe Workflow v1 JSON plan.

Goal: Return exactly one JSON object with assumptions, explanation, mappingProposals, and workflow.

Safety invariants:
- Use only these registered node types: ${ALLOWED_NODE_TYPES}.
- Never output source code, shell commands, scripts, credentials, raw local paths, or arbitrary URLs.
- Local files must be referenced only by an allowed folderAliasId.
- Webhooks must use a connectionId and endpointAlias, never a URL.
- Preserve schemaVersion 1 and produce an acyclic connected graph.
- A write, external, or destructive node remains subject to application approval; do not claim it is approved.
- Do not wrap JSON in Markdown or add prose outside the JSON object.

Planning behavior:
- Treat even a short user phrase as a complete planning request.
- Infer a manual trigger unless the user explicitly requests a valid schedule or trusted folder trigger.
- Fill in conservative, bounded defaults and list every inference in assumptions.
- Prefer read-only nodes when the requested action is ambiguous.
- Use only the supplied execution target and trusted IDs. When a requested integration is unavailable, create the safest useful draft supported by the trusted context and explain the limitation in assumptions.
- Never ask the user to assemble nodes manually.

Success means the JSON is structurally valid, semantically valid, bounded, and directly explains its assumptions.`;

function repairFeedback(issues: readonly WorkflowValidationIssue[]): string {
  if (issues.length === 0) {
    return '';
  }
  const lines = issues
    .slice(0, 20)
    .map((issue) => `- ${issue.code}${issue.path ? ` at ${issue.path}` : ''}`)
    .join('\n');
  return `\n\nThe previous output was rejected. Return a complete replacement JSON object that fixes only these validation classes:\n${lines}`;
}

export function buildPlannerUserPrompt(
  request: PlannerRequest,
  issues: readonly WorkflowValidationIssue[] = [],
): string {
  const context = {
    allowedFolderAliasIds: request.context.allowedFolderAliasIds,
    executionTarget: request.context.executionTarget,
    locale: request.context.locale,
    timezone: request.context.timezone,
  };
  return `User requirement:
${request.prompt}

Trusted execution context:
${JSON.stringify(context)}

Use only IDs present in the trusted execution context. Do not invent credentials, connection IDs, device IDs, or folder aliases.
If the requirement is brief, infer safe defaults and record them in assumptions. Produce the most useful valid draft supported by this context instead of asking the user to assemble workflow nodes.${repairFeedback(issues)}`;
}
