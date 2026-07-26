import type { AgentJob, JsonValue, StepResult } from '@ai-workflow-studio/agent-protocol';
import type { SpreadsheetTable } from '@ai-workflow-studio/local-executor';
import {
  NodeRegistry,
  WorkflowEngine,
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
import { DesktopSpreadsheetExecutor } from './local-executor';

const CellSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
const TableSchema = z
  .object({
    columns: z.array(z.string().max(200)).max(5_000),
    name: z.string().min(1).max(200),
    rows: z.array(z.record(z.string(), CellSchema)).max(1_000_000),
  })
  .strict();
const EnvelopeSchema = z
  .object({
    folderAliasId: z.string().uuid().optional(),
    inputHashes: z
      .array(z.string().regex(/^[a-f0-9]{64}$/))
      .max(1_000)
      .default([]),
    paths: z
      .array(
        z
          .string()
          .min(1)
          .max(255)
          .refine(
            (value) => !value.includes('/') && !value.includes('\\') && !value.includes('..'),
          ),
      )
      .max(1_000)
      .default([]),
    tables: z.array(TableSchema).max(200).default([]),
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
  'excel.read',
  'excel.merge',
  'excel.write',
  'excel.create_report',
  'data.filter',
  'data.map_columns',
  'data.deduplicate',
] as const;

class DesktopNodeExecutor implements RegisteredWorkflowNodeExecutor {
  readonly riskLevel: RiskLevel;
  readonly version = 1;

  constructor(
    readonly type: (typeof SUPPORTED_NODE_TYPES)[number],
    private readonly deviceId: string,
    private readonly spreadsheet: DesktopSpreadsheetExecutor,
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
    const parsed = WorkflowNodeSchema.parse({
      config,
      id: context.nodeId,
      type: this.type,
      version: this.version,
    });
    const envelope = parseEnvelope(input);

    switch (parsed.type) {
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
        const documents = await Promise.all(
          envelope.paths.map(async (relativePath) => {
            return await this.spreadsheet.read(
              this.deviceId,
              {
                folderAliasId,
                relativePath,
              },
              {
                headerRow: parsed.config.headerRow,
                maxFileSizeBytes: parsed.config.maxFileSizeBytes,
                maxRows: parsed.config.maxRows,
                maxSheets: parsed.config.maxSheets,
                sheetMode: parsed.config.sheetMode,
                ...(parsed.config.sheetNames === undefined
                  ? {}
                  : { sheetNames: parsed.config.sheetNames }),
              },
            );
          }),
        );
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
      default:
        throw new Error(`Desktop node ${parsed.type} is not supported.`);
    }
  }
}

export class DesktopWorkflowJobExecutor {
  constructor(private readonly spreadsheet: DesktopSpreadsheetExecutor) {}

  async execute(job: AgentJob, reporter: AgentJobReporter): Promise<JsonValue> {
    const registry = new NodeRegistry();
    for (const type of SUPPORTED_NODE_TYPES) {
      registry.register(new DesktopNodeExecutor(type, job.deviceId, this.spreadsheet));
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
    processedFileCount: step.metrics.processedFileCount ?? 0,
    processedRowCount: step.metrics.processedRowCount ?? 0,
    startedAt: step.startedAt,
    status,
  };
}
