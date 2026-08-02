import type { AgentJob, JsonValue, StepResult } from '@ai-workflow-studio/agent-protocol';
import { LocalExecutorError, type SpreadsheetTable } from '@ai-workflow-studio/local-executor';
import {
  NodeRegistry,
  WorkflowEngine,
  WorkflowEngineError,
  type RegisteredWorkflowNodeExecutor,
  type WorkflowExecutionContext,
} from '@ai-workflow-studio/workflow-engine';
import {
  JsonValueSchema,
  NODE_CATALOG_BY_TYPE,
  WorkflowNodeSchema,
  type RiskLevel,
} from '@ai-workflow-studio/workflow-schema';
import { z } from 'zod';

import type { AgentJobReporter } from './agent-client';
import {
  ComputerUseError,
  DesktopComputerUseController,
  type VisibleExcelAction,
} from './computer-use';
import { FolderAuthorizationError } from './folder-grants';
import { DesktopSpreadsheetExecutor } from './local-executor';

const CellSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
const TableSchema = z
  .object({
    columns: z.array(z.string().max(200)).max(5_000),
    headerRow: z.number().int().min(1).max(100).optional(),
    name: z.string().min(1).max(200),
    rows: z.array(z.record(z.string(), CellSchema)).max(1_000_000),
  })
  .strict()
  .transform((table): SpreadsheetTable => ({
    columns: table.columns,
    ...(table.headerRow === undefined ? {} : { headerRow: table.headerRow }),
    name: table.name,
    rows: table.rows,
  }));
