import 'server-only';

import type { UsageSink } from '@ai-workflow-studio/ai-gateway';
import {
  GoogleDriveExcelClient,
  GoogleSheetsClient,
  GoogleWorkspaceClient,
  InMemoryGoogleOperationStore,
  type DriveExcelFolderResult,
  type SafeAppsScriptTemplate,
} from '@ai-workflow-studio/google-sheets';
import {
  NodeRegistry,
  WorkflowEngine,
  WorkflowEngineError,
  type RegisteredWorkflowNodeExecutor,
  type WorkflowExecutionResult,
} from '@ai-workflow-studio/workflow-engine';
import {
  JsonValueSchema,
  WorkflowNodeSchema,
  type JsonValue,
  type RiskLevel,
  type Workflow,
  type WorkflowNode,
} from '@ai-workflow-studio/workflow-schema';
import { z } from 'zod';

import { createServerAiChatGateway } from '@/lib/ai-gateway';
import { resolveAiModelRoute } from '@/lib/ai-model-routing';
import type { WorkspaceContext } from '@/lib/auth/context';
import {
  DriveExcelCheckpointSchema,
  DriveExcelReadConfigSchema,
  completedDriveExcelOutput,
  createDriveExcelCheckpoint,
  driveExcelReadOptions,
  mergeDriveExcelCheckpoint,
  nextDriveExcelBatchManifest,
  type DriveExcelCheckpoint,
} from '@/lib/cloud-drive-excel-checkpoint';
import { safeGoogleNodeFailure } from '@/lib/cloud-workflow-errors';
import { buildCloudAiSummaryInstructions } from '@/lib/cloud-workflow-input';
import { appsScriptParentId, buildProfessionalSlides } from '@/lib/cloud-workflow-output';
import { googleConnectionService } from '@/lib/google-connections';
import {
  consumeMeteredAllowance,
  recordReservedAssistantUsage,
  reserveAssistantUsage,
} from '@/lib/usage-control-server';

const CLOUD_STEP_TIMEOUT_MS = 600_000;
const UuidSchema = z.string().uuid();
const GoogleResourceIdSchema = z
  .string()
  .min(8)
  .max(300)
  .regex(/^[A-Za-z0-9_-]+$/);
