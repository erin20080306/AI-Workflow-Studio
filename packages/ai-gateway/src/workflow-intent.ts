import type {
  AIPlannerOutput,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowValidationIssue,
} from '@ai-workflow-studio/workflow-schema';

import type { PlannerRequest } from './types';

const GOOGLE_INTENT =
  /gmail|google\s*(?:drive|forms?|sheets?|slides?)|google\s*(?:雲端硬碟|表單|試算表|簡報)|drive\.google\.com|郵件|電子郵件|信箱/iu;
const GMAIL_INTENT = /gmail|google\s*(?:mail|email)|郵件|電子郵件|信箱/iu;
const FORM_INTENT = /google\s*(?:forms?|表單)|表單回覆|表單訂單/iu;
const SHEETS_INTENT = /google\s*(?:sheets?|試算表)|雲端試算表/iu;
const SUMMARY_INTENT =
  /summar(?:y|ize)|摘要|彙整報告|整理成報告|報告草稿|(?:產生|建立).{0,16}報告/iu;
const SLIDES_INTENT = /google\s*slides?|presentation|簡報|投影片|gas\s*簡報/iu;
const APPS_SCRIPT_INTENT = /apps?\s*script|google\s*apps?\s*script|\bgas\b/iu;
const EMAIL_DELIVERY_INTENT =
  /(?:寄|發送|寄送|send|email).{0,24}(?:email|mail|郵件|電子郵件|信箱|@)/iu;
const EMAIL_NEGATION = /不要寄|不寄|勿寄|do\s+not\s+send|don't\s+send/iu;
const EXCEL_INTENT = /excel|\.xlsx?|活頁簿|試算表檔/iu;
const DRIVE_FOLDER_INTENT =
  /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/[A-Za-z0-9_-]{10,240}|google\s*(?:drive|雲端硬碟).{0,32}(?:folder|資料夾)/iu;
const EXCEL_CONSOLIDATION_INTENT =
  /(?:合併|匯總|彙整|整合|整理).{0,36}(?:excel|\.xlsx?|活頁簿)|(?:excel|\.xlsx?|活頁簿).{0,36}(?:合併|匯總|彙整|整合|整理)|merge|consolidat/iu;

export interface WorkflowIntent {
  readonly needsDesktop: boolean;
  readonly needsGoogleConnection: boolean;
  readonly requiredNodeTypes: readonly WorkflowNodeType[];
}

export function detectWorkflowIntent(prompt: string): WorkflowIntent {
  const required = new Set<WorkflowNodeType>();
  const needsGmail = GMAIL_INTENT.test(prompt);
  const needsForms = FORM_INTENT.test(prompt);
  const needsSheets = SHEETS_INTENT.test(prompt);
  const needsExcel = EXCEL_INTENT.test(prompt);
  const needsDriveExcel = needsExcel && DRIVE_FOLDER_INTENT.test(prompt);
  const needsSummary = SUMMARY_INTENT.test(prompt);
  if (needsGmail) required.add('gmail.read');
  if (needsForms) required.add('google_forms.read_responses');
  if (needsSheets) required.add('google_sheets.read');
  if (needsSummary) {
    if (!needsGmail && !needsForms && !needsSheets && !needsExcel) {
      required.add('data.inline');
    }
    required.add('ai.summarize');
    required.add('report.compose');
  }
  if (SLIDES_INTENT.test(prompt)) required.add('google_slides.create');
  if (APPS_SCRIPT_INTENT.test(prompt)) required.add('apps_script.deploy_template');
  if (EMAIL_DELIVERY_INTENT.test(prompt) && !EMAIL_NEGATION.test(prompt))
    required.add('gmail.send');
  if (needsDriveExcel) {
    required.add('google_drive.read_excel_folder');
    if (EXCEL_CONSOLIDATION_INTENT.test(prompt)) {
      required.add('google_drive.create_excel_report');
    }
  } else if (needsExcel) {
    required.add('excel.read');
  }
  return {
    needsDesktop: needsExcel && !needsDriveExcel,
    needsGoogleConnection: GOOGLE_INTENT.test(prompt),
    requiredNodeTypes: [...required],
  };
}

function trustedReferenceIssues(
  request: PlannerRequest,
  nodes: readonly WorkflowNode[],
): readonly WorkflowValidationIssue[] {
  const allowedFolders = new Set(request.context.allowedFolderAliasIds);
  const allowedConnections = new Set(request.context.googleConnectionIds);
  const issues: WorkflowValidationIssue[] = [];
  for (const node of nodes) {
    const config = node.config as Readonly<Record<string, unknown>>;
    const folderIds = ['folderAliasId', 'archiveFolderAliasId', 'targetFolderAliasId']
      .map((field) => config[field])
      .filter((value): value is string => typeof value === 'string');
    if (folderIds.some((folderId) => !allowedFolders.has(folderId))) {
      issues.push({
        code: 'WORKFLOW_EXECUTION_TARGET_INVALID',
        message: 'The plan referenced a folder that is not in the trusted execution context.',
        nodeId: node.id,
      });
    }
    const connectionId = config.connectionId;
    if (typeof connectionId === 'string' && !allowedConnections.has(connectionId)) {
      issues.push({
        code: 'WORKFLOW_EXECUTION_TARGET_INVALID',
        message: 'The plan referenced a Google connection that is not trusted for this request.',
        nodeId: node.id,
      });
    }
  }
  return issues;
}

export function validateWorkflowIntentCoverage(
  request: PlannerRequest,
  output: AIPlannerOutput,
): readonly WorkflowValidationIssue[] {
  const intent = detectWorkflowIntent(request.prompt);
  const actual = new Set(output.workflow.nodes.map((node) => node.type));
  const issues = intent.requiredNodeTypes
    .filter((type) => !actual.has(type))
    .map((type): WorkflowValidationIssue => ({
      code: 'WORKFLOW_SCHEMA_INVALID',
      message: `The workflow does not cover the requested ${type} capability.`,
      path: 'workflow.nodes',
    }));
  if (
    JSON.stringify(output.workflow.executionTarget) !==
    JSON.stringify(request.context.executionTarget)
  ) {
    issues.push({
      code: 'WORKFLOW_EXECUTION_TARGET_INVALID',
      message: 'The workflow execution target does not match the trusted request context.',
      path: 'workflow.executionTarget',
    });
  }
  issues.push(...trustedReferenceIssues(request, output.workflow.nodes));
  return issues;
}
