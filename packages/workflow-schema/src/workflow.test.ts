import { describe, expect, it } from 'vitest';

import { NODE_CATALOG } from './node-catalog';
import { AIPlannerOutputSchema, AgentHeartbeatSchema, AgentJobSchema } from './protocol';
import { summarizeWorkflowRisks, validateWorkflow } from './semantic';
import { WorkflowSchema, type Workflow } from './workflow';

const DEVICE_ID = '00000000-0000-4000-8000-000000000001';
const FOLDER_ID = '00000000-0000-4000-8000-000000000002';
const TENANT_ID = '00000000-0000-4000-8000-000000000003';
const WORKFLOW_ID = '00000000-0000-4000-8000-000000000004';
const VERSION_ID = '00000000-0000-4000-8000-000000000005';
const RUN_ID = '00000000-0000-4000-8000-000000000006';
const JOB_ID = '00000000-0000-4000-8000-000000000007';

function exampleWorkflow(): Workflow {
  return WorkflowSchema.parse({
    description: 'Create a new consolidated report without overwriting source files.',
    edges: [
      { from: 'list_files', to: 'read_excel' },
      { from: 'read_excel', to: 'deduplicate' },
      { from: 'deduplicate', to: 'create_report' },
    ],
    executionTarget: {
      deviceId: DEVICE_ID,
      type: 'desktop',
    },
    name: 'Daily order consolidation',
    nodes: [
      {
        config: {
          folderAliasId: FOLDER_ID,
          pattern: '*.xlsx',
        },
        id: 'list_files',
        type: 'folder.list_files',
        version: 1,
      },
      {
        config: {
          sheetMode: 'all',
        },
        id: 'read_excel',
        type: 'excel.read',
        version: 1,
      },
      {
        config: {
          keys: ['Order ID'],
        },
        id: 'deduplicate',
        type: 'data.deduplicate',
        version: 1,
      },
      {
        config: {
          folderAliasId: FOLDER_ID,
          outputName: 'consolidated-{{today}}.xlsx',
          overwrite: false,
          reportTitle: 'Consolidated orders',
        },
        id: 'create_report',
        type: 'excel.create_report',
        version: 1,
      },
    ],
    schemaVersion: 1,
    trigger: {
      config: {
        folderAliasId: FOLDER_ID,
        pattern: '*.xlsx',
      },
      type: 'folder.file_created',
    },
  });
}

describe('WorkflowSchema', () => {
  it('parses a safe, versioned desktop workflow and applies bounded defaults', () => {
    const workflow = exampleWorkflow();

    expect(workflow.schemaVersion).toBe(1);
    expect(workflow.nodes).toHaveLength(4);
    expect(workflow.nodes[1]).toMatchObject({
      config: {
        maxRows: 100_000,
        maxSheets: 50,
        sheetMode: 'all',
      },
      type: 'excel.read',
    });
  });

  it('rejects unknown nodes before semantic validation', () => {
    const unknownWorkflow = {
      ...exampleWorkflow(),
      nodes: [
        {
          config: {},
          id: 'shell',
          type: 'shell.execute',
          version: 1,
        },
      ],
      edges: [],
    };

    const result = validateWorkflow(unknownWorkflow);
    expect(result.success).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'WORKFLOW_SCHEMA_INVALID')).toBe(true);
  });

  it('rejects path traversal in folder patterns', () => {
    const workflow = exampleWorkflow();
    const unsafeWorkflow = {
      ...workflow,
      nodes: workflow.nodes.map((node) =>
        node.id === 'list_files'
          ? {
              ...node,
              config: {
                folderAliasId: FOLDER_ID,
                pattern: '../*.xlsx',
              },
            }
          : node,
      ),
    };

    expect(validateWorkflow(unsafeWorkflow).success).toBe(false);
  });

  it('registers exactly the first-version allowlist with no duplicate type/version pairs', () => {
    const keys = NODE_CATALOG.map((node) => `${node.type}@${node.version}`);
    expect(NODE_CATALOG).toHaveLength(38);
    expect(new Set(keys).size).toBe(38);
  });

  it('accepts a bounded cloud Drive Excel consolidation with an approval-gated report', () => {
    const workflow = WorkflowSchema.parse({
      description: 'Read and consolidate approved Drive workbooks.',
      edges: [{ from: 'read_drive', to: 'write_report' }],
      executionTarget: { type: 'cloud' },
      name: 'Drive Excel consolidation',
      nodes: [
        {
          config: {
            connectionId: '00000000-0000-4000-8000-000000000009',
            folderId: '1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ',
          },
          id: 'read_drive',
          type: 'google_drive.read_excel_folder',
          version: 1,
        },
        {
          config: {
            connectionId: '00000000-0000-4000-8000-000000000009',
            folderId: '1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ',
            outputName: 'AI-cost-summary.xlsx',
            overwrite: false,
          },
          id: 'write_report',
          type: 'google_drive.create_excel_report',
          version: 1,
        },
      ],
      schemaVersion: 1,
      trigger: { config: {}, type: 'manual.trigger' },
    });

    expect(validateWorkflow(workflow)).toMatchObject({ issues: [], success: true });
    expect(summarizeWorkflowRisks(workflow).requiresApproval).toBe(true);
  });

  it('accepts a bounded inline source feeding an AI summary and report', () => {
    const workflow = WorkflowSchema.parse({
      description: 'Summarize approved inline business data.',
      edges: [
        { from: 'source', to: 'summary' },
        { from: 'summary', to: 'report' },
      ],
      executionTarget: { type: 'cloud' },
      name: 'Inline AI report',
      nodes: [
        {
          config: { content: '12 orders, revenue 86,500, 3 pending confirmation.' },
          id: 'source',
          type: 'data.inline',
          version: 1,
        },
        {
          config: { language: 'zh-Hant', provider: 'anthropic', tier: 'standard' },
          id: 'summary',
          type: 'ai.summarize',
          version: 1,
        },
        {
          config: { format: 'markdown', includeReferences: false, title: '營運摘要' },
          id: 'report',
          type: 'report.compose',
          version: 1,
        },
      ],
      schemaVersion: 1,
      trigger: { config: {}, type: 'manual.trigger' },
    });

    expect(validateWorkflow(workflow)).toMatchObject({ issues: [], success: true });
    expect(workflow.nodes.map((node) => node.type)).toEqual([
      'data.inline',
      'ai.summarize',
      'report.compose',
    ]);
  });

  it('keeps the selected AI provider and model level inside a validated summary node', () => {
    const workflow = WorkflowSchema.parse({
      description: 'Read Gmail and summarize the selected messages.',
      edges: [
        { from: 'read_mail', to: 'summarize' },
        { from: 'summarize', to: 'compose_report' },
      ],
      executionTarget: { type: 'cloud' },
      name: 'Gmail summary',
      nodes: [
        {
          config: {
            connectionId: '00000000-0000-4000-8000-000000000009',
            timeRange: 'today',
          },
          id: 'read_mail',
          type: 'gmail.read',
          version: 1,
        },
        {
          config: { provider: 'anthropic', tier: 'flagship' },
          id: 'summarize',
          type: 'ai.summarize',
          version: 1,
        },
        {
          config: { title: 'Daily summary' },
          id: 'compose_report',
          type: 'report.compose',
          version: 1,
        },
      ],
      schemaVersion: 1,
      trigger: { config: {}, type: 'manual.trigger' },
    });

    expect(workflow.nodes[1]).toMatchObject({
      config: { provider: 'anthropic', tier: 'flagship' },
      type: 'ai.summarize',
    });
  });
});

