import {
  AIPlannerOutputSchema,
  NODE_CATALOG,
  type AIPlannerOutput,
  type WorkflowNodeType,
  type WorkflowValidationIssue,
} from '@ai-workflow-studio/workflow-schema';

import type { PlannerRequest } from './types';
import { detectWorkflowIntent, requestsVisibleDriveOperation } from './workflow-intent';

const ALLOWED_NODE_TYPES = NODE_CATALOG.map((node) => node.type).join(', ');

const EMAIL_ADDRESS_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;
const FORM_ID_PATTERN = /forms\/d\/(?:e\/)?([A-Za-z0-9_-]{10,240})/iu;
const SHEET_ID_PATTERN = /spreadsheets\/d\/([A-Za-z0-9_-]{10,200})/iu;
const DRIVE_FOLDER_ID_PATTERN =
  /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,240})/iu;
const SHEET_RANGE_PATTERN = /\b([A-Z]{1,3}\d{1,7}:[A-Z]{1,3}\d{1,7})\b/u;
const DRIVE_SUBFOLDER_TRAVERSAL_INTENT =
  /\brecursive(?:ly)?\b|\b(?:include|including|scan|search|read|process|traverse)(?:\s+(?:through|all|the))*\s+(?:subfolders?|subdirectories|nested\s+folders?|child\s+folders?)\b|(?:遞迴|递归)(?:搜尋|搜索|掃描|扫描|讀取|读取|處理|处理|遍歷|遍历)?|(?:包含|包括|含|連同|连同|一併|一并|遍歷|遍历|掃描|扫描|搜尋|搜索|讀取|读取|處理|处理)(?:所有|全部)?(?:的)?(?:子資料夾|子文件夾|子文件夹|子目錄|子目录|下層資料夾|下层文件夹)|(?:所有|全部)(?:的)?(?:子資料夾|子文件夾|子文件夹|子目錄|子目录|下層資料夾|下层文件夹)/iu;
