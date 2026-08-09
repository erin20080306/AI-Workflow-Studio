import { z } from 'zod';

import { JsonPrimitiveSchema } from './json';

const UuidSchema = z.string().uuid();
const NonEmptyLabelSchema = z.string().trim().min(1).max(200);
const ColumnNameSchema = z.string().trim().min(1).max(200);
const ColumnNamesSchema = z.array(ColumnNameSchema).min(1).max(100);
const SpreadsheetIdSchema = z
  .string()
  .trim()
  .min(10)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/);
const SheetNameSchema = z.string().trim().min(1).max(100);
const GoogleResourceIdSchema = z
  .string()
  .trim()
  .min(10)
  .max(240)
  .regex(/^[A-Za-z0-9_-]+$/);
const EmailAddressSchema = z.string().trim().email().max(254);
const CronSchema = z
  .string()
  .trim()
  .max(120)
  .regex(/^(\S+\s+){4}\S+$/, 'Cron must contain exactly five fields');
const TimezoneSchema = z
  .string()
  .trim()
  .max(100)
  .regex(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/, 'Timezone must be an IANA-style identifier');

const FilePatternSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (pattern) => !pattern.includes('/') && !pattern.includes('\\') && !pattern.includes('..'),
    'File pattern must not contain paths or traversal segments',
  );

const FileNameTemplateSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .refine(
    (template) => !template.includes('/') && !template.includes('\\') && !template.includes('\0'),
    'File name template must not contain path separators',
  );

const ExcelOutputNameSchema = FileNameTemplateSchema.refine(
  (name) => name.toLowerCase().endsWith('.xlsx'),
  'Excel output name must end with .xlsx',
);

const OutputFileConfigSchema = z
  .object({
    folderAliasId: UuidSchema,
    outputName: FileNameTemplateSchema,
    overwrite: z.literal(false).default(false),
  })
  .strict();

const GoogleSheetTargetSchema = z
  .object({
    connectionId: UuidSchema,
    spreadsheetId: SpreadsheetIdSchema,
    sheetName: SheetNameSchema,
  })
  .strict();

const FilterConditionSchema = z
  .object({
    field: ColumnNameSchema,
    operator: z.enum([
      'equals',
      'not_equals',
      'contains',
      'not_contains',
      'greater_than',
      'greater_than_or_equal',
      'less_than',
      'less_than_or_equal',
      'is_empty',
      'is_not_empty',
    ]),
    value: JsonPrimitiveSchema.optional(),
  })
  .strict()
  .superRefine((condition, context) => {
    const unary = condition.operator === 'is_empty' || condition.operator === 'is_not_empty';
    if (!unary && condition.value === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'This filter operator requires a value',
        path: ['value'],
      });
    }
    if (unary && condition.value !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Empty-check operators must not include a value',
        path: ['value'],
      });
    }
  });

const DataTypeSchema = z.enum(['string', 'number', 'boolean', 'date', 'datetime']);

const ValidationRuleSchema = z
  .object({
    field: ColumnNameSchema,
    required: z.boolean().default(false),
    dataType: DataTypeSchema.optional(),
    pattern: z.string().min(1).max(200).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  })
  .strict()
  .refine((rule) => rule.min === undefined || rule.max === undefined || rule.min <= rule.max, {
    message: 'Validation min must be less than or equal to max',
    path: ['min'],
  })
  .refine(
    (rule) => {
      if (rule.pattern === undefined) return true;
      try {
        new RegExp(rule.pattern, 'u');
        return true;
      } catch {
        return false;
      }
    },
    {
      message: 'Validation pattern must be a valid regular expression',
      path: ['pattern'],
    },
  );

const node = <TType extends string, TConfig extends z.ZodType>(type: TType, config: TConfig) =>
  z
    .object({
      config,
      id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
      type: z.literal(type),
      version: z.literal(1),
    })
    .strict();

const EmptyConfigSchema = z.object({}).strict();

