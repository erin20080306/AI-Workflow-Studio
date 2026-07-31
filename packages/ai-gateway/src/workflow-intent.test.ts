import { AIPlannerOutputSchema } from '@ai-workflow-studio/workflow-schema';
import { describe, expect, it } from 'vitest';

import type { PlannerRequest } from './types';
import { detectWorkflowIntent, validateWorkflowIntentCoverage } from './workflow-intent';

const CONNECTION_ID = '10000000-0000-4000-8000-000000000911';

const request: PlannerRequest = {
  context: {
    allowedFolderAliasIds: [],
    executionTarget: { type: 'cloud' },
    googleConnectionIds: [CONNECTION_ID],
    locale: 'zh-Hant',
    timezone: 'Asia/Taipei',
  },
  maxRepairAttempts: 1,
  prompt: '整理今日 Gmail，產生摘要報告，不要寄信',
};

describe('workflow intent coverage', () => {
  it('detects complete cloud requirements without treating a negated send as delivery', () => {
    expect(detectWorkflowIntent(request.prompt)).toEqual({
      needsDesktop: false,
      needsGoogleConnection: true,
      requiredNodeTypes: ['gmail.read', 'ai.summarize', 'report.compose'],
    });
  });

  it('accepts a connected Gmail summary and rejects missing or invented capabilities', () => {
    const output = AIPlannerOutputSchema.parse({
      assumptions: [],
      explanation: 'Read, summarize, and compose a report.',
      mappingProposals: [],
      workflow: {
        description: 'Daily Gmail report',
        edges: [
          { from: 'read_gmail', to: 'summarize' },
          { from: 'summarize', to: 'report' },
        ],
        executionTarget: { type: 'cloud' },
        name: 'Daily Gmail report',
        nodes: [
          {
            config: {
              connectionId: CONNECTION_ID,
              includeBody: true,
              maxMessages: 50,
              timeRange: 'today',
            },
            id: 'read_gmail',
            type: 'gmail.read',
            version: 1,
          },
          {
            config: {
              includeCaseStudy: false,
              includeRecommendations: true,
              language: 'zh-Hant',
              maxCharacters: 6_000,
              style: 'professional',
            },
            id: 'summarize',
            type: 'ai.summarize',
            version: 1,
          },
          {
            config: {
              format: 'markdown',
              includeReferences: true,
              title: 'Daily Gmail report',
            },
            id: 'report',
            type: 'report.compose',
            version: 1,
          },
        ],
        schemaVersion: 1,
        trigger: { config: {}, type: 'manual.trigger' },
      },
    });
    expect(validateWorkflowIntentCoverage(request, output)).toEqual([]);

    const missing = AIPlannerOutputSchema.parse({
      ...output,
      workflow: {
        ...output.workflow,
        edges: [],
        nodes: [output.workflow.nodes[0]],
      },
    });
    expect(validateWorkflowIntentCoverage(request, missing).map((issue) => issue.message)).toEqual([
      'The workflow does not cover the requested ai.summarize capability.',
      'The workflow does not cover the requested report.compose capability.',
    ]);

    const untrusted = AIPlannerOutputSchema.parse({
      ...output,
      workflow: {
        ...output.workflow,
        nodes: output.workflow.nodes.map((node) =>
          node.type === 'gmail.read'
            ? { ...node, config: { ...node.config, connectionId: crypto.randomUUID() } }
            : node,
        ),
      },
    });
    expect(validateWorkflowIntentCoverage(request, untrusted)).toEqual([
      expect.objectContaining({
        code: 'WORKFLOW_EXECUTION_TARGET_INVALID',
        nodeId: 'read_gmail',
      }),
    ]);
  });
});
