import {
  WorkflowSchema,
  summarizeWorkflowRisks,
  validateWorkflow,
  type Workflow,
  type WorkflowNode,
} from '@ai-workflow-studio/workflow-schema';

export const MOCK_DEVICE_ID = '00000000-0000-4000-8000-000000000501';
export const MOCK_FOLDER_ALIAS_ID = '00000000-0000-4000-8000-000000000502';
export const MOCK_WORKFLOW_ID = '00000000-0000-4000-8000-000000000503';
export const MOCK_VERSION_ID = '00000000-0000-4000-8000-000000000504';

export const NODE_PRESENTATION: Readonly<
  Record<
    WorkflowNode['type'],
    {
      readonly category: { readonly en: string; readonly zhHant: string };
      readonly label: { readonly en: string; readonly zhHant: string };
    }
  >
> = {
  'ai.summarize': {
    category: { en: 'AI', zhHant: 'AI' },
    label: { en: 'Summarize with AI', zhHant: 'AI 智慧摘要' },
  },
  'apps_script.deploy_template': {
    category: { en: 'Apps Script', zhHant: 'Apps Script' },
    label: { en: 'Deploy approved template', zhHant: '部署核准範本' },
  },
  'data.aggregate': {
    category: { en: 'Data transform', zhHant: '資料轉換' },
    label: { en: 'Aggregate data', zhHant: '彙總資料' },
  },
  'data.deduplicate': {
    category: { en: 'Data transform', zhHant: '資料轉換' },
    label: { en: 'Deduplicate data', zhHant: '資料去重' },
  },
  'data.filter': {
    category: { en: 'Data transform', zhHant: '資料轉換' },
    label: { en: 'Filter data', zhHant: '篩選資料' },
  },
  'data.group': {
    category: { en: 'Data transform', zhHant: '資料轉換' },
    label: { en: 'Group data', zhHant: '資料分組' },
  },
  'data.map_columns': {
    category: { en: 'Data transform', zhHant: '資料轉換' },
    label: { en: 'Map columns', zhHant: '欄位對應' },
  },
  'data.sort': {
    category: { en: 'Data transform', zhHant: '資料轉換' },
    label: { en: 'Sort data', zhHant: '資料排序' },
  },
  'data.validate': {
    category: { en: 'Data transform', zhHant: '資料轉換' },
    label: { en: 'Validate data', zhHant: '驗證資料' },
  },
  'excel.create_report': {
    category: { en: 'Excel', zhHant: 'Excel' },
    label: { en: 'Create Excel report', zhHant: '建立 Excel 報表' },
  },
  'excel.merge': {
    category: { en: 'Excel', zhHant: 'Excel' },
    label: { en: 'Merge Excel files', zhHant: '合併 Excel' },
  },
  'excel.read': {
    category: { en: 'Excel', zhHant: 'Excel' },
    label: { en: 'Read Excel', zhHant: '讀取 Excel' },
  },
  'excel.split_by_field': {
    category: { en: 'Excel', zhHant: 'Excel' },
    label: { en: 'Split Excel by field', zhHant: '拆分 Excel' },
  },
  'excel.write': {
    category: { en: 'Excel', zhHant: 'Excel' },
    label: { en: 'Write Excel', zhHant: '寫入 Excel' },
  },
  'folder.archive_file': {
    category: { en: 'Local files', zhHant: '本機檔案' },
    label: { en: 'Archive file', zhHant: '封存檔案' },
  },
  'folder.file_changed': {
    category: { en: 'Trigger', zhHant: '觸發器' },
    label: { en: 'When a file changes', zhHant: '檔案變更時' },
  },
  'folder.file_created': {
    category: { en: 'Trigger', zhHant: '觸發器' },
    label: { en: 'When a file is created', zhHant: '檔案建立時' },
  },
  'folder.list_files': {
    category: { en: 'Local files', zhHant: '本機檔案' },
    label: { en: 'List Excel files', zhHant: '列出 Excel 檔案' },
  },
  'folder.move_file': {
    category: { en: 'Local files', zhHant: '本機檔案' },
    label: { en: 'Move file', zhHant: '移動檔案' },
  },
  'folder.rename_file': {
    category: { en: 'Local files', zhHant: '本機檔案' },
    label: { en: 'Rename file', zhHant: '重新命名檔案' },
  },
  'gmail.read': {
    category: { en: 'Gmail', zhHant: 'Gmail' },
    label: { en: 'Read Gmail messages', zhHant: '讀取 Gmail 郵件' },
  },
  'gmail.send': {
    category: { en: 'Gmail', zhHant: 'Gmail' },
    label: { en: 'Send approved email', zhHant: '寄送核准郵件' },
  },
  'google_forms.read_responses': {
    category: { en: 'Google Forms', zhHant: 'Google 表單' },
    label: { en: 'Read form responses', zhHant: '讀取表單回覆' },
  },
  'google_sheets.append': {
    category: { en: 'Google Sheets', zhHant: 'Google Sheets' },
    label: { en: 'Append spreadsheet data', zhHant: '附加試算表資料' },
  },
  'google_sheets.read': {
    category: { en: 'Google Sheets', zhHant: 'Google Sheets' },
    label: { en: 'Read spreadsheet', zhHant: '讀取試算表' },
  },
  'google_sheets.sync': {
    category: { en: 'Google Sheets', zhHant: 'Google Sheets' },
    label: { en: 'Sync spreadsheet', zhHant: '同步試算表' },
  },
  'google_sheets.update': {
    category: { en: 'Google Sheets', zhHant: 'Google Sheets' },
    label: { en: 'Update spreadsheet', zhHant: '更新試算表' },
  },
  'google_slides.create': {
    category: { en: 'Google Slides', zhHant: 'Google 簡報' },
    label: { en: 'Create professional deck', zhHant: '建立專業簡報' },
  },
  'manual.trigger': {
    category: { en: 'Trigger', zhHant: '觸發器' },
    label: { en: 'Run manually', zhHant: '手動執行' },
  },
  'notification.desktop': {
    category: { en: 'Output', zhHant: '輸出' },
    label: { en: 'Desktop notification', zhHant: '桌面通知' },
  },
  'report.compose': {
    category: { en: 'Report', zhHant: '報告' },
    label: { en: 'Compose auditable report', zhHant: '建立可稽核報告' },
  },
  'schedule.trigger': {
    category: { en: 'Trigger', zhHant: '觸發器' },
    label: { en: 'Scheduled run', zhHant: '排程執行' },
  },
  'webhook.call': {
    category: { en: 'Output', zhHant: '輸出' },
    label: { en: 'Call webhook', zhHant: '呼叫 Webhook' },
  },
};