describe('workflow semantic validation', () => {
  it('accepts a connected acyclic workflow', () => {
    const result = validateWorkflow(exampleWorkflow());
    expect(result).toMatchObject({
      issues: [],
      success: true,
    });
  });

  it('rejects cycles', () => {
    const workflow = exampleWorkflow();
    const result = validateWorkflow({
      ...workflow,
      edges: [...workflow.edges, { from: 'create_report', to: 'list_files' }],
    });

    expect(result.success).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'WORKFLOW_CYCLE_DETECTED')).toBe(true);
  });

  it('rejects edges with missing nodes', () => {
    const workflow = exampleWorkflow();
    const result = validateWorkflow({
      ...workflow,
      edges: [...workflow.edges, { from: 'missing', to: 'read_excel' }],
    });

    expect(result.success).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'WORKFLOW_EDGE_INVALID')).toBe(true);
  });

  it('rejects disconnected nodes', () => {
    const workflow = exampleWorkflow();
    const result = validateWorkflow({
      ...workflow,
      edges: workflow.edges.slice(0, 2),
    });

    expect(result.success).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'WORKFLOW_DISCONNECTED')).toBe(true);
  });

  it('rejects local file nodes assigned to a cloud target', () => {
    const workflow = exampleWorkflow();
    const result = validateWorkflow({
      ...workflow,
      executionTarget: { type: 'cloud' },
    });

    expect(result.success).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'WORKFLOW_EXECUTION_TARGET_INVALID')).toBe(
      true,
    );
  });

  it('classifies write nodes and marks approval requirements', () => {
    const summary = summarizeWorkflowRisks(exampleWorkflow());

    expect(summary.read.map((node) => node.nodeId)).toEqual([
      'list_files',
      'read_excel',
      'deduplicate',
    ]);
    expect(summary.write.map((node) => node.nodeId)).toEqual(['create_report']);
    expect(summary.destructive).toEqual([]);
    expect(summary.requiresApproval).toBe(true);
  });
});

describe('workflow protocol schemas', () => {
  it('validates planner output only when it contains a valid workflow', () => {
    expect(
      AIPlannerOutputSchema.parse({
        explanation: 'Reads approved files, removes duplicates, and creates a new report.',
        workflow: exampleWorkflow(),
      }),
    ).toMatchObject({
      assumptions: [],
      mappingProposals: [],
    });
  });

  it('validates agent jobs and heartbeats with strict UUID and timestamp fields', () => {
    expect(
      AgentHeartbeatSchema.parse({
        agentVersion: '0.1.0',
        deviceId: DEVICE_ID,
        executorRunning: true,
        occurredAt: '2026-07-26T05:00:00.000Z',
        requestTimestamp: '2026-07-26T05:00:00.000Z',
        tenantId: TENANT_ID,
      }),
    ).toMatchObject({ deviceId: DEVICE_ID, executorRunning: true });

    expect(
      AgentJobSchema.parse({
        availableAt: '2026-07-26T05:00:00.000Z',
        deviceId: DEVICE_ID,
        id: JOB_ID,
        idempotencyKey: 'job-key-0001',
        status: 'pending',
        tenantId: TENANT_ID,
        workflow: exampleWorkflow(),
        workflowRunId: RUN_ID,
      }),
    ).toMatchObject({
      attempt: 0,
      maxAttempts: 3,
      tenantId: TENANT_ID,
    });

    expect(
      WorkflowSchema.safeParse({ workflowId: WORKFLOW_ID, versionId: VERSION_ID }).success,
    ).toBe(false);
  });
});