const EnvelopeSchema = z
  .object({
    folderAliasId: z.string().uuid().optional(),
    inputHashes: z
      .array(z.string().regex(/^[a-f0-9]{64}$/))
      .max(1_000)
      .default([]),
    paths: z
      .array(z.string().min(1).max(1_024).refine(isSafeRelativeEnvelopePath))
      .max(1_000)
      .default([]),
    tables: z.array(TableSchema).max(2_000).default([]),
    write: z
      .object({
        backupCreated: z.boolean().optional(),
        duplicate: z.boolean(),
        fileHash: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        fileSizeBytes: z.number().int().min(0).optional(),
        processedRowCount: z.number().int().min(0).optional(),
        sheetCount: z.number().int().min(0).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

type DesktopEnvelope = z.infer<typeof EnvelopeSchema>;

const SUPPORTED_NODE_TYPES = [
  'folder.list_files',
  'google_drive.download_excel_folder',
  'google_drive.visible_download_folder',
  'excel.read',
  'excel.merge',
  'excel.write',
  'excel.create_report',
  'excel.open_file',
  'excel.visible_review',
  'data.filter',
  'data.map_columns',
  'data.deduplicate',
  'data.sort',
  'data.group',
  'data.aggregate',
  'data.validate',
  'ai.summarize',
  'report.compose',
  'google_slides.create',
  'apps_script.deploy_template',
] as const;

const AGENT_CLOUD_NODE_TYPES = new Set<string>([
  'ai.summarize',
  'report.compose',
  'google_slides.create',
  'apps_script.deploy_template',
]);
const CLOUD_PROFILE_MAX_COLUMNS = 40;
const CLOUD_PROFILE_MAX_SHEET_NAMES = 30;
const CLOUD_PROFILE_MAX_TOP_VALUES = 8;
const CLOUD_PROFILE_MAX_VALUE_CHARACTERS = 80;

function isAgentCloudNodeType(type: string): boolean {
  return AGENT_CLOUD_NODE_TYPES.has(type);
}

class DesktopNodeExecutor implements RegisteredWorkflowNodeExecutor {
  readonly riskLevel: RiskLevel;
  readonly version = 1;

  constructor(
    readonly type: (typeof SUPPORTED_NODE_TYPES)[number],
    private readonly deviceId: string,
    private readonly spreadsheet: DesktopSpreadsheetExecutor,
    private readonly reporter: AgentJobReporter,
    private readonly computerUse?: DesktopComputerUseController,
  ) {
    const definition = NODE_CATALOG_BY_TYPE.get(type);
    if (definition === undefined) {
      throw new Error(`Desktop node definition is missing for ${type}.`);
    }
    this.riskLevel = definition.riskLevel;
  }

  validateConfig(config: unknown): JsonValue {
    const parsed = WorkflowNodeSchema.safeParse({
      config,
      id: 'desktop_runtime_node',
      type: this.type,
      version: this.version,
    });
    if (!parsed.success) {
      throw new Error(`Desktop node configuration is invalid for ${this.type}.`);
    }
    return JsonValueSchema.parse(parsed.data.config);
  }

  async execute(
    context: WorkflowExecutionContext,
    input: JsonValue,
    config: JsonValue,
  ): Promise<{
    readonly metrics?: {
      readonly processedFileCount?: number;
      readonly processedRowCount?: number;
    };
    readonly output: JsonValue;
  }> {
    try {
      const parsed = WorkflowNodeSchema.parse({
        config,
        id: context.nodeId,
        type: this.type,
        version: this.version,
      });
      const envelope = isAgentCloudNodeType(parsed.type)
        ? EnvelopeSchema.parse({})
        : parseEnvelope(input);

      switch (parsed.type) {
        case 'google_drive.download_excel_folder': {
          const manifest = await this.reporter.listDriveExcelFiles(context.nodeId);
          const filesById = new Map(manifest.files.map((file) => [file.fileId, file]));
          const staged = await this.spreadsheet.stageDriveExcelFiles(
            this.deviceId,
            context.runId,
            parsed.config.folderAliasId,
            manifest.files.map((file) => ({
              fileId: file.fileId,
              fileName: file.fileName,
            })),
            async (file) => {
              const source = filesById.get(file.fileId);
              if (source === undefined) throw new Error('Drive transfer manifest changed.');
              return await this.reporter.downloadDriveExcelFile(context.nodeId, source);
            },
          );
          return {
            metrics: { processedFileCount: staged.paths.length },
            output: jsonEnvelope({
              folderAliasId: staged.folderAliasId,
              inputHashes: [...staged.inputHashes],
              paths: [...staged.paths],
              tables: [],
            }),
          };
        }
        case 'google_drive.visible_download_folder': {
          if (this.computerUse === undefined) {
            throw new Error('Visible Computer Use is unavailable.');
          }
          const workspace = await this.spreadsheet.prepareVisibleDriveDownload(
            this.deviceId,
            context.runId,
            parsed.config.folderAliasId,
          );
          const downloaded = await this.computerUse.downloadGoogleDriveFolder(
            {
              ...workspace,
              downloadTimeoutSeconds: parsed.config.downloadTimeoutSeconds,
              folderId: parsed.config.folderId,
              maxFileSizeBytes: parsed.config.maxFileSizeBytes,
              maxFiles: parsed.config.maxFiles,
            },
            this.reporter.signal,
            async (action) => {
              await this.reporter.reportStep({
                nodeId: context.nodeId,
                output: { computerUseAction: action },
                processedFileCount: 0,
                processedRowCount: 0,
                status: 'running',
              });
            },
          );
          return {
            metrics: { processedFileCount: downloaded.paths.length },
            output: jsonEnvelope({
              folderAliasId: parsed.config.folderAliasId,
              inputHashes: [...downloaded.inputHashes],
              paths: [...downloaded.paths],
              tables: [],
            }),
          };
        }
        case 'folder.list_files': {
          const paths = await this.spreadsheet.list(this.deviceId, {
            folderAliasId: parsed.config.folderAliasId,
            pattern: parsed.config.pattern,
            ...(parsed.config.modifiedSince === undefined
              ? {}
              : { modifiedSince: parsed.config.modifiedSince }),
          });
          return {
            metrics: { processedFileCount: paths.length },
            output: jsonEnvelope({
              folderAliasId: parsed.config.folderAliasId,
              inputHashes: [],
              paths: [...paths],
              tables: [],
            }),
          };
        }
        case 'excel.read': {
          if (envelope.folderAliasId === undefined || envelope.paths.length === 0) {
            throw new Error('No authorized spreadsheet files were selected.');
          }
          const folderAliasId = envelope.folderAliasId;
          const documents = await mapWithConcurrency(envelope.paths, 8, async (relativePath) => {
            return await this.spreadsheet.read(
              this.deviceId,
              {
                folderAliasId,
                relativePath,
              },
              {
                headerMode: parsed.config.headerMode,
                headerRow: parsed.config.headerRow,
                headerScanRows: parsed.config.headerScanRows,
                maxFileSizeBytes: parsed.config.maxFileSizeBytes,
                maxRows: parsed.config.maxRows,
                maxSheets: parsed.config.maxSheets,
                sheetMode: parsed.config.sheetMode,
                ...(parsed.config.sheetNames === undefined
                  ? {}
                  : { sheetNames: parsed.config.sheetNames }),
              },
            );
          });
          const tables = documents.flatMap((document) => document.sheets);
          return {
            metrics: {
              processedFileCount: documents.length,
              processedRowCount: countRows(tables),
            },
            output: jsonEnvelope({
              folderAliasId: envelope.folderAliasId,
              inputHashes: documents.map((document) => document.source.fileHash),
              paths: envelope.paths,
              tables,
            }),
          };
        }
        case 'excel.merge': {
          const table = this.spreadsheet.transform(envelope.tables, {
            columnMode: parsed.config.columnMode,
          });
          return transformed(envelope, table);
        }
        case 'data.filter': {
          const table = this.spreadsheet.transform(envelope.tables, {
            filter: {
              conditions: parsed.config.conditions.map((condition) => ({
                field: condition.field,
                operator: condition.operator,
                ...(condition.value === undefined ? {} : { value: condition.value }),
              })),
              match: parsed.config.match,
            },
          });
          return transformed(envelope, table);
        }
        case 'data.map_columns': {
          const table = this.spreadsheet.transform(envelope.tables, {
            mappings: parsed.config.mappings,
            preserveUnmapped: parsed.config.preserveUnmapped,
          });
          return transformed(envelope, table);
        }
        case 'data.deduplicate': {
          const table = this.spreadsheet.transform(envelope.tables, {
            deduplicate: {
              keep: parsed.config.keep,
              keys: parsed.config.keys,
            },
          });
          return transformed(envelope, table);
        }
        case 'data.sort': {
          const table = this.spreadsheet.transform(envelope.tables, {
            sort: parsed.config.fields,
          });
          return transformed(envelope, table);
        }
        case 'data.group': {
          const table = this.spreadsheet.transform(envelope.tables, {
            groupBy: parsed.config.keys,
          });
          return transformed(envelope, table);
        }
        case 'data.aggregate': {
          const table = this.spreadsheet.transform(envelope.tables, {
            aggregate: {
              groupBy: parsed.config.groupBy,
              operations: parsed.config.operations.map((operation) => ({
                alias: operation.alias,
                ...(operation.field === undefined ? {} : { field: operation.field }),
                operation: operation.operation,
              })),
            },
          });
          return transformed(envelope, table);
        }
        case 'data.validate': {
          const validated = this.spreadsheet.validate(
            envelope.tables,
            parsed.config.rules.map((rule) => ({
              ...(rule.dataType === undefined ? {} : { dataType: rule.dataType }),
              field: rule.field,
              ...(rule.max === undefined ? {} : { max: rule.max }),
              ...(rule.min === undefined ? {} : { min: rule.min }),
              ...(rule.pattern === undefined ? {} : { pattern: rule.pattern }),
              required: rule.required,
            })),
          );
          if (parsed.config.onInvalid === 'fail' && validated.invalid.rows.length > 0) {
            throw new Error('Spreadsheet validation found invalid rows.');
          }
          return {
            metrics: {
              processedRowCount: validated.valid.rows.length + validated.invalid.rows.length,
            },
            output: jsonEnvelope({
              ...envelope,
              tables:
                parsed.config.onInvalid === 'separate'
                  ? [validated.valid, validated.invalid]
                  : [validated.valid],
            }),
          };
        }
        case 'excel.create_report':
        case 'excel.write': {
          if (envelope.tables.length === 0) {
            throw new Error('No spreadsheet rows are available to write.');
          }
          const written = await this.spreadsheet.writeOnce(
            this.deviceId,
            `${context.idempotencyKey}:${context.nodeId}`,
            envelope.inputHashes,
            {
              folderAliasId: parsed.config.folderAliasId,
              outputName: parsed.config.outputName,
              ...(parsed.type === 'excel.create_report' && parsed.config.reportTitle !== undefined
                ? { reportTitle: parsed.config.reportTitle }
                : {}),
            },
            envelope.tables,
          );
          return {
            metrics: {
              processedFileCount: 1,
              processedRowCount: written.result?.processedRowCount ?? countRows(envelope.tables),
            },
            output: jsonEnvelope({
              ...envelope,
              folderAliasId: parsed.config.folderAliasId,
              paths: [parsed.config.outputName],
              write: {
                duplicate: written.duplicate,
                ...(written.result === undefined
                  ? {}
                  : {
                      backupCreated: written.result.backupCreated,
                      fileHash: written.result.fileHash,
                      fileSizeBytes: written.result.fileSizeBytes,
                      processedRowCount: written.result.processedRowCount,
                      sheetCount: written.result.sheetCount,
                    }),
              },
            }),
          };
        }
        case 'excel.open_file': {
          const relativePath = envelope.paths.at(-1);
          if (
            relativePath === undefined ||
            (envelope.folderAliasId !== undefined &&
              envelope.folderAliasId !== parsed.config.folderAliasId)
          ) {
            throw new Error('No approved output workbook is available to open.');
          }
          await this.spreadsheet.openWorkbook(this.deviceId, {
            folderAliasId: parsed.config.folderAliasId,
            relativePath,
          });
          return {
            metrics: { processedFileCount: 1 },
            output: jsonEnvelope(envelope),
          };
        }
        case 'excel.visible_review': {
          if (this.computerUse === undefined) {
            throw new Error('Visible Computer Use is unavailable.');
          }
          const relativePath = envelope.paths.at(-1);
          if (
            relativePath === undefined ||
            (envelope.folderAliasId !== undefined &&
              envelope.folderAliasId !== parsed.config.folderAliasId)
          ) {
            throw new Error('No approved output workbook is available for visible review.');
          }
          const workbookPath = await this.spreadsheet.resolveWorkbookPath(this.deviceId, {
            folderAliasId: parsed.config.folderAliasId,
            relativePath,
          });
          await this.computerUse.operateExcel(
            {
              actions: parsed.config.actions as readonly VisibleExcelAction[],
              workbookPath,
            },
            this.reporter.signal,
            async (action) => {
              await this.reporter.reportStep({
                nodeId: context.nodeId,
                output: { computerUseAction: action },
                processedFileCount: 0,
                processedRowCount: 0,
                status: 'running',
              });
            },
          );
          return {
            metrics: { processedFileCount: 1 },
            output: jsonEnvelope(envelope),
          };
        }
        case 'ai.summarize':
        case 'report.compose':
        case 'google_slides.create':
        case 'apps_script.deploy_template': {
          const cloudInput = cloudContinuationInput(input);
          const result = await this.reporter.executeCloudStep(context.nodeId, cloudInput);
          return {
            metrics: {
              processedFileCount: result.processedFileCount,
              processedRowCount: result.processedRowCount,
            },
            output: result.output,
          };
        }
        default:
          throw new Error(`Desktop node ${parsed.type} is not supported.`);
      }
    } catch (error) {
      throw safeDesktopExecutionError(error, context.nodeId);
    }
  }
}

export class DesktopWorkflowJobExecutor {
  constructor(
    private readonly spreadsheet: DesktopSpreadsheetExecutor,
    private readonly computerUse?: DesktopComputerUseController,
  ) {}

  async execute(job: AgentJob, reporter: AgentJobReporter): Promise<JsonValue> {
    const registry = new NodeRegistry();
    for (const type of SUPPORTED_NODE_TYPES) {
      registry.register(
        new DesktopNodeExecutor(type, job.deviceId, this.spreadsheet, reporter, this.computerUse),
      );
    }
    const engine = new WorkflowEngine(registry);
    const result = await engine.execute(job.workflow, {
      approvedNodeIds: job.workflow.nodes.map((node) => node.id),
      idempotencyKey: job.idempotencyKey,
      maxAttempts: 1,
      mode: 'live',
      onProgress: async (progress) => {
        if (progress.status === 'running') {
          await reporter.reportStep({
            nodeId: progress.nodeId,
            processedFileCount: 0,
            processedRowCount: 0,
            status: 'running',
          });
        }
      },
      runId: job.workflowRunId,
      signal: reporter.signal,
      stepTimeoutMs: 600_000,
    });

    for (const step of result.steps) {
      await reporter.reportStep(stepResult(step));
    }
    if (result.status !== 'succeeded') {
      const lastError = result.steps.at(-1)?.error;
      throw new DesktopWorkflowJobError(
        safeExecutionCode(lastError?.message) ??
          lastError?.code ??
          (result.status === 'cancelled' ? 'RUN_CANCELLED' : 'NODE_EXECUTION_FAILED'),
        lastError?.retryable ?? false,
      );
    }
    return JsonValueSchema.parse({
      processedFileCount: result.steps.reduce(
        (sum, step) => sum + (step.metrics.processedFileCount ?? 0),
        0,
      ),
      processedRowCount: result.steps.reduce(
        (sum, step) => sum + (step.metrics.processedRowCount ?? 0),
        0,
      ),
      status: result.status,
      stepCount: result.steps.length,
    });
  }
}

function isSafeRelativeEnvelopePath(value: string): boolean {
  if (value.includes('\\') || value.includes('\0') || value.startsWith('/')) return false;
  const segments = value.split('/');
  return !segments.some((segment) => segment === '' || segment === '.' || segment === '..');
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<readonly R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value !== undefined) results[index] = await mapper(value);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => await worker()),
  );
  return results;
}

function safeDesktopExecutionError(error: unknown, nodeId: string): WorkflowEngineError {
  if (error instanceof WorkflowEngineError) return error;
  const safeCode =
    error instanceof LocalExecutorError ||
    error instanceof FolderAuthorizationError ||
    error instanceof ComputerUseError
      ? error.code
      : error instanceof z.ZodError
        ? 'DESKTOP_DATA_VALIDATION_FAILED'
        : 'DESKTOP_UNEXPECTED_ERROR';
  const retryable = error instanceof LocalExecutorError && error.retryable;
  return new WorkflowEngineError(
    'NODE_EXECUTION_FAILED',
    `Node "${nodeId}" failed (${safeCode}).`,
    {
      cause: error,
      details: { nodeId, safeCode },
      retryable,
    },
  );
}

function safeExecutionCode(message: string | undefined): string | undefined {
  const code = /\(([A-Z][A-Z0-9_]{0,119})\)\.$/u.exec(message ?? '')?.[1];
  return code;
}

class DesktopWorkflowJobError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super('Desktop workflow execution did not complete.');
    this.name = 'DesktopWorkflowJobError';
  }
}

