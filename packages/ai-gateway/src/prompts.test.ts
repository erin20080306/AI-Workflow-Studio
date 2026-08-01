import { describe, expect, it } from 'vitest';

import { parseStrictPlannerOutput } from './json';
import {
  buildPlannerSafeFallback,
  buildPlannerShapeExample,
  buildPlannerUserPrompt,
} from './prompts';
import type { PlannerRequest } from './types';

const request: PlannerRequest = {
  context: {
    allowedFolderAliasIds: [],
    executionTarget: { type: 'cloud' },
    googleConnectionIds: [],
    locale: 'zh-Hant',
    timezone: 'Asia/Taipei',
  },
  maxRepairAttempts: 1,
  prompt: '檢查已核准資料的必要欄位',
};

describe('planner prompts', () => {
  it('grounds short requests with a canonical valid and read-only shape', () => {
    expect(
      parseStrictPlannerOutput(JSON.stringify(buildPlannerShapeExample(request))).success,
    ).toBe(true);
    expect(buildPlannerUserPrompt(request)).toContain('"type":"data.validate"');
    expect(buildPlannerUserPrompt(request)).toContain('"type":"manual.trigger"');
  });

  it('builds a validated read-only fallback without releasing rejected content', () => {
    const fallback = buildPlannerSafeFallback(request, [
      {
        code: 'WORKFLOW_SCHEMA_INVALID',
        message: 'Unknown executable node',
        path: 'workflow.nodes.0.type',
      },
    ]);

    expect(parseStrictPlannerOutput(JSON.stringify(fallback)).success).toBe(true);
    expect(fallback.workflow.nodes).toMatchObject([
      { id: 'validate_input', type: 'data.validate' },
    ]);
    expect(JSON.stringify(fallback)).not.toContain('Unknown executable node');
  });

  it('grounds an inline summary request with an executable three-node shape', () => {
    const summaryRequest: PlannerRequest = {
      ...request,
      prompt: '將「本日 12 筆訂單，營收 86,500 元」整理成繁體中文摘要並產生報告',
    };
    const example = buildPlannerShapeExample(summaryRequest);

    expect(example.workflow.nodes.map((node) => node.type)).toEqual([
      'data.inline',
      'ai.summarize',
      'report.compose',
    ]);
    expect(example.workflow.edges).toHaveLength(2);
    expect(buildPlannerUserPrompt(summaryRequest)).toContain('"type":"data.inline"');
    expect(parseStrictPlannerOutput(JSON.stringify(example)).success).toBe(true);
  });
});