const MAX_NODE_INPUT_CHARACTERS = 48_000;
const GOOGLE_DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const GoogleCellSchema = z.union([z.boolean(), z.null(), z.number(), z.string()]);
const DriveExcelFolderOutputSchema = z
  .object({
    columns: z.array(z.string().min(1).max(200)).min(2).max(1_000),
    files: z
      .array(
        z
          .object({
            fileId: GoogleResourceIdSchema,
            fileName: z.string().trim().min(1).max(1_000),
            rowCount: z.number().int().nonnegative(),
            sheetCount: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
    folderId: GoogleResourceIdSchema,
    kind: z.literal('google_drive_excel_folder'),
    rows: z.array(z.record(z.string().min(1).max(200), GoogleCellSchema)).max(100_000),
  })
  .strict();

function nodeConfig(type: string, config: unknown): JsonValue {
  const parsed = WorkflowNodeSchema.safeParse({
    config,
    id: 'config_validation',
    type,
    version: 1,
  });
  if (!parsed.success) {
    throw new WorkflowEngineError('WORKFLOW_SCHEMA_INVALID', `Invalid ${type} configuration.`);
  }
  return JsonValueSchema.parse(parsed.data.config);
}

function boundedInput(input: JsonValue, maximumCharacters = MAX_NODE_INPUT_CHARACTERS): string {
  const encoded = JSON.stringify(input, null, 2);
  if (encoded.length <= maximumCharacters) return encoded;
  const suffix = '\n[truncated]';
  return `${encoded.slice(0, Math.max(0, maximumCharacters - suffix.length))}${suffix}`;
}

function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function timeWindow(
  range: 'last_7_days' | 'today' | 'yesterday',
  now = new Date(),
): { readonly after: string; readonly before: string } {
  const end = new Date(now);
  const start = new Date(now);
  if (range === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (range === 'yesterday') {
    end.setHours(0, 0, 0, 0);
    start.setTime(end.getTime() - 86_400_000);
  } else {
    start.setTime(end.getTime() - 7 * 86_400_000);
  }
  return { after: start.toISOString(), before: end.toISOString() };
}

abstract class CloudNodeExecutor implements RegisteredWorkflowNodeExecutor {
  readonly version = 1;

  constructor(
    protected readonly context: WorkspaceContext,
    readonly type: string,
    readonly riskLevel: RiskLevel,
  ) {}

  validateConfig(config: unknown): JsonValue {
    return nodeConfig(this.type, config);
  }

  protected async token(connectionId: string, signal?: AbortSignal): Promise<string> {
    return await googleConnectionService().accessToken(
      this.context.actor.tenantId,
      connectionId,
      signal,
    );
  }

  protected async countTool(operation: string): Promise<void> {
    await consumeMeteredAllowance(this.context, 'tool_call', 1, { operation });
  }

  abstract execute(
    executionContext: Parameters<RegisteredWorkflowNodeExecutor['execute']>[0],
    input: JsonValue,
    config: JsonValue,
  ): ReturnType<RegisteredWorkflowNodeExecutor['execute']>;
}

class InlineDataExecutor extends CloudNodeExecutor {
  constructor(context: WorkspaceContext) {
    super(context, 'data.inline', 'read');
  }

  async execute(
    _executionContext: Parameters<RegisteredWorkflowNodeExecutor['execute']>[0],
    _input: JsonValue,
    config: JsonValue,
  ) {
    const parsed = z
      .object({
        content: z.string().trim().min(1).max(20_000),
      })
      .strict()
      .parse(config);
    return {
      output: JsonValueSchema.parse({
        kind: 'inline_text',
        text: parsed.content,
      }),
    };
  }
}

class GmailReadExecutor extends CloudNodeExecutor {
  constructor(
    context: WorkspaceContext,
    private readonly workspace: GoogleWorkspaceClient,
  ) {
    super(context, 'gmail.read', 'read');
  }

  async execute(
    executionContext: Parameters<RegisteredWorkflowNodeExecutor['execute']>[0],
    _input: JsonValue,
    config: JsonValue,
  ) {
    const parsed = z
      .object({
        connectionId: UuidSchema,
        includeBody: z.boolean(),
        maxMessages: z.number().int().min(1).max(200),
        query: z.string().max(500).optional(),
        timeRange: z.enum(['today', 'yesterday', 'last_7_days']),
      })
      .strict()
      .parse(config);
    await this.countTool(this.type);
    const messages = await this.workspace.listMessagesSince(
      await this.token(parsed.connectionId, executionContext.signal),
      {
        ...timeWindow(parsed.timeRange),
        includeBodies: parsed.includeBody,
        maxMessages: Math.min(parsed.maxMessages, 100),
        ...(parsed.query === undefined ? {} : { query: parsed.query }),
      },
      executionContext.signal,
    );
    return {
      metrics: { processedRowCount: messages.length },
      output: JsonValueSchema.parse({ kind: 'gmail_messages', messages }),
    };
  }
}

class FormsReadExecutor extends CloudNodeExecutor {
  constructor(
    context: WorkspaceContext,
    private readonly workspace: GoogleWorkspaceClient,
  ) {
    super(context, 'google_forms.read_responses', 'read');
  }

  async execute(
    executionContext: Parameters<RegisteredWorkflowNodeExecutor['execute']>[0],
    _input: JsonValue,
    config: JsonValue,
  ) {
    const parsed = z
      .object({
        connectionId: UuidSchema,
        formId: GoogleResourceIdSchema,
        maxResponses: z.number().int().min(1).max(5_000),
        since: z.iso.datetime({ offset: true }).optional(),
      })
      .strict()
      .parse(config);
    await this.countTool(this.type);
    const responses = await this.workspace.listFormResponses(
      await this.token(parsed.connectionId, executionContext.signal),
      parsed.formId,
      {
        maxResponses: Math.min(parsed.maxResponses, 500),
        ...(parsed.since === undefined ? {} : { submittedSince: parsed.since }),
      },
      executionContext.signal,
    );
    return {
      metrics: { processedRowCount: responses.length },
      output: JsonValueSchema.parse({ kind: 'google_form_responses', responses }),
    };
  }
}

class SheetsReadExecutor extends CloudNodeExecutor {
  constructor(
    context: WorkspaceContext,
    private readonly sheets: GoogleSheetsClient,
  ) {
    super(context, 'google_sheets.read', 'read');
  }

  async execute(
    executionContext: Parameters<RegisteredWorkflowNodeExecutor['execute']>[0],
    _input: JsonValue,
    config: JsonValue,
  ) {
    const parsed = z
      .object({
        connectionId: UuidSchema,
        range: z.string().trim().min(1).max(100).optional(),
        sheetName: z.string().trim().min(1).max(100),
        spreadsheetId: GoogleResourceIdSchema,
      })
      .strict()
      .parse(config);
    await this.countTool(this.type);
    const escapedSheet = parsed.sheetName.replaceAll("'", "''");
    const result = await this.sheets
      .read(
        await this.token(parsed.connectionId, executionContext.signal),
        parsed.spreadsheetId,
        parsed.range ?? `'${escapedSheet}'!A1:ZZ10000`,
        executionContext.signal,
      )
      .catch((error: unknown) => {
        throw safeGoogleNodeFailure(error, executionContext.nodeId);
      });
    return {
      metrics: { processedRowCount: Math.max(0, result.values.length - 1) },
      output: JsonValueSchema.parse({ kind: 'google_sheet_values', ...result }),
    };
  }
}

class DriveExcelFolderReadExecutor extends CloudNodeExecutor {
  constructor(
    context: WorkspaceContext,
    private readonly driveExcel: GoogleDriveExcelClient,
  ) {
    super(context, 'google_drive.read_excel_folder', 'read');
  }

  async execute(
    executionContext: Parameters<RegisteredWorkflowNodeExecutor['execute']>[0],
    _input: JsonValue,
    config: JsonValue,
  ) {
    const parsed = DriveExcelReadConfigSchema.parse(config);
    await this.countTool(this.type);
    await googleConnectionService().assertScopes(this.context.actor.tenantId, parsed.connectionId, [
      GOOGLE_DRIVE_READONLY_SCOPE,
    ]);
    const result = await this.driveExcel
      .readExcelFolder(
        await this.token(parsed.connectionId, executionContext.signal),
        parsed.folderId,
        {
          headerScanRows: parsed.headerScanRows,
          includeSubfolders: parsed.includeSubfolders,
          maxFileSizeBytes: parsed.maxFileSizeBytes,
          maxFiles: parsed.maxFiles,
          maxRows: parsed.maxRows,
          maxSheets: parsed.maxSheets,
        },
        executionContext.signal,
      )
      .catch((error: unknown) => {
        throw safeGoogleNodeFailure(error, executionContext.nodeId);
      });
    return {
      metrics: { processedFileCount: result.files.length, processedRowCount: result.rows.length },
      output: JsonValueSchema.parse(result),
    };
  }
}

class DriveExcelReportCreateExecutor extends CloudNodeExecutor {
  constructor(
    context: WorkspaceContext,
    private readonly driveExcel: GoogleDriveExcelClient,
  ) {
    super(context, 'google_drive.create_excel_report', 'external');
  }

  async execute(
    executionContext: Parameters<RegisteredWorkflowNodeExecutor['execute']>[0],
    input: JsonValue,
    config: JsonValue,
  ) {
    const parsed = z
      .object({
        connectionId: UuidSchema,
        folderId: GoogleResourceIdSchema,
        outputName: z
          .string()
          .trim()
          .min(6)
          .max(180)
          .regex(/\.xlsx$/i),
        overwrite: z.literal(false),
        reportTitle: z.string().trim().min(1).max(200).optional(),
      })
      .strict()
      .parse(config);
    const source = DriveExcelFolderOutputSchema.parse(input);
    if (source.folderId !== parsed.folderId) {
      throw new WorkflowEngineError(
        'WORKFLOW_SCHEMA_INVALID',
        'The Excel report destination must match the approved source Drive folder.',
      );
    }
    await this.countTool(this.type);
    const result = await this.driveExcel
      .createExcelReport(
        await this.token(parsed.connectionId, executionContext.signal),
        parsed.connectionId,
        {
          ...source,
          idempotencyKey: `${executionContext.idempotencyKey}:${executionContext.nodeId}`,
          outputName: parsed.outputName,
          ...(parsed.reportTitle === undefined ? {} : { reportTitle: parsed.reportTitle }),
        },
        executionContext.signal,
      )
      .catch((error: unknown) => {
        throw safeGoogleNodeFailure(error, executionContext.nodeId);
      });
    return {
      metrics: { processedFileCount: 1, processedRowCount: source.rows.length },
      output: JsonValueSchema.parse(result),
    };
  }
}

class AiSummarizeExecutor extends CloudNodeExecutor {
  constructor(context: WorkspaceContext) {
    super(context, 'ai.summarize', 'read');
  }

  async execute(
    executionContext: Parameters<RegisteredWorkflowNodeExecutor['execute']>[0],
    input: JsonValue,
    config: JsonValue,
  ) {
    const parsed = z
      .object({
        includeCaseStudy: z.boolean(),
        includeRecommendations: z.boolean(),
        language: z.enum(['en', 'zh-Hant']),
        maxCharacters: z.number().int().min(500).max(20_000),
        provider: z.enum(['anthropic', 'auto', 'gemini', 'mock', 'openai']),
        style: z.enum(['brief', 'executive', 'professional']),
        tier: z.enum(['advanced', 'auto', 'economy', 'flagship', 'standard']),
      })
      .strict()
      .parse(config);
    const instructions = buildCloudAiSummaryInstructions(input, parsed);
    const route = await resolveAiModelRoute(this.context, {
      operation: 'chat',
      provider: parsed.provider,
      tier: parsed.tier,
    });
    const reservation = await reserveAssistantUsage(this.context, {
      costMultiplier: route.costMultiplier,
      inputCharacters: instructions.length,
      maxAttempts: 1,
      maxOutputTokens: 4_096,
      operation: 'chat',
      provider: route.provider,
    });
    const usageSink: UsageSink = {
      record: async (record) => {
        await recordReservedAssistantUsage(
          this.context,
          reservation,
          executionContext.runId,
          record,
        );
      },
    };
    let text = '';
    try {
      for await (const event of createServerAiChatGateway(route.provider, usageSink, {
        model: route.model,
        ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }),
      }).stream(
        {
          locale: parsed.language,
          maxOutputTokens: 4_096,
          messages: [{ content: instructions, role: 'user' }],
          sources: [],
        },
        executionContext.signal,
      )) {
        if (event.type === 'delta') text += event.text;
      }
    } catch (error) {
      await reservation.release().catch(() => undefined);
      throw error;
    }
    return {
      output: JsonValueSchema.parse({
        kind: 'ai_summary',
        model: route.model,
        provider: route.provider,
        text: text.slice(0, parsed.maxCharacters),
      }),
    };
  }
}

class ReportComposeExecutor extends CloudNodeExecutor {
  constructor(context: WorkspaceContext) {
    super(context, 'report.compose', 'write');
  }

  async execute(
    _executionContext: Parameters<RegisteredWorkflowNodeExecutor['execute']>[0],
    input: JsonValue,
    config: JsonValue,
  ) {
    const parsed = z
      .object({
        format: z.enum(['html', 'markdown']),
        includeReferences: z.boolean(),
        title: z.string().trim().min(1).max(200),
      })
      .strict()
      .parse(config);
    const source = z
      .object({ text: z.string().max(20_000) })
      .passthrough()
      .safeParse(input);
    const text = source.success ? source.data.text : boundedInput(input);
    const content =
      parsed.format === 'html'
        ? `<article><h1>${htmlEscape(parsed.title)}</h1><div>${htmlEscape(text).replaceAll('\n', '<br>')}</div></article>`
        : `# ${parsed.title}\n\n${text}`;
    return {
      output: JsonValueSchema.parse({
        content,
        format: parsed.format,
        includeReferences: parsed.includeReferences,
        kind: 'business_report',
        title: parsed.title,
      }),
    };
  }
}

function sourceText(input: JsonValue): string {
  const report = z
    .object({ content: z.string().max(80_000) })
    .passthrough()
    .safeParse(input);
  return report.success ? report.data.content : boundedInput(input);
}

class SlidesCreateExecutor extends CloudNodeExecutor {
  constructor(
    context: WorkspaceContext,
    private readonly workspace: GoogleWorkspaceClient,
  ) {
    super(context, 'google_slides.create', 'write');
  }

  async execute(
    executionContext: Parameters<RegisteredWorkflowNodeExecutor['execute']>[0],
    input: JsonValue,
    config: JsonValue,
  ) {
    const parsed = z
      .object({
        connectionId: UuidSchema,
        folderId: GoogleResourceIdSchema.optional(),
        includeImages: z.boolean(),
        includeReferences: z.boolean(),
        maxSlides: z.number().int().min(3).max(30),
        title: z.string().trim().min(1).max(200),
      })
      .strict()
      .parse(config);
    await this.countTool(this.type);
    const slides = buildProfessionalSlides(sourceText(input), parsed);
    const result = await this.workspace.createProfessionalDeck(
      await this.token(parsed.connectionId, executionContext.signal),
      {
        ...(parsed.folderId === undefined ? {} : { folderId: parsed.folderId }),
        locale: 'zh-Hant',
        slides,
        title: parsed.title,
      },
      executionContext.signal,
    );
    return {
      output: JsonValueSchema.parse({
        kind: 'google_slides_presentation',
        presentationId: result.presentationId,
        slideCount: slides.length,
        url: `https://docs.google.com/presentation/d/${result.presentationId}/edit`,
      }),
    };
  }
}

class GmailSendExecutor extends CloudNodeExecutor {
  constructor(
    context: WorkspaceContext,
    private readonly workspace: GoogleWorkspaceClient,
  ) {
    super(context, 'gmail.send', 'external');
  }

  async execute(
    executionContext: Parameters<RegisteredWorkflowNodeExecutor['execute']>[0],
    input: JsonValue,
    config: JsonValue,
  ) {
    const parsed = z
      .object({
        connectionId: UuidSchema,
        recipients: z.array(z.email()).min(1).max(20),
        sendMode: z.enum(['draft', 'send']),
        subject: z.string().trim().min(1).max(200),
      })
      .strict()
      .parse(config);
    await this.countTool(this.type);
    const token = await this.token(parsed.connectionId, executionContext.signal);
    const html = `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${htmlEscape(sourceText(input))}</pre>`;
    const results = [];
    for (const recipient of parsed.recipients) {
      const result =
        parsed.sendMode === 'draft'
          ? await this.workspace.createEmailDraft(
              token,
              { html, subject: parsed.subject, to: recipient },
              executionContext.signal,
            )
          : await this.workspace.sendEmail(
              token,
              { html, subject: parsed.subject, to: recipient },
              executionContext.signal,
            );
      results.push({ id: result.id, recipient, threadId: result.threadId });
    }
    return {
      metrics: { processedRowCount: results.length },
      output: JsonValueSchema.parse({ kind: 'gmail_delivery', mode: parsed.sendMode, results }),
    };
  }
}

class AppsScriptDeployExecutor extends CloudNodeExecutor {
  constructor(
    context: WorkspaceContext,
    private readonly workspace: GoogleWorkspaceClient,
  ) {
    super(context, 'apps_script.deploy_template', 'external');
  }

  async execute(
    executionContext: Parameters<RegisteredWorkflowNodeExecutor['execute']>[0],
    input: JsonValue,
    config: JsonValue,
  ) {
    const parsed = z
      .object({
        connectionId: UuidSchema,
        deployment: z.enum(['api_executable', 'web_app']),
        template: z.enum(['email-order-summary', 'sheet-cost-summary', 'slides-executive-report']),
        title: z.string().trim().min(1).max(160),
      })
      .strict()
      .parse(config);
    await this.countTool(this.type);
    const parentId =
      parsed.template === 'slides-executive-report' ? appsScriptParentId(input) : undefined;
    const result = await this.workspace.deploySafeAppsScript(
      await this.token(parsed.connectionId, executionContext.signal),
      {
        ...(parentId === undefined ? {} : { parentId }),
        template: parsed.template as SafeAppsScriptTemplate,
        title: parsed.title,
      },
      executionContext.signal,
    );
    return { output: JsonValueSchema.parse({ kind: 'apps_script_deployment', ...result }) };
  }
}

function cloudRegistry(context: WorkspaceContext): NodeRegistry {
  const registry = new NodeRegistry();
  const workspace = new GoogleWorkspaceClient();
  const sheets = new GoogleSheetsClient({ operationStore: new InMemoryGoogleOperationStore() });
  const driveExcel = new GoogleDriveExcelClient({ sheetsClient: sheets });
  registry.register(new InlineDataExecutor(context));
  registry.register(new GmailReadExecutor(context, workspace));
  registry.register(new FormsReadExecutor(context, workspace));
  registry.register(new SheetsReadExecutor(context, sheets));
  registry.register(new DriveExcelFolderReadExecutor(context, driveExcel));
  registry.register(new DriveExcelReportCreateExecutor(context, driveExcel));
  registry.register(new AiSummarizeExecutor(context));
  registry.register(new ReportComposeExecutor(context));
  registry.register(new SlidesCreateExecutor(context, workspace));
  registry.register(new GmailSendExecutor(context, workspace));
  registry.register(new AppsScriptDeployExecutor(context, workspace));
  return registry;
}

export async function executeCloudWorkflowNode(
  context: WorkspaceContext,
  node: WorkflowNode,
  input: JsonValue,
  execution: {
    readonly idempotencyKey: string;
    readonly runId: string;
    readonly signal?: AbortSignal;
  },
) {
  const executor = cloudRegistry(context).get(node.type, node.version);
  const config = executor.validateConfig(node.config);
  return await executor.execute(
    {
      idempotencyKey: execution.idempotencyKey,
      mode: 'live',
      nodeId: node.id,
      now: () => new Date(),
      runId: execution.runId,
      signal: execution.signal ?? new AbortController().signal,
    },
    JsonValueSchema.parse(input),
    config,
  );
}

export async function executeCloudWorkflow(
  context: WorkspaceContext,
  workflow: Workflow,
  input: {
    readonly completedNodeOutputs?: Readonly<Record<string, JsonValue>>;
    readonly idempotencyKey: string;
    readonly onProgress?: (event: {
      readonly nodeId: string;
      readonly status: string;
    }) => Promise<void> | void;
    readonly runId: string;
  },
): Promise<WorkflowExecutionResult> {
  if (workflow.executionTarget.type !== 'cloud') {
    throw new WorkflowEngineError(
      'WORKFLOW_SCHEMA_INVALID',
      'Cloud execution requires a cloud workflow.',
    );
  }
  return await new WorkflowEngine(cloudRegistry(context)).execute(workflow, {
    approvedNodeIds: workflow.nodes.map((node) => node.id),
    ...(input.completedNodeOutputs === undefined
      ? {}
      : { completedNodeOutputs: input.completedNodeOutputs }),
    idempotencyKey: input.idempotencyKey,
    maxAttempts: 1,
    mode: 'live',
    ...(input.onProgress === undefined
      ? {}
      : {
          onProgress: async (event) => {
            await input.onProgress?.({ nodeId: event.nodeId, status: event.status });
          },
        }),
    runId: input.runId,
    stepTimeoutMs: CLOUD_STEP_TIMEOUT_MS,
  });
}

export interface DriveExcelBatchAdvanceResult {
  readonly checkpoint: DriveExcelCheckpoint;
  readonly completedOutput?: DriveExcelFolderResult;
}

export async function advanceDriveExcelBatch(
  context: WorkspaceContext,
  configInput: JsonValue,
  checkpointInput?: DriveExcelCheckpoint,
  signal?: AbortSignal,
): Promise<DriveExcelBatchAdvanceResult> {
  const config = DriveExcelReadConfigSchema.parse(configInput);
  await consumeMeteredAllowance(context, 'tool_call', 1, {
    operation: 'google_drive.read_excel_folder.batch',
  });
  await googleConnectionService().assertScopes(context.actor.tenantId, config.connectionId, [
    GOOGLE_DRIVE_READONLY_SCOPE,
  ]);
  const accessToken = await googleConnectionService().accessToken(
    context.actor.tenantId,
    config.connectionId,
    signal,
  );
  const sheets = new GoogleSheetsClient({ operationStore: new InMemoryGoogleOperationStore() });
  const driveExcel = new GoogleDriveExcelClient({ sheetsClient: sheets });
  const checkpoint =
    checkpointInput === undefined
      ? createDriveExcelCheckpoint(
          await driveExcel.discoverExcelFolder(
            accessToken,
            config.folderId,
            driveExcelReadOptions(config),
            signal,
          ),
        )
      : DriveExcelCheckpointSchema.parse(checkpointInput);
  const batchManifest = nextDriveExcelBatchManifest(checkpoint);
  if (batchManifest === undefined) {
    const completedOutput = completedDriveExcelOutput(checkpoint);
    return {
      checkpoint,
      ...(completedOutput === undefined ? {} : { completedOutput }),
    };
  }
  const batch = await driveExcel
    .readExcelManifest(accessToken, batchManifest, driveExcelReadOptions(config), signal)
    .catch((error: unknown) => {
      throw safeGoogleNodeFailure(error, 'drive_excel_source');
    });
  const nextCheckpoint = mergeDriveExcelCheckpoint(checkpoint, batch, config);
  const completedOutput = completedDriveExcelOutput(nextCheckpoint);
  return {
    checkpoint: nextCheckpoint,
    ...(completedOutput === undefined ? {} : { completedOutput }),
  };
}
