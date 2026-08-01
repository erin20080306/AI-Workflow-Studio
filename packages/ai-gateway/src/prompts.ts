import {
  AIPlannerOutputSchema,
  NODE_CATALOG,
  type AIPlannerOutput,
  type WorkflowValidationIssue,
} from '@ai-workflow-studio/workflow-schema';

import type { PlannerRequest } from './types';
import { detectWorkflowIntent } from './workflow-intent';

const ALLOWED_NODE_TYPES = NODE_CATALOG.map((node) => node.type).join(', ');

const EMAIL_ADDRESS_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;
const FORM_ID_PATTERN = /forms\/d\/(?:e\/)?([A-Za-z0-9_-]{10,240})/iu;
const SHEET_ID_PATTERN = /spreadsheets\/d\/([A-Za-z0-9_-]{10,200})/iu;
const SHEET_RANGE_PATTERN = /\b([A-Z]{1,3}\d{1,7}:[A-Z]{1,3}\d{1,7})\b/u;

function firstMatch(prompt: string, pattern: RegExp): string | undefined {
  return pattern.exec(prompt)?.[1];
}

function requestedSlideCount(prompt: string): number {
  const requested = /(?:建立|產生|create)?\s*(\d{1,2})\s*(?:頁|張|slides?)/iu.exec(prompt)?.[1];
  const count = requested === undefined ? 10 : Number(requested);
  return Math.min(30, Math.max(3, count));
}