function parseEnvelope(input: JsonValue): DesktopEnvelope {
  if (Array.isArray(input)) {
    const envelopes = input.map((value) => EnvelopeSchema.parse(value));
    const folderAliasIds = [
      ...new Set(
        envelopes.flatMap((value) =>
          value.folderAliasId === undefined ? [] : [value.folderAliasId],
        ),
      ),
    ];
    if (folderAliasIds.length > 1) {
      throw new Error('A desktop step cannot combine different folder grants.');
    }
    return {
      ...(folderAliasIds[0] === undefined ? {} : { folderAliasId: folderAliasIds[0] }),
      inputHashes: [...new Set(envelopes.flatMap((value) => value.inputHashes))],
      paths: [...new Set(envelopes.flatMap((value) => value.paths))],
      tables: envelopes.flatMap((value) => value.tables),
    };
  }
  return EnvelopeSchema.parse(input === null ? {} : input);
}

function jsonEnvelope(envelope: unknown): JsonValue {
  return JsonValueSchema.parse(EnvelopeSchema.parse(envelope));
}

function countRows(tables: readonly SpreadsheetTable[]): number {
  return tables.reduce((sum, table) => sum + table.rows.length, 0);
}

function transformed(
  envelope: DesktopEnvelope,
  table: SpreadsheetTable,
): {
  readonly metrics: {
    readonly processedFileCount: number;
    readonly processedRowCount: number;
  };
  readonly output: JsonValue;
} {
  return {
    metrics: {
      processedFileCount: envelope.paths.length,
      processedRowCount: table.rows.length,
    },
    output: jsonEnvelope({
      ...(envelope.folderAliasId === undefined ? {} : { folderAliasId: envelope.folderAliasId }),
      inputHashes: envelope.inputHashes,
      paths: envelope.paths,
      tables: [table],
    }),
  };
}