export const ManualTriggerNodeSchema = node('manual.trigger', EmptyConfigSchema);
export const ScheduleTriggerNodeSchema = node(
  'schedule.trigger',
  z
    .object({
      cron: CronSchema,
      timezone: TimezoneSchema,
    })
    .strict(),
);
export const FolderFileCreatedNodeSchema = node(
  'folder.file_created',
  z
    .object({
      folderAliasId: UuidSchema,
      pattern: FilePatternSchema.default('*.xlsx'),
    })
    .strict(),
);
export const FolderFileChangedNodeSchema = node(
  'folder.file_changed',
  z
    .object({
      debounceMs: z.number().int().min(250).max(60_000).default(1_000),
      folderAliasId: UuidSchema,
      pattern: FilePatternSchema.default('*.xlsx'),
    })
    .strict(),
);

export const FolderListFilesNodeSchema = node(
  'folder.list_files',
  z
    .object({
      folderAliasId: UuidSchema,
      modifiedSince: z.string().trim().min(1).max(100).optional(),
      pattern: FilePatternSchema.default('*.xlsx'),
    })
    .strict(),
);
export const FolderMoveFileNodeSchema = node(
  'folder.move_file',
  z
    .object({
      conflictStrategy: z.enum(['fail', 'rename']).default('rename'),
      targetFolderAliasId: UuidSchema,
    })
    .strict(),
);
export const FolderRenameFileNodeSchema = node(
  'folder.rename_file',
  z
    .object({
      conflictStrategy: z.enum(['fail', 'rename']).default('rename'),
      targetName: FileNameTemplateSchema,
    })
    .strict(),
);
export const FolderArchiveFileNodeSchema = node(
  'folder.archive_file',
  z
    .object({
      archiveFolderAliasId: UuidSchema,
      conflictStrategy: z.enum(['fail', 'rename']).default('rename'),
    })
    .strict(),
);

export const ExcelReadNodeSchema = node(
  'excel.read',
  z
    .object({
      headerMode: z.enum(['auto', 'fixed']).default('auto'),
      headerRow: z.number().int().min(1).max(100).default(1),
      headerScanRows: z.number().int().min(1).max(100).default(30),
      maxFileSizeBytes: z.number().int().min(1).max(200_000_000).default(50_000_000),
      maxRows: z.number().int().min(1).max(1_000_000).default(100_000),
      maxSheets: z.number().int().min(1).max(200).default(50),
      sheetMode: z.enum(['all', 'named']).default('all'),
      sheetNames: z.array(SheetNameSchema).min(1).max(50).optional(),
    })
    .strict()
    .superRefine((config, context) => {
      if (config.sheetMode === 'named' && !config.sheetNames?.length) {
        context.addIssue({
          code: 'custom',
          message: 'Named sheet mode requires at least one sheet name',
          path: ['sheetNames'],
        });
      }
      if (config.sheetMode === 'all' && config.sheetNames !== undefined) {
        context.addIssue({
          code: 'custom',
          message: 'All sheet mode must not include sheet names',
          path: ['sheetNames'],
        });
      }
    }),
);
export const ExcelMergeNodeSchema = node(
  'excel.merge',
  z
    .object({
      columnMode: z.enum(['strict', 'union']).default('union'),
      includeSourceFile: z.boolean().default(true),
      layout: z.enum(['flatten', 'separate_sheets']).default('flatten'),
    })
    .strict(),
);
export const ExcelWriteNodeSchema = node('excel.write', OutputFileConfigSchema);
export const ExcelCreateReportNodeSchema = node(
  'excel.create_report',
  OutputFileConfigSchema.extend({
    reportTitle: NonEmptyLabelSchema.optional(),
  }).strict(),
);
export const ExcelCombineWorkbooksNodeSchema = node(
  'excel.combine_workbooks',
  z
    .object({
      folderAliasId: UuidSchema,
      maxFiles: z.number().int().min(1).max(500).default(500),
      outputName: FileNameTemplateSchema,
      overwrite: z.literal(false).default(false),
    })
    .strict(),
);
export const ExcelOpenFileNodeSchema = node(
  'excel.open_file',
  z
    .object({
      application: z.literal('excel').default('excel'),
      folderAliasId: UuidSchema,
    })
    .strict(),
);
export const ExcelVisibleReviewNodeSchema = node(
  'excel.visible_review',
  z
    .object({
      actions: z
        .array(z.enum(['autofit_used_range', 'save_workbook', 'verify_active_workbook']))
        .min(1)
        .max(3)
        .default(['autofit_used_range', 'save_workbook', 'verify_active_workbook'])
        .refine(
          (actions) => new Set(actions).size === actions.length,
          'Visible Excel actions must be unique',
        )
        .refine(
          (actions) => actions.at(-1) === 'verify_active_workbook',
          'Visible Excel operation must end by verifying the active workbook',
        ),
      application: z.literal('excel').default('excel'),
      folderAliasId: UuidSchema,
    })
    .strict(),
);
export const ExcelSplitByFieldNodeSchema = node(
  'excel.split_by_field',
  z
    .object({
      field: ColumnNameSchema,
      folderAliasId: UuidSchema,
      outputNameTemplate: FileNameTemplateSchema,
      overwrite: z.literal(false).default(false),
    })
    .strict(),
);