function requestedSheetName(prompt: string): string | undefined {
  return (
    /(?:工作表名稱|sheet\s*name)\s*[:：]?\s*[「"']?([^\s」"',，。]{1,100})/iu.exec(prompt)?.[1] ??
    /的\s*[「"']([^」"']{1,100})[」"']/u.exec(prompt)?.[1]
  );
}

function buildConnectedGoogleExample(request: PlannerRequest): AIPlannerOutput | undefined {
  const intent = detectWorkflowIntent(request.prompt);
  const required = new Set(intent.requiredNodeTypes);
  const connectionId = request.context.googleConnectionIds[0];
  if (connectionId === undefined || !intent.needsGoogleConnection) return undefined;

  const nodes: unknown[] = [];
  const edges: { from: string; to: string }[] = [];
  const sourceIds: string[] = [];
  if (required.has('gmail.read')) {
    nodes.push({
      config: {
        connectionId,
        includeBody: true,
        maxMessages: 50,
        timeRange: /昨天|yesterday/iu.test(request.prompt)
          ? 'yesterday'
          : /近\s*7\s*天|last\s*7\s*days/iu.test(request.prompt)
            ? 'last_7_days'
            : 'today',
      },
      id: 'read_gmail',
      type: 'gmail.read',
      version: 1,
    });
    sourceIds.push('read_gmail');
  }

  if (required.has('google_sheets.read')) {
    const spreadsheetId = firstMatch(request.prompt, SHEET_ID_PATTERN);
    const sheetName = requestedSheetName(request.prompt);
    if (spreadsheetId === undefined || sheetName === undefined) return undefined;
    const range = firstMatch(request.prompt, SHEET_RANGE_PATTERN);
    nodes.push({
      config: {
        connectionId,
        ...(range === undefined ? {} : { range: `'${sheetName.replaceAll("'", "''")}'!${range}` }),
        sheetName,
        spreadsheetId,
      },
      id: 'read_sheet',
      type: 'google_sheets.read',
      version: 1,
    });
    sourceIds.push('read_sheet');
  }

  if (required.has('google_forms.read_responses')) {
    const formId = firstMatch(request.prompt, FORM_ID_PATTERN);
    if (formId === undefined) return undefined;
    nodes.push({
      config: { connectionId, formId, maxResponses: 1_000 },
      id: 'read_form_responses',
      type: 'google_forms.read_responses',
      version: 1,
    });
    sourceIds.push('read_form_responses');
  }

  let lastOutputIds = [...sourceIds];
  if (required.has('ai.summarize')) {
    nodes.push({
      config: {
        includeCaseStudy: false,
        includeRecommendations: true,
        language: request.context.locale === 'en' ? 'en' : 'zh-Hant',
        maxCharacters: 6_000,
        provider: 'auto',
        style: 'professional',
        tier: 'auto',
      },
      id: 'summarize_sources',
      type: 'ai.summarize',
      version: 1,
    });
    for (const sourceId of sourceIds) edges.push({ from: sourceId, to: 'summarize_sources' });
    lastOutputIds = ['summarize_sources'];
  }

  if (required.has('report.compose')) {
    nodes.push({
      config: {
        format: 'markdown',
        includeReferences: true,
        title: request.context.locale === 'en' ? 'AI business report' : 'AI 專業摘要報告',
      },
      id: 'compose_report',
      type: 'report.compose',
      version: 1,
    });
    for (const outputId of lastOutputIds) edges.push({ from: outputId, to: 'compose_report' });
    lastOutputIds = ['compose_report'];
  }

  const terminalSource = lastOutputIds[0];
  if (required.has('google_slides.create')) {
    nodes.push({
      config: {
        connectionId,
        includeImages: true,
        includeReferences: true,
        maxSlides: requestedSlideCount(request.prompt),
        title: request.context.locale === 'en' ? 'AI executive presentation' : 'AI 專業摘要簡報',
      },
      id: 'create_slides',
      type: 'google_slides.create',
      version: 1,
    });
    if (terminalSource !== undefined) edges.push({ from: terminalSource, to: 'create_slides' });
  }

  const recipient = EMAIL_ADDRESS_PATTERN.exec(request.prompt)?.[0];
  const wantsDraft = /草稿|draft/iu.test(request.prompt);
  if ((required.has('gmail.send') || wantsDraft) && recipient !== undefined) {
    nodes.push({
      config: {
        connectionId,
        recipients: [recipient],
        sendMode: wantsDraft ? 'draft' : 'send',
        subject: request.context.locale === 'en' ? 'AI business report' : 'AI 專業摘要報告',
      },
      id: 'deliver_report',
      type: 'gmail.send',
      version: 1,
    });
    if (terminalSource !== undefined) edges.push({ from: terminalSource, to: 'deliver_report' });
  }

  if (nodes.length === 0 || sourceIds.length === 0) return undefined;
  return AIPlannerOutputSchema.parse({
    assumptions: [
      'The first approved Google Workspace connection is used for this bounded cloud workflow.',
      'Email delivery is created as a draft unless the requirement explicitly asks to send it.',
      'All generated artifacts remain reviewable and auditable before external use.',
    ],
    explanation:
      'Create a complete connected Google Workspace flow from the approved source through AI summary, report, presentation, and reviewable delivery where requested.',
    mappingProposals: [],
    workflow: {
      description:
        'Read an approved Google Workspace source and create the requested reviewable AI artifacts.',
      edges,
      executionTarget: request.context.executionTarget,
      name:
        request.context.locale === 'en'
          ? 'Google Workspace AI report'
          : 'Google Workspace AI 摘要報告',
      nodes,
      schemaVersion: 1,
      trigger: { config: {}, type: 'manual.trigger' },
    },
  });
}

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
- Cover every explicit source, transformation, output, and delivery step in the requirement. A validation-only draft is not sufficient when the requirement asks for Gmail, Google Sheets, Google Forms, a report, a presentation, or email delivery.
- Gmail, Google Sheets, Google Forms, Google Slides, and Apps Script nodes must use a connectionId from googleConnectionIds. Never invent one.
- For Gmail summaries use gmail.read → ai.summarize → report.compose. For Google Forms or Sheets summaries, read the selected source before summarizing. Add google_slides.create only when a presentation is requested. Add gmail.send only when an email recipient is explicitly supplied; default its sendMode to draft unless the user explicitly requests sending.
- Apps Script may use only the registered apps_script.deploy_template templates. Never produce script source code in a workflow plan.

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

export function buildPlannerShapeExample(request: PlannerRequest): AIPlannerOutput {
  const intent = detectWorkflowIntent(request.prompt);
  const googleExample = buildConnectedGoogleExample(request);
  if (googleExample !== undefined) return googleExample;
  if (
    request.context.executionTarget.type === 'cloud' &&
    intent.requiredNodeTypes.includes('data.inline') &&
    intent.requiredNodeTypes.includes('ai.summarize') &&
    intent.requiredNodeTypes.includes('report.compose')
  ) {
    return AIPlannerOutputSchema.parse({
      assumptions: [
        'The user-provided text is the approved bounded source for this cloud workflow.',
        'The report is created as a reviewable artifact and is not emailed automatically.',
      ],
      explanation:
        'Use the approved text as the source, create a professional AI summary, then compose a reviewable Markdown report.',
      mappingProposals: [],
      workflow: {
        description:
          'Process approved text through an AI business summary and a reviewable report artifact.',
        edges: [
          { from: 'approved_source', to: 'summarize_source' },
          { from: 'summarize_source', to: 'compose_report' },
        ],
        executionTarget: request.context.executionTarget,
        name: 'AI 摘要與報告',
        nodes: [
          {
            config: { content: request.prompt },
            id: 'approved_source',
            type: 'data.inline',
            version: 1,
          },
          {
            config: {
              includeCaseStudy: false,
              includeRecommendations: true,
              language: request.context.locale === 'en' ? 'en' : 'zh-Hant',
              maxCharacters: 6_000,
              provider: 'auto',
              style: 'professional',
              tier: 'auto',
            },
            id: 'summarize_source',
            type: 'ai.summarize',
            version: 1,
          },
          {
            config: {
              format: 'markdown',
              includeReferences: false,
              title: request.context.locale === 'en' ? 'AI business report' : 'AI 營運摘要報告',
            },
            id: 'compose_report',
            type: 'report.compose',
            version: 1,
          },
        ],
        schemaVersion: 1,
        trigger: { config: {}, type: 'manual.trigger' },
      },
    });
  }
  return AIPlannerOutputSchema.parse({
    assumptions: [
      'This shape example uses a manual trigger and a read-only validation node.',
      'Replace its business labels and rules only when the trusted context supports the request.',
    ],
    explanation:
      'Create a disabled, read-only draft that validates a bounded input before any approved execution.',
    mappingProposals: [],
    workflow: {
      description: 'Validate an approved input with bounded, deterministic rules.',
      edges: [],
      executionTarget: request.context.executionTarget,
      name: 'Safe input validation draft',
      nodes: [
        {
          config: {
            onInvalid: 'separate',
            rules: [{ dataType: 'string', field: 'id', required: true }],
          },
          id: 'validate_input',
          type: 'data.validate',
          version: 1,
        },
      ],
      schemaVersion: 1,
      trigger: { config: {}, type: 'manual.trigger' },
    },
  });
}

export function buildPlannerSafeFallback(
  request: PlannerRequest,
  issues: readonly WorkflowValidationIssue[],
): AIPlannerOutput {
  const example = buildPlannerShapeExample(request);
  const validationClasses = [...new Set(issues.map((issue) => issue.code))].sort();
  return AIPlannerOutputSchema.parse({
    ...example,
    assumptions: [
      'The provider response required server-side normalization before it could be released.',
      'This conservative draft stays read-only and does not execute or access an unapproved integration.',
      ...(validationClasses.length === 0
        ? []
        : [`Rejected provider validation classes: ${validationClasses.join(', ')}.`]),
    ],
    explanation: example.workflow.nodes.some((node) => node.type === 'data.inline')
      ? 'A complete, validated cloud flow was created from the approved text: source, AI summary, and auditable report.'
      : 'A safe, disabled validation draft was created automatically. Connect an approved source or Desktop Agent before extending it with file access or execution.',
  });
}

export function buildPlannerUserPrompt(
  request: PlannerRequest,
  issues: readonly WorkflowValidationIssue[] = [],
): string {
  const context = {
    allowedFolderAliasIds: request.context.allowedFolderAliasIds,
    executionTarget: request.context.executionTarget,
    googleConnectionIds: request.context.googleConnectionIds,
    locale: request.context.locale,
    timezone: request.context.timezone,
  };
  return `User requirement:
${request.prompt}

Trusted execution context:
${JSON.stringify(context)}

Use only IDs present in the trusted execution context. Do not invent credentials, connection IDs, device IDs, or folder aliases.
If the requirement is brief, infer safe defaults and record them in assumptions. Produce the most useful valid draft supported by this context instead of asking the user to assemble workflow nodes.

Canonical valid shape example for this exact requirement:
${JSON.stringify(buildPlannerShapeExample(request))}

Keep the exact envelope, node fields, config field names, and executionTarget shape demonstrated above. Adapt the nodes only when their required trusted IDs are available; otherwise return a useful read-only data validation draft and explain the unavailable integration in assumptions.${repairFeedback(issues)}`;
}