function stepResult(step: {
  readonly completedAt: string;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
  readonly metrics: {
    readonly processedFileCount?: number;
    readonly processedRowCount?: number;
  };
  readonly nodeId: string;
  readonly nodeType: string;
  readonly output?: JsonValue;
  readonly startedAt: string;
  readonly status: 'cancelled' | 'failed' | 'planned' | 'succeeded' | 'timed_out';
}): StepResult {
  const status =
    step.status === 'planned' ? 'skipped' : step.status === 'timed_out' ? 'failed' : step.status;
  return {
    completedAt: step.completedAt,
    ...(step.error === undefined
      ? {}
      : {
          error: {
            code: step.error.code,
            message: step.error.message,
            retryable: step.error.retryable,
          },
        }),
    nodeId: step.nodeId,
    ...(step.output === undefined || !isAgentCloudNodeType(step.nodeType)
      ? {}
      : { output: JsonValueSchema.parse(step.output) }),
    processedFileCount: step.metrics.processedFileCount ?? 0,
    processedRowCount: step.metrics.processedRowCount ?? 0,
    startedAt: step.startedAt,
    status,
  };
}

function cloudContinuationInput(input: JsonValue): JsonValue {
  const envelope = EnvelopeSchema.safeParse(input);
  if (!envelope.success) return JsonValueSchema.parse(input);
  const allColumns = new Set(envelope.data.tables.flatMap((table) => table.columns));
  const columnOrder = [...allColumns].slice(0, CLOUD_PROFILE_MAX_COLUMNS);
  const statistics = new Map<
    string,
    {
      categorical: Map<string, number>;
      nonEmptyCount: number;
      numericCount: number;
      numericMaximum?: number;
      numericMinimum?: number;
      numericSumOverflowed: boolean;
      numericSum: number;
      otherValueCount: number;
    }
  >(
    columnOrder.map((column) => [
      column,
      {
        categorical: new Map<string, number>(),
        nonEmptyCount: 0,
        numericCount: 0,
        numericSumOverflowed: false,
        numericSum: 0,
        otherValueCount: 0,
      },
    ]),
  );
  let rowCount = 0;
  for (const table of envelope.data.tables) {
    rowCount += table.rows.length;
    for (const row of table.rows) {
      for (const column of columnOrder) {
        const value = row[column];
        if (value === undefined || value === null || value === '') continue;
        const summary = statistics.get(column);
        if (summary === undefined) continue;
        summary.nonEmptyCount += 1;
        if (typeof value === 'number' && Number.isFinite(value)) {
          summary.numericCount += 1;
          const nextSum = summary.numericSum + value;
          if (Number.isFinite(nextSum)) {
            summary.numericSum = nextSum;
          } else {
            summary.numericSum = nextSum < 0 ? -Number.MAX_VALUE : Number.MAX_VALUE;
            summary.numericSumOverflowed = true;
          }
          summary.numericMinimum = Math.min(summary.numericMinimum ?? value, value);
          summary.numericMaximum = Math.max(summary.numericMaximum ?? value, value);
          continue;
        }
        const label = String(value).slice(0, CLOUD_PROFILE_MAX_VALUE_CHARACTERS);
        if (summary.categorical.has(label) || summary.categorical.size < 40) {
          summary.categorical.set(label, (summary.categorical.get(label) ?? 0) + 1);
        } else {
          summary.otherValueCount += 1;
        }
      }
    }
  }
  return JsonValueSchema.parse({
    columns: columnOrder.map((column) => {
      const summary = statistics.get(column);
      if (summary === undefined) return { name: column };
      return {
        name: column,
        nonEmptyCount: summary.nonEmptyCount,
        numeric: {
          count: summary.numericCount,
          ...(summary.numericMaximum === undefined ? {} : { maximum: summary.numericMaximum }),
          ...(summary.numericMinimum === undefined ? {} : { minimum: summary.numericMinimum }),
          sum: summary.numericSum,
          sumOverflowed: summary.numericSumOverflowed,
        },
        otherValueCount: summary.otherValueCount,
        topValues: [...summary.categorical.entries()]
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .slice(0, CLOUD_PROFILE_MAX_TOP_VALUES)
          .map(([value, count]) => ({ count, value })),
      };
    }),
    fileCount: envelope.data.paths.length,
    kind: 'desktop_excel_profile',
    rowCount,
    sheetCount: envelope.data.tables.length,
    sheetNames: envelope.data.tables
      .slice(0, CLOUD_PROFILE_MAX_SHEET_NAMES)
      .map((table) => table.name),
    truncatedColumns: Math.max(0, allColumns.size - CLOUD_PROFILE_MAX_COLUMNS),
    truncatedSheetNames: Math.max(0, envelope.data.tables.length - CLOUD_PROFILE_MAX_SHEET_NAMES),
  });
}
