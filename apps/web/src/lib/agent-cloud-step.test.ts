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

const safeDesktopProfile = {
  columns: [
    {
      categorical: {
        sampledDistinctCount: 0,
        topFrequencies: [],
        unprofiledValueCount: 0,
      },
      id: 'column_1',
      nonEmptyCount: 5,
      numeric: {
        count: 5,
        statistics: {
          maximum: 200,
          minimum: 50,
          sum: 550,
          sumOverflowed: false,
        },
      },
      semanticHint: 'amount',
    },
  ],
  fileCount: 1,
  kind: 'desktop_excel_profile',
  rowCount: 5,
  sheetCount: 1,
  truncatedColumns: 0,
} as const;

describe('Agent cloud continuation input', () => {
  it('accepts a bounded path-free Excel profile for the AI summary step', () => {
    expect(
      validateAgentCloudStepInput(cloudNode('ai.summarize'), safeDesktopProfile),
    ).toMatchObject({ kind: 'desktop_excel_profile', rowCount: 5 });
  });

  it('accepts count-only profiles for the maximum visible workbook batch', () => {
    expect(
      validateAgentCloudStepInput(cloudNode('ai.summarize'), {
        columns: [],
        fileCount: 500,
        kind: 'desktop_excel_profile',
        rowCount: 0,
        sheetCount: 500,
        truncatedColumns: 0,
      }),
    ).toMatchObject({ fileCount: 500, sheetCount: 500 });
  });

  it('rejects raw spreadsheet labels and categorical values', () => {
    expect(() =>
      validateAgentCloudStepInput(cloudNode('ai.summarize'), {
        ...safeDesktopProfile,
        columns: [
          {
            ...safeDesktopProfile.columns[0],
            name: 'alice@example.com',
            topValues: [{ count: 2, value: 'private customer' }],
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects non-sequential column identifiers and inconsistent profile counts', () => {
    expect(() =>
      validateAgentCloudStepInput(cloudNode('ai.summarize'), {
        ...safeDesktopProfile,
        columns: [{ ...safeDesktopProfile.columns[0], id: 'column_2' }],
      }),
    ).toThrow();
    expect(() =>
      validateAgentCloudStepInput(cloudNode('ai.summarize'), {
        ...safeDesktopProfile,
        columns: [
          {
            ...safeDesktopProfile.columns[0],
            nonEmptyCount: 1,
            numeric: { ...safeDesktopProfile.columns[0].numeric, count: 2 },
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects exact numeric statistics for small cohorts and identifier columns', () => {
    expect(() =>
      validateAgentCloudStepInput(cloudNode('ai.summarize'), {
        ...safeDesktopProfile,
        columns: [
          {
            ...safeDesktopProfile.columns[0],
            nonEmptyCount: 1,
            numeric: {
              count: 1,
              statistics: {
                maximum: 987_654_321,
                minimum: 987_654_321,
                sum: 987_654_321,
                sumOverflowed: false,
              },
            },
          },
        ],
        rowCount: 1,
      }),
    ).toThrow();
    expect(() =>
      validateAgentCloudStepInput(cloudNode('ai.summarize'), {
        ...safeDesktopProfile,
        columns: [
          {
            ...safeDesktopProfile.columns[0],
            semanticHint: 'id',
          },
        ],
      }),
    ).toThrow();
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
        truncatedColumns: 0,
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