export const DataMapColumnsNodeSchema = node(
  'data.map_columns',
  z
    .object({
      mappings: z
        .record(ColumnNameSchema, ColumnNameSchema)
        .refine(
          (mappings) => Object.keys(mappings).length > 0 && Object.keys(mappings).length <= 200,
          'Column mappings must contain between 1 and 200 entries',
        ),
      preserveUnmapped: z.boolean().default(true),
    })
    .strict(),
);
export const DataFilterNodeSchema = node(
  'data.filter',
  z
    .object({
      conditions: z.array(FilterConditionSchema).min(1).max(100),
      match: z.enum(['all', 'any']).default('all'),
    })
    .strict(),
);
export const DataSortNodeSchema = node(
  'data.sort',
  z
    .object({
      fields: z
        .array(
          z
            .object({
              direction: z.enum(['asc', 'desc']).default('asc'),
              field: ColumnNameSchema,
              nulls: z.enum(['first', 'last']).default('last'),
            })
            .strict(),
        )
        .min(1)
        .max(20),
    })
    .strict(),
);
export const DataGroupNodeSchema = node(
  'data.group',
  z
    .object({
      keys: ColumnNamesSchema,
    })
    .strict(),
);
export const DataAggregateNodeSchema = node(
  'data.aggregate',
  z
    .object({
      groupBy: z.array(ColumnNameSchema).max(20).default([]),
      operations: z
        .array(
          z
            .object({
              alias: ColumnNameSchema,
              field: ColumnNameSchema.optional(),
              operation: z.enum(['count', 'sum', 'average', 'min', 'max']),
            })
            .strict()
            .superRefine((operation, context) => {
              if (operation.operation !== 'count' && operation.field === undefined) {
                context.addIssue({
                  code: 'custom',
                  message: 'This aggregate operation requires a field',
                  path: ['field'],
                });
              }
            }),
        )
        .min(1)
        .max(50),
    })
    .strict(),
);
export const DataDeduplicateNodeSchema = node(
  'data.deduplicate',
  z
    .object({
      keep: z.enum(['first', 'last']).default('first'),
      keys: ColumnNamesSchema,
    })
    .strict(),
);
export const DataValidateNodeSchema = node(
  'data.validate',
  z
    .object({
      onInvalid: z.enum(['fail', 'separate']).default('fail'),
      rules: z.array(ValidationRuleSchema).min(1).max(200),
    })
    .strict(),
);
export const DataInlineNodeSchema = node(
  'data.inline',
  z
    .object({
      content: z.string().trim().min(1).max(20_000),
    })
    .strict(),
);

