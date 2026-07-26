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
  });

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
      headerRow: z.number().int().min(1).max(100).default(1),
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
  ExcelSplitByFieldNodeSchema,
  DataMapColumnsNodeSchema,
  DataFilterNodeSchema,
  DataSortNodeSchema,
  DataGroupNodeSchema,
  DataAggregateNodeSchema,
  DataDeduplicateNodeSchema,
  DataValidateNodeSchema,
  GoogleSheetsReadNodeSchema,
  GoogleSheetsAppendNodeSchema,
  GoogleSheetsUpdateNodeSchema,
  GoogleSheetsSyncNodeSchema,
  NotificationDesktopNodeSchema,
  WebhookCallNodeSchema,
]);

export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowNodeType = WorkflowNode['type'];