const DRIVE_SUBFOLDER_TRAVERSAL_NEGATION =
  /(?:不要|不需(?:要)?|無需|无需|勿|排除|略過|跳過|跳过|不包含|不包括|不含)[^，。,.]{0,16}(?:遞迴|递归|子資料夾|子文件夾|子文件夹|子目錄|子目录|下層資料夾|下层文件夹)|(?:不|非)(?:做)?(?:遞迴|递归)|不(?:讀取|读取|掃描|扫描|搜尋|搜索|處理|处理|遍歷|遍历)(?:所有|全部)?(?:的)?(?:子資料夾|子文件夾|子文件夹|子目錄|子目录)|(?:只|僅|仅)(?:處理|处理|讀取|读取|掃描|扫描|搜尋|搜索)?[^，。,.]{0,12}(?:目前|當前|当前|根|頂層|顶层)(?:資料夾|文件夾|文件夹|目錄|目录)|\b(?:do\s+not|don't|without|exclude|skip|no)\b[^,.]{0,24}\b(?:recursive(?:ly)?|subfolders?|subdirectories|nested\s+folders?)\b|\b(?:non[- ]recursive|top[- ]level\s+only|current\s+folder\s+only|root\s+folder\s+only)\b/iu;

function firstMatch(prompt: string, pattern: RegExp): string | undefined {
  return pattern.exec(prompt)?.[1];
}

function requestedDriveSubfolderTraversal(prompt: string): boolean {
  return (
    !DRIVE_SUBFOLDER_TRAVERSAL_NEGATION.test(prompt) &&
    DRIVE_SUBFOLDER_TRAVERSAL_INTENT.test(prompt)
  );
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

function requestedWorkbookNames(prompt: string): readonly string[] {
  return [
    ...new Set(
      [...prompt.matchAll(/[\p{L}\p{N}][\p{L}\p{N}._-]{0,119}\.xlsx/giu)].map((match) => match[0]),
    ),
  ];
}

function requestedSeparateWorkbookSheets(prompt: string): boolean {
  return (
    /(?:一個|一份|同一個|同一份|single|one)\s*(?:excel|活頁簿|工作簿|workbook)?[^。.!?]{0,40}(?:很多|多個|多張|多頁|multiple|several)[^。.!?]{0,20}(?:分頁|工作表|sheet)/iu.test(
      prompt,
    ) ||
    /(?:每個|各個|各自|分別)[^。.!?]{0,30}(?:分頁|工作表|sheet)/iu.test(prompt) ||
    /(?:保留|維持)[^。.!?]{0,20}(?:原始|各自|獨立)[^。.!?]{0,20}(?:分頁|工作表|sheet)/iu.test(
      prompt,
    )
  );
}

function requestedColumn(prompt: string, suffix: RegExp): string | undefined {
  const match = new RegExp(
    `(?:依|by|按)\\s*[「"']?([\\p{L}\\p{N}][\\p{L}\\p{N} _-]{0,60}?)[」"']?\\s*(?:${suffix.source})`,
    'iu',
  ).exec(prompt);
  return match?.[1]?.trim();
}

function requestedSummedColumn(prompt: string): string | undefined {
  return /(?:加總|sum)\s*[「"']?([\p{L}\p{N}][\p{L}\p{N} _-]{0,60})[」"']?/iu
    .exec(prompt)?.[1]
    ?.trim();
}

function buildConnectedDesktopExample(request: PlannerRequest): AIPlannerOutput | undefined {
  const intent = detectWorkflowIntent(request.prompt);
  const folderAliasId = request.context.allowedFolderAliasIds[0];
  if (!intent.needsDesktop || request.context.executionTarget.type !== 'desktop') return undefined;
  if (folderAliasId === undefined) return undefined;

  const workbookNames = requestedWorkbookNames(request.prompt);
  const inputName = workbookNames[0] ?? '*.xlsx';
  const outputName = workbookNames[1] ?? 'AI-Excel-報表.xlsx';
  const deduplicateKey = requestedColumn(request.prompt, /去除重複|去重|deduplicat(?:e|ion)/iu);
  const groupBy = requestedColumn(request.prompt, /分組|group(?:ed)?/iu);
  const summedColumn = requestedSummedColumn(request.prompt);
  const nodes: unknown[] = [
    {
      config: { folderAliasId, pattern: inputName },
      id: 'list_workbooks',
      type: 'folder.list_files',
      version: 1,
    },
    {
      config: {
        headerMode: 'auto',
        headerRow: 1,
        headerScanRows: 30,
        maxFileSizeBytes: 50_000_000,
        maxRows: 100_000,
        maxSheets: 50,
        sheetMode: 'all',
      },
      id: 'read_workbooks',
      type: 'excel.read',
      version: 1,
    },
  ];
  const edges = [{ from: 'list_workbooks', to: 'read_workbooks' }];
  let previousNodeId = 'read_workbooks';
  if (deduplicateKey !== undefined) {
    nodes.push({
      config: { keep: 'first', keys: [deduplicateKey] },
      id: 'deduplicate_rows',
      type: 'data.deduplicate',
      version: 1,
    });
    edges.push({ from: previousNodeId, to: 'deduplicate_rows' });
    previousNodeId = 'deduplicate_rows';
  }
  if (groupBy !== undefined && summedColumn !== undefined) {
    nodes.push({
      config: {
        groupBy: [groupBy],
        operations: [{ alias: `${summedColumn} Total`, field: summedColumn, operation: 'sum' }],
      },
      id: 'aggregate_rows',
      type: 'data.aggregate',
      version: 1,
    });
    edges.push({ from: previousNodeId, to: 'aggregate_rows' });
    previousNodeId = 'aggregate_rows';
  }
  nodes.push({
    config: {
      folderAliasId,
      outputName,
      overwrite: false,
      reportTitle: request.context.locale === 'en' ? 'AI Excel report' : 'AI Excel 彙整報表',
    },
    id: 'create_excel_report',
    type: 'excel.create_report',
    version: 1,
  });
  edges.push({ from: previousNodeId, to: 'create_excel_report' });

  return AIPlannerOutputSchema.parse({
    assumptions: [
      'Only the first approved folder alias is used; its local path remains on the Desktop Agent.',
      'The source workbook is read with bounded row, sheet, and file-size limits.',
      'The output is a new file and never overwrites an existing workbook.',
    ],
    explanation:
      'Read the approved Excel workbook, apply the requested deterministic transformations, and create a new auditable Excel report through the paired Desktop Agent.',
    mappingProposals: [],
    workflow: {
      description:
        'Process an approved local Excel workbook and create a bounded, non-overwriting summary report.',
      edges,
      executionTarget: request.context.executionTarget,
      name: request.context.locale === 'en' ? 'Local Excel summary' : '本機 Excel 智慧彙整',
      nodes,
      schemaVersion: 1,
      trigger: { config: {}, type: 'manual.trigger' },
    },
  });
}

function buildDesktopDriveExcelOperation(request: PlannerRequest): AIPlannerOutput | undefined {
  const intent = detectWorkflowIntent(request.prompt);
  const requested = new Set(intent.requiredNodeTypes);
  const folderAliasId = request.context.allowedFolderAliasIds[0];
  const connectionId = request.context.googleConnectionIds[0];
  const folderId = firstMatch(request.prompt, DRIVE_FOLDER_ID_PATTERN);
  const supportedRequestedTypes = new Set<WorkflowNodeType>([
    'google_drive.read_excel_folder',
    'google_drive.create_excel_report',
    'ai.summarize',
    'report.compose',
    'google_slides.create',
    'apps_script.deploy_template',
  ]);
  const needsAppsScript = requested.has('apps_script.deploy_template');
  const needsSlides = requested.has('google_slides.create');
  const needsReport = requested.has('report.compose') || needsSlides || needsAppsScript;
  const needsSummary = requested.has('ai.summarize') || needsReport;
  const needsCloudContinuation = needsSummary;
  const useVisibleDrive = requestsVisibleDriveOperation(request.prompt);
  if (
    request.context.executionTarget.type !== 'desktop' ||
    folderAliasId === undefined ||
    folderId === undefined ||
    !requested.has('google_drive.read_excel_folder') ||
    [...requested].some((type) => !supportedRequestedTypes.has(type)) ||
    (!useVisibleDrive && connectionId === undefined) ||
    (needsCloudContinuation && connectionId === undefined)
  ) {
    return undefined;
  }
  const outputName = requestedWorkbookNames(request.prompt).at(-1) ?? 'AI-Excel-本機匯總.xlsx';
  const downloadNode = useVisibleDrive
    ? {
        config: {
          browser: 'chrome' as const,
          downloadTimeoutSeconds: 600,
          folderAliasId,
          folderId,
          maxFileSizeBytes: 50_000_000,
          maxFiles: 500,
        },
        id: 'download_drive_workbooks',
        type: 'google_drive.visible_download_folder' as const,
        version: 1,
      }
    : {
        config: {
          connectionId,
          folderAliasId,
          folderId,
          includeSubfolders: requestedDriveSubfolderTraversal(request.prompt),
          maxFileSizeBytes: 20_000_000,
          maxFiles: 500,
        },
        id: 'download_drive_workbooks',
        type: 'google_drive.download_excel_folder' as const,
        version: 1,
      };
  const nodes: unknown[] = [
    downloadNode,
    {
      config: {
        headerMode: 'auto',
        headerRow: 1,
        headerScanRows: 30,
        maxFileSizeBytes: 20_000_000,
        maxRows: 100_000,
        maxSheets: 200,
        sheetMode: 'all',
      },
      id: 'read_local_workbooks',
      type: 'excel.read',
      version: 1,
    },
    {
      config: {
        columnMode: 'union',
        includeSourceFile: true,
        layout: requestedSeparateWorkbookSheets(request.prompt) ? 'separate_sheets' : 'flatten',
      },
      id: 'merge_local_workbooks',
      type: 'excel.merge',
      version: 1,
    },
    {
      config: {
        folderAliasId,
        outputName,
        overwrite: false,
        reportTitle:
          request.context.locale === 'en'
            ? 'AI Workflow Studio Excel consolidation'
            : 'AI Workflow Studio Excel 匯總',
      },
      id: 'create_local_report',
      type: 'excel.create_report',
      version: 1,
    },
    {
      config: {
        actions: ['autofit_used_range', 'save_workbook', 'verify_active_workbook'],
        application: 'excel',
        folderAliasId,
      },
      id: 'open_excel_result',
      type: 'excel.visible_review',
      version: 1,
    },
  ];
  const edges = [
    { from: 'download_drive_workbooks', to: 'read_local_workbooks' },
    { from: 'read_local_workbooks', to: 'merge_local_workbooks' },
    { from: 'merge_local_workbooks', to: 'create_local_report' },
    { from: 'create_local_report', to: 'open_excel_result' },
  ];
  let previousNodeId = 'open_excel_result';
  if (needsSummary) {
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
      id: 'summarize_local_result',
      type: 'ai.summarize',
      version: 1,
    });
    edges.push({ from: previousNodeId, to: 'summarize_local_result' });
    previousNodeId = 'summarize_local_result';
  }
  if (needsReport) {
    nodes.push({
      config: {
        format: 'markdown',
        includeReferences: true,
        title: request.context.locale === 'en' ? 'AI business report' : 'AI 專業摘要報告',
      },
      id: 'compose_local_result_report',
      type: 'report.compose',
      version: 1,
    });
    edges.push({ from: previousNodeId, to: 'compose_local_result_report' });
    previousNodeId = 'compose_local_result_report';
  }
  let presentationNodeId: string | undefined;
  if (needsSlides && connectionId !== undefined) {
    nodes.push({
      config: {
        connectionId,
        folderId,
        includeImages: true,
        includeReferences: true,
        maxSlides: requestedSlideCount(request.prompt),
        title: request.context.locale === 'en' ? 'AI executive presentation' : 'AI 專業摘要簡報',
      },
      id: 'create_result_slides',
      type: 'google_slides.create',
      version: 1,
    });
    edges.push({ from: previousNodeId, to: 'create_result_slides' });
    previousNodeId = 'create_result_slides';
    presentationNodeId = previousNodeId;
  }
  if (needsAppsScript && connectionId !== undefined) {
    nodes.push({
      config: {
        connectionId,
        deployment: 'api_executable',
        template:
          presentationNodeId === undefined ? 'sheet-cost-summary' : 'slides-executive-report',
        title:
          request.context.locale === 'en'
            ? 'AI Workflow Studio approved automation'
            : 'AI Workflow Studio 核准型自動化',
      },
      id: 'deploy_result_apps_script',
      type: 'apps_script.deploy_template',
      version: 1,
    });
    edges.push({ from: previousNodeId, to: 'deploy_result_apps_script' });
  }
  return AIPlannerOutputSchema.parse({
    assumptions: [
      useVisibleDrive
        ? 'Google Drive visibly downloads only supported .xls, .xlsx, or bounded Drive ZIP content into the selected approved Desktop folder.'
        : 'The platform uses the approved Google Drive connection to transfer only supported .xls, .xlsx, or bounded Drive workbook content into the selected approved Desktop workspace; Chrome UI automation is not required.',
      'The paired Desktop Agent performs bounded local consolidation and creates a new workbook without overwriting an existing file.',
      ...(needsCloudContinuation
        ? [
            'Only a bounded path-free statistical profile of the consolidated workbook is relayed to approved cloud report steps; the local workbook and absolute paths remain on the Desktop Agent.',
          ]
        : []),
      `${useVisibleDrive ? 'Visible Drive download, ' : ''}Excel review, Slides creation, and Apps Script deployment remain approval-gated and auditable.`,
    ],
    explanation: needsCloudContinuation
      ? useVisibleDrive
        ? 'Use the explicitly requested visible Drive flow, merge the approved workbooks in the authorized Downloads workspace, create and review a new Excel result, then relay a bounded statistical profile to the platform for the requested AI summary, report, Slides, and approved GAS template.'
        : 'Transfer approved Drive workbooks through the Google Drive connection, merge them in the authorized local workspace, create and review a new Excel result, then relay a bounded statistical profile to the platform for the requested AI summary, report, Slides, and approved GAS template.'
      : useVisibleDrive
        ? 'Use the explicitly requested visible Drive flow to download approved workbooks to the paired computer, read and merge them locally, create a non-overwriting Excel result, and open the finished workbook for visible review.'
        : 'Transfer approved Drive workbooks through the Google Drive connection, read and merge them locally, create a non-overwriting Excel result, and open the finished workbook for visible review.',
    mappingProposals: [],
    workflow: {
      description:
        'Transfer approved Drive workbooks into an authorized local work folder, create an inspectable Excel consolidation, and continue into explicitly approved cloud report artifacts.',
      edges,
      executionTarget: request.context.executionTarget,
      name: request.context.locale === 'en' ? 'Desktop Excel operation' : '本機 Excel 代操作',
      nodes,
      schemaVersion: 1,
      trigger: { config: {}, type: 'manual.trigger' },
    },
  });
}

export function buildPlannerGroundedPlan(request: PlannerRequest): AIPlannerOutput | undefined {
  return (
    buildDesktopDriveExcelOperation(request) ??
    buildConnectedGoogleExample(request) ??
    buildConnectedDesktopExample(request)
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
  let driveFolderId: string | undefined;
  if (required.has('data.inline')) {
    nodes.push({
      config: { content: request.prompt },
      id: 'approved_source',
      type: 'data.inline',
      version: 1,
    });
    sourceIds.push('approved_source');
  }

  if (required.has('google_drive.read_excel_folder')) {
    const folderId = firstMatch(request.prompt, DRIVE_FOLDER_ID_PATTERN);
    if (folderId === undefined) return undefined;
    driveFolderId = folderId;
    nodes.push({
      config: {
        connectionId,
        folderId,
        headerScanRows: 30,
        includeSubfolders: requestedDriveSubfolderTraversal(request.prompt),
        maxFileSizeBytes: 20_000_000,
        maxFiles: 500,
        maxRows: 100_000,
        maxSheets: 1_000,
      },
      id: 'read_drive_excel_folder',
      type: 'google_drive.read_excel_folder',
      version: 1,
    });
    sourceIds.push('read_drive_excel_folder');
    if (required.has('google_drive.create_excel_report')) {
      nodes.push({
        config: {
          connectionId,
          folderId,
          outputName: 'AI-Excel-雲端匯總.xlsx',
          overwrite: false,
          reportTitle:
            request.context.locale === 'en'
              ? 'AI consolidated Excel report'
              : 'AI Excel 雲端匯總報表',
        },
        id: 'create_drive_excel_report',
        type: 'google_drive.create_excel_report',
        version: 1,
      });
      edges.push({ from: 'read_drive_excel_folder', to: 'create_drive_excel_report' });
    }
  }
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
  let presentationNodeId: string | undefined;
  if (required.has('google_slides.create')) {
    nodes.push({
      config: {
        connectionId,
        ...(driveFolderId === undefined ? {} : { folderId: driveFolderId }),
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
    presentationNodeId = 'create_slides';
  }

  if (required.has('apps_script.deploy_template')) {
    nodes.push({
      config: {
        connectionId,
        deployment: 'api_executable',
        template:
          presentationNodeId === undefined ? 'sheet-cost-summary' : 'slides-executive-report',
        title:
          request.context.locale === 'en'
            ? 'AI Workflow Studio approved automation'
            : 'AI Workflow Studio 核准型自動化',
      },
      id: 'deploy_approved_apps_script',
      type: 'apps_script.deploy_template',
      version: 1,
    });
    const scriptSource = presentationNodeId ?? terminalSource;
    if (scriptSource !== undefined) {
      edges.push({ from: scriptSource, to: 'deploy_approved_apps_script' });
    }
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
      executionTarget: { type: 'cloud' },
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
- Google Drive folder Excel requests must use google_drive.read_excel_folder and may create a non-overwriting google_drive.create_excel_report only when consolidation is requested. Set includeSubfolders to false unless the user explicitly requests subfolders, nested folders, or recursive traversal in Traditional Chinese, Simplified Chinese, or English.
- When the trusted execution target is Desktop and an approved folder alias is available, a Drive Excel operation must use google_drive.download_excel_folder → excel.read → excel.merge → excel.create_report → excel.visible_review by default. This uses the approved Google connection for a bounded, claim-bound, auditable transfer and does not depend on Chrome windows or macOS Accessibility. Only when the user explicitly asks for visible Chrome, human-like clicking, or a visible Codex flow may the plan use google_drive.visible_download_folder; that fallback remains approval-gated and requires the paired Agent's Visible Computer Use permission. If the user also requests a summary, report, Slides, or GAS, continue only with ai.summarize → report.compose → google_slides.create → apps_script.deploy_template as requested; the Agent relays a bounded path-free workbook profile and the server executes only those reviewed cloud nodes. This is an operation flow; never add source code nodes.
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
  const desktopDriveExample = buildDesktopDriveExcelOperation(request);
  if (desktopDriveExample !== undefined) return desktopDriveExample;
  const googleExample = buildConnectedGoogleExample(request);
  if (googleExample !== undefined) return googleExample;
  const desktopExample = buildConnectedDesktopExample(request);
  if (desktopExample !== undefined) return desktopExample;
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
  const isDesktopExcelPlan = example.workflow.nodes.some(
    (node) => node.type === 'excel.create_report',
  );
  const isDriveExcelPlan = example.workflow.nodes.some(
    (node) => node.type === 'google_drive.read_excel_folder',
  );
  const validationClasses = [...new Set(issues.map((issue) => issue.code))].sort();
  return AIPlannerOutputSchema.parse({
    ...example,
    assumptions: [
      'The provider response required server-side normalization before it could be released.',
      isDesktopExcelPlan
        ? 'The normalized Excel plan uses only the paired device and approved folder alias from the trusted request context.'
        : isDriveExcelPlan
          ? 'The normalized cloud Excel plan uses only the approved Google connection and bounded Drive folder resource from the trusted request.'
          : 'This conservative draft stays read-only and does not execute or access an unapproved integration.',
      ...(validationClasses.length === 0
        ? []
        : [`Rejected provider validation classes: ${validationClasses.join(', ')}.`]),
    ],
    explanation: isDesktopExcelPlan
      ? 'A complete, validated Desktop Agent flow was created from the approved folder alias: bounded Excel read, deterministic transformations, and a non-overwriting report.'
      : isDriveExcelPlan
        ? 'A complete, validated cloud flow was created: bounded Drive Excel consolidation, non-overwriting Excel report, AI report, Slides, and an allowlisted approval-gated Apps Script where requested.'
        : example.workflow.nodes.some((node) => node.type === 'data.inline')
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
