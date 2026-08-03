import { WorkflowSchema } from '@ai-workflow-studio/workflow-schema';
import { describe, expect, it } from 'vitest';

import {
  agentCloudClaimDisposition,
  agentCloudInputHash,
  agentCloudInputsEqual,
  immediateAgentCloudPredecessor,
} from './agent-cloud-step-state';

const DEVICE_ID = '10000000-0000-4000-8000-000000000001';
const FOLDER_ID = '10000000-0000-4000-8000-000000000002';

function workflow(edges: readonly { readonly from: string; readonly to: string }[]) {
  return WorkflowSchema.parse({
    description: 'A local profile followed by reviewed cloud steps.',
    edges,
    executionTarget: { deviceId: DEVICE_ID, type: 'desktop' },
    name: 'Cloud continuation order',
    nodes: [
      {
        config: {
          actions: ['save_workbook', 'verify_active_workbook'],
          application: 'excel',
          folderAliasId: FOLDER_ID,
        },
        id: 'review_workbook',
        type: 'excel.visible_review',
        version: 1,
      },
      {
        config: {
          includeCaseStudy: false,
          includeRecommendations: true,
          language: 'zh-Hant',
          maxCharacters: 6_000,
          provider: 'auto',
          style: 'professional',
          tier: 'auto',
        },
        id: 'summarize_workbook',
        type: 'ai.summarize',
        version: 1,
      },
      {
        config: {
          format: 'markdown',
          includeReferences: true,
          title: 'Safe report',
        },
        id: 'compose_report',
        type: 'report.compose',
        version: 1,
      },
    ],
    schemaVersion: 1,
    trigger: { config: {}, type: 'manual.trigger' },
  });
}

describe('Agent cloud continuation state', () => {
  it('requires exactly one reviewed immediate predecessor', () => {
    expect(
      immediateAgentCloudPredecessor(
        workflow([{ from: 'review_workbook', to: 'summarize_workbook' }]),
        'summarize_workbook',
      ),
    ).toMatchObject({ id: 'review_workbook', type: 'excel.visible_review' });

    expect(() => immediateAgentCloudPredecessor(workflow([]), 'summarize_workbook')).toThrow(
      /exactly one/u,
    );
    expect(() =>
      immediateAgentCloudPredecessor(
        workflow([
          { from: 'review_workbook', to: 'summarize_workbook' },
          { from: 'compose_report', to: 'summarize_workbook' },
        ]),
        'summarize_workbook',
      ),
    ).toThrow(/exactly one/u);
  });

  it('binds cloud input to the exact predecessor output independent of object key order', () => {
    const stored = {
      kind: 'ai_summary',
      model: 'gpt-test',
      provider: 'openai',
      text: 'approved summary',
    };
    expect(
      agentCloudInputsEqual(stored, {
        text: 'approved summary',
        provider: 'openai',
        model: 'gpt-test',
        kind: 'ai_summary',
      }),
    ).toBe(true);
    expect(agentCloudInputsEqual(stored, { ...stored, text: 'synthetic replacement' })).toBe(false);
  });

  it('allows only one pending-to-running claim and rejects active or changed input', () => {
    const inputHash = agentCloudInputHash({ kind: 'ai_summary', text: 'approved' });
    expect(agentCloudClaimDisposition({ inputSummary: {}, status: 'pending' }, inputHash)).toBe(
      'claim',
    );
    expect(
      agentCloudClaimDisposition(
        { inputSummary: { agentCloudInputHash: inputHash }, status: 'running' },
        inputHash,
      ),
    ).toBe('in_progress');
    expect(
      agentCloudClaimDisposition(
        { inputSummary: { agentCloudInputHash: inputHash }, status: 'succeeded' },
        inputHash,
      ),
    ).toBe('duplicate');
    expect(
      agentCloudClaimDisposition(
        { inputSummary: { agentCloudInputHash: '0'.repeat(64) }, status: 'running' },
        inputHash,
      ),
    ).toBe('input_conflict');
  });
});
