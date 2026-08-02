import { WorkflowNodeSchema } from '@ai-workflow-studio/workflow-schema';
import { describe, expect, it } from 'vitest';

import { type AgentCloudNode, validateAgentCloudStepInput } from './agent-cloud-step-schema';

function cloudNode(type: AgentCloudNode['type']): AgentCloudNode {
  const config =
    type === 'ai.summarize'
      ? {
          includeCaseStudy: false,
          includeRecommendations: true,
          language: 'zh-Hant',
          maxCharacters: 6_000,
          provider: 'mock',
          style: 'professional',
          tier: 'auto',
        }
      : type === 'report.compose'
        ? { format: 'markdown', includeReferences: true, title: 'AI report' }
        : type === 'google_slides.create'
          ? {
              connectionId: '10000000-0000-4000-8000-000000000911',
              includeImages: true,
              includeReferences: true,
              maxSlides: 8,
              title: 'AI Slides',
            }
          : {
              connectionId: '10000000-0000-4000-8000-000000000911',
              deployment: 'api_executable',
              template: 'slides-executive-report',
              title: 'Approved GAS',
            };
  return WorkflowNodeSchema.parse({ config, id: 'cloud_step', type, version: 1 }) as AgentCloudNode;
}

describe('Agent cloud continuation input', () => {
  it('accepts a bounded path-free Excel profile for the AI summary step', () => {
    expect(
      validateAgentCloudStepInput(cloudNode('ai.summarize'), {
        columns: [
          {
            name: 'Amount',
            nonEmptyCount: 2,
            numeric: {
              count: 2,
              maximum: 200,
              minimum: 120,
              sum: 320,
              sumOverflowed: false,
            },
            otherValueCount: 0,
            topValues: [],
          },
        ],
        fileCount: 1,
        kind: 'desktop_excel_profile',
        rowCount: 2,
        sheetCount: 1,
        sheetNames: ['Orders'],
        truncatedColumns: 0,
        truncatedSheetNames: 0,
      }),
    ).toMatchObject({ kind: 'desktop_excel_profile', rowCount: 2 });
  });

  it('rejects raw local paths and predecessor-result substitution', () => {
    expect(() =>
      validateAgentCloudStepInput(cloudNode('ai.summarize'), {
        columns: [],
        fileCount: 1,
        kind: 'desktop_excel_profile',
        localPath: '/Users/customer/Downloads/private.xlsx',
        rowCount: 0,
        sheetCount: 0,
        sheetNames: [],
        truncatedColumns: 0,
        truncatedSheetNames: 0,
      }),
    ).toThrow();
    expect(() =>
      validateAgentCloudStepInput(cloudNode('google_slides.create'), {
        kind: 'ai_summary',
        model: 'test-model',
        provider: 'mock',
        text: 'This must pass through report.compose first.',
      }),
    ).toThrow();
  });
});