export const GoogleSheetsReadNodeSchema = node(
  'google_sheets.read',
  GoogleSheetTargetSchema.extend({
    range: z.string().trim().min(1).max(100).optional(),
  }).strict(),
);
export const GoogleSheetsAppendNodeSchema = node(
  'google_sheets.append',
  GoogleSheetTargetSchema.extend({
    includeHeader: z.boolean().default(false),
  }).strict(),
);
export const GoogleSheetsUpdateNodeSchema = node(
  'google_sheets.update',
  GoogleSheetTargetSchema.extend({
    keyColumns: ColumnNamesSchema,
  }).strict(),
);
export const GoogleSheetsSyncNodeSchema = node(
  'google_sheets.sync',
  GoogleSheetTargetSchema.extend({
    conflictStrategy: z.enum(['source_wins', 'destination_wins', 'fail']).default('fail'),
    keyColumns: ColumnNamesSchema,
  }).strict(),
);

export const GoogleDriveReadExcelFolderNodeSchema = node(
  'google_drive.read_excel_folder',
  z
    .object({
      connectionId: UuidSchema,
      folderId: GoogleResourceIdSchema,
      headerScanRows: z.number().int().min(1).max(100).default(30),
      includeSubfolders: z.boolean().default(true),
      maxFileSizeBytes: z.number().int().min(1).max(20_000_000).default(5_000_000),
      maxFiles: z.number().int().min(1).max(500).default(100),
      maxRows: z.number().int().min(1).max(100_000).default(20_000),
      maxSheets: z.number().int().min(1).max(2_000).default(1_000),
    })
    .strict(),
);
export const GoogleDriveDownloadExcelFolderNodeSchema = node(
  'google_drive.download_excel_folder',
  z
    .object({
      connectionId: UuidSchema,
      folderAliasId: UuidSchema,
      folderId: GoogleResourceIdSchema,
      includeSubfolders: z.boolean().default(true),
      maxFileSizeBytes: z.number().int().min(1).max(20_000_000).default(20_000_000),
      maxFiles: z.number().int().min(1).max(500).default(500),
    })
    .strict(),
);
export const GoogleDriveVisibleDownloadFolderNodeSchema = node(
  'google_drive.visible_download_folder',
  z
    .object({
      browser: z.literal('chrome').default('chrome'),
      downloadTimeoutSeconds: z.number().int().min(30).max(600).default(300),
      folderAliasId: UuidSchema,
      folderId: GoogleResourceIdSchema,
      maxFileSizeBytes: z.number().int().min(1).max(200_000_000).default(50_000_000),
      maxFiles: z.number().int().min(1).max(500).default(500),
    })
    .strict(),
);
export const GoogleDriveCreateExcelReportNodeSchema = node(
  'google_drive.create_excel_report',
  z
    .object({
      connectionId: UuidSchema,
      folderId: GoogleResourceIdSchema,
      outputName: ExcelOutputNameSchema,
      overwrite: z.literal(false).default(false),
      reportTitle: NonEmptyLabelSchema.optional(),
    })
    .strict(),
);