export const MOCK_WORKFLOW = WorkflowSchema.parse({
  description: '讀取已授權資料夾中的訂單 Excel，依訂單編號去重，再建立新的彙整報表。',
  edges: [
    { from: 'list_order_files', to: 'read_order_files' },
    { from: 'read_order_files', to: 'deduplicate_orders' },
    { from: 'deduplicate_orders', to: 'create_order_report' },
  ],
  executionTarget: {
    deviceId: MOCK_DEVICE_ID,
    type: 'desktop',
  },
  name: '每日訂單彙整',
  nodes: [
    {
      config: {
        folderAliasId: MOCK_FOLDER_ALIAS_ID,
        pattern: '*.xlsx',
      },
      id: 'list_order_files',
      type: 'folder.list_files',
      version: 1,
    },
    {
      config: {
        headerRow: 1,
        maxFileSizeBytes: 50_000_000,
        maxRows: 100_000,
        maxSheets: 20,
        sheetMode: 'all',
      },
      id: 'read_order_files',
      type: 'excel.read',
      version: 1,
    },
    {
      config: {
        keep: 'first',
        keys: ['訂單編號'],
      },
      id: 'deduplicate_orders',
      type: 'data.deduplicate',
      version: 1,
    },
    {
      config: {
        folderAliasId: MOCK_FOLDER_ALIAS_ID,
        outputName: '每日訂單彙整.xlsx',
        overwrite: false,
        reportTitle: '每日訂單彙整',
      },
      id: 'create_order_report',
      type: 'excel.create_report',
      version: 1,
    },
  ],
  schemaVersion: 1,
  trigger: {
    config: {},
    type: 'manual.trigger',
  },
});

export interface MockWorkflowSummary {
  readonly id: string;
  readonly lastRun: string;
  readonly name: string;
  readonly nodeCount: number;
  readonly status: 'active' | 'draft' | 'paused';
  readonly successRate: string;
  readonly target: string;
  readonly updatedAt: string;
}

export const MOCK_WORKFLOW_SUMMARIES: readonly MockWorkflowSummary[] = [
  {
    id: MOCK_WORKFLOW_ID,
    lastRun: '今天 12:18',
    name: MOCK_WORKFLOW.name,
    nodeCount: MOCK_WORKFLOW.nodes.length,
    status: 'draft',
    successRate: '尚未執行',
    target: 'Erin’s MacBook Air',
    updatedAt: '2 分鐘前',
  },
  {
    id: '00000000-0000-4000-8000-000000000505',
    lastRun: '今天 11:45',
    name: '庫存異常檢查',
    nodeCount: 5,
    status: 'active',
    successRate: '99.1%',
    target: 'Erin’s MacBook Air',
    updatedAt: '昨天',
  },
  {
    id: '00000000-0000-4000-8000-000000000506',
    lastRun: '7 月 24 日',
    name: '供應商報表同步',
    nodeCount: 7,
    status: 'paused',
    successRate: '96.4%',
    target: 'Cloud + Desktop',
    updatedAt: '3 天前',
  },
];

export const MOCK_WORKFLOW_VERSIONS = [
  {
    author: 'Erin Wang',
    createdAt: '2026-07-26T12:14:00+08:00',
    id: MOCK_VERSION_ID,
    label: 'v3',
    note: '新增訂單編號去重與輸出檔名保護',
    status: 'current',
  },
  {
    author: 'Erin Wang',
    createdAt: '2026-07-25T16:30:00+08:00',
    id: '00000000-0000-4000-8000-000000000507',
    label: 'v2',
    note: '限制最大列數與工作表數量',
    status: 'archived',
  },
  {
    author: 'Erin Wang',
    createdAt: '2026-07-24T09:05:00+08:00',
    id: '00000000-0000-4000-8000-000000000508',
    label: 'v1',
    note: '由 Mock AI 建立的初始草稿',
    status: 'archived',
  },
] as const;

export function getMockWorkflow(workflowId: string): Workflow | undefined {
  const summary = MOCK_WORKFLOW_SUMMARIES.find((workflow) => workflow.id === workflowId);
  if (summary === undefined) {
    return undefined;
  }
  return WorkflowSchema.parse({
    ...MOCK_WORKFLOW,
    name: summary.name,
  });
}

export function inspectMockWorkflow(workflow: Workflow) {
  return {
    riskSummary: summarizeWorkflowRisks(workflow),
    validation: validateWorkflow(workflow),
  };
}