export const GmailReadNodeSchema = node(
  'gmail.read',
  z
    .object({
      connectionId: UuidSchema,
      includeBody: z.boolean().default(true),
      maxMessages: z.number().int().min(1).max(200).default(50),
      query: z.string().trim().min(1).max(500).optional(),
      timeRange: z.enum(['today', 'yesterday', 'last_7_days']).default('today'),
    })
    .strict(),
);
export const GoogleFormsReadResponsesNodeSchema = node(
  'google_forms.read_responses',
  z
    .object({
      connectionId: UuidSchema,
      formId: GoogleResourceIdSchema,
      maxResponses: z.number().int().min(1).max(5_000).default(1_000),
      since: z.string().datetime({ offset: true }).optional(),
    })
    .strict(),
);
export const AiSummarizeNodeSchema = node(
  'ai.summarize',
  z
    .object({
      includeCaseStudy: z.boolean().default(false),
      includeRecommendations: z.boolean().default(true),
      language: z.enum(['en', 'zh-Hant']).default('zh-Hant'),
      maxCharacters: z.number().int().min(500).max(20_000).default(6_000),
      provider: z.enum(['anthropic', 'auto', 'gemini', 'mock', 'openai']).default('auto'),
      style: z.enum(['brief', 'executive', 'professional']).default('professional'),
      tier: z.enum(['advanced', 'auto', 'economy', 'flagship', 'standard']).default('auto'),
    })
    .strict(),
);
export const ReportComposeNodeSchema = node(
  'report.compose',
  z
    .object({
      format: z.enum(['html', 'markdown']).default('markdown'),
      includeReferences: z.boolean().default(true),
      title: NonEmptyLabelSchema,
    })
    .strict(),
);
export const GoogleSlidesCreateNodeSchema = node(
  'google_slides.create',
  z
    .object({
      connectionId: UuidSchema,
      folderId: GoogleResourceIdSchema.optional(),
      includeImages: z.boolean().default(true),
      includeReferences: z.boolean().default(true),
      maxSlides: z.number().int().min(3).max(30).default(10),
      title: NonEmptyLabelSchema,
    })
    .strict(),
);
export const GmailSendNodeSchema = node(
  'gmail.send',
  z
    .object({
      connectionId: UuidSchema,
      recipients: z.array(EmailAddressSchema).min(1).max(20),
      sendMode: z.enum(['draft', 'send']).default('draft'),
      subject: z.string().trim().min(1).max(200),
    })
    .strict(),
);
export const AppsScriptDeployTemplateNodeSchema = node(
  'apps_script.deploy_template',
  z
    .object({
      connectionId: UuidSchema,
      deployment: z.enum(['api_executable', 'manual', 'web_app']).default('api_executable'),
      template: z.enum(['email-order-summary', 'sheet-cost-summary', 'slides-executive-report']),
      title: NonEmptyLabelSchema,
    })
    .strict(),
);

export const NotificationDesktopNodeSchema = node(
  'notification.desktop',
  z
    .object({
      body: z.string().trim().min(1).max(500),
      title: z.string().trim().min(1).max(120),
    })
    .strict(),
);
export const WebhookCallNodeSchema = node(
  'webhook.call',
  z
    .object({
      connectionId: UuidSchema,
      endpointAlias: z
        .string()
        .trim()
        .min(1)
        .max(120)
        .regex(/^[a-z0-9_-]+$/i),
      payloadFields: z.array(ColumnNameSchema).max(100).default([]),
    })
    .strict(),
);

export const WorkflowNodeSchema = z.discriminatedUnion('type', [
  ManualTriggerNodeSchema,
  ScheduleTriggerNodeSchema,
  FolderFileCreatedNodeSchema,
  FolderFileChangedNodeSchema,
  FolderListFilesNodeSchema,
  FolderMoveFileNodeSchema,
  FolderRenameFileNodeSchema,
  FolderArchiveFileNodeSchema,
  ExcelReadNodeSchema,
  ExcelMergeNodeSchema,
  ExcelWriteNodeSchema,
  ExcelCreateReportNodeSchema,
  ExcelCombineWorkbooksNodeSchema,
  ExcelOpenFileNodeSchema,
  ExcelVisibleReviewNodeSchema,
  ExcelSplitByFieldNodeSchema,
  DataMapColumnsNodeSchema,
  DataFilterNodeSchema,
  DataSortNodeSchema,
  DataGroupNodeSchema,
  DataAggregateNodeSchema,
  DataDeduplicateNodeSchema,
  DataValidateNodeSchema,
  DataInlineNodeSchema,
  GoogleSheetsReadNodeSchema,
  GoogleSheetsAppendNodeSchema,
  GoogleSheetsUpdateNodeSchema,
  GoogleSheetsSyncNodeSchema,
  GoogleDriveReadExcelFolderNodeSchema,
  GoogleDriveDownloadExcelFolderNodeSchema,
  GoogleDriveVisibleDownloadFolderNodeSchema,
  GoogleDriveCreateExcelReportNodeSchema,
  GmailReadNodeSchema,
  GoogleFormsReadResponsesNodeSchema,
  AiSummarizeNodeSchema,
  ReportComposeNodeSchema,
  GoogleSlidesCreateNodeSchema,
  GmailSendNodeSchema,
  AppsScriptDeployTemplateNodeSchema,
  NotificationDesktopNodeSchema,
  WebhookCallNodeSchema,
]);

export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowNodeType = WorkflowNode['type'];
