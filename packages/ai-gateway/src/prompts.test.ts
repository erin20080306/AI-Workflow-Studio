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

  it('grounds a connected Gmail report, Slides, and self-review draft request', () => {
    const googleRequest: PlannerRequest = {
      ...request,
      context: {
        ...request.context,
        googleConnectionIds: ['10000000-0000-4000-8000-000000000911'],
      },
      prompt:
        '讀取今天 Gmail 郵件，產生繁體中文摘要與報告，建立 5 頁 Google Slides，最後建立寄給 owner@example.com 的草稿，不要直接寄送。',
    };
    const example = buildPlannerShapeExample(googleRequest);

    expect(example.workflow.nodes.map((node) => node.type)).toEqual([
      'gmail.read',
      'ai.summarize',
      'report.compose',
      'google_slides.create',
      'gmail.send',
    ]);
    expect(example.workflow.edges).toEqual([
      { from: 'read_gmail', to: 'summarize_sources' },
      { from: 'summarize_sources', to: 'compose_report' },
      { from: 'compose_report', to: 'create_slides' },
      { from: 'compose_report', to: 'deliver_report' },
    ]);
    expect(example.workflow.nodes.at(-1)).toMatchObject({
      config: { recipients: ['owner@example.com'], sendMode: 'draft' },
      type: 'gmail.send',
    });
    expect(parseStrictPlannerOutput(JSON.stringify(example)).success).toBe(true);
  });

  it('grounds a connected Sheets URL with a quoted sheet name and bounded range', () => {
    const googleRequest: PlannerRequest = {
      ...request,
      context: {
        ...request.context,
        googleConnectionIds: ['10000000-0000-4000-8000-000000000911'],
      },
      prompt:
        '讀取 Google 試算表 https://docs.google.com/spreadsheets/d/1dd6qUl0w0xBtkeIyLR8zGsiwI0378XMEePeekgjnuKw/edit 的「工作表1」A1:C20，產生摘要與報告。',
    };
    const example = buildPlannerShapeExample(googleRequest);

    expect(example.workflow.nodes.map((node) => node.type)).toEqual([
      'google_sheets.read',
      'ai.summarize',
      'report.compose',
    ]);
    expect(example.workflow.nodes[0]).toMatchObject({
      config: {
        range: "'工作表1'!A1:C20",
        sheetName: '工作表1',
        spreadsheetId: '1dd6qUl0w0xBtkeIyLR8zGsiwI0378XMEePeekgjnuKw',
      },
      type: 'google_sheets.read',
    });
    expect(parseStrictPlannerOutput(JSON.stringify(example)).success).toBe(true);
  });

  it('grounds an approved local Excel request with deterministic transformations and output', () => {
    const desktopRequest: PlannerRequest = {
      ...request,
      context: {
        ...request.context,
        allowedFolderAliasIds: ['10000000-0000-4000-8000-000000000825'],
        executionTarget: {
          deviceId: '10000000-0000-4000-8000-000000000824',
          type: 'desktop',
        },
      },
      prompt:
        '讀取已核准資料夾中的 orders.xlsx，依 Order ID 去除重複，依 Status 分組並加總 Amount，建立名為 phase47-summary.xlsx 的 Excel 報表。',
    };
    const example = buildPlannerShapeExample(desktopRequest);

    expect(example.workflow.nodes.map((node) => node.type)).toEqual([
      'folder.list_files',
      'excel.read',
      'data.deduplicate',
      'data.aggregate',
      'excel.create_report',
    ]);
    expect(example.workflow.nodes[0]).toMatchObject({
      config: {
        folderAliasId: '10000000-0000-4000-8000-000000000825',
        pattern: 'orders.xlsx',
      },
    });
    expect(example.workflow.nodes[2]).toMatchObject({
      config: { keys: ['Order ID'] },
    });
    expect(example.workflow.nodes[3]).toMatchObject({
      config: {
        groupBy: ['Status'],
        operations: [{ field: 'Amount', operation: 'sum' }],
      },
    });
    expect(example.workflow.nodes[4]).toMatchObject({
      config: { outputName: 'phase47-summary.xlsx', overwrite: false },
    });
    expect(parseStrictPlannerOutput(JSON.stringify(example)).success).toBe(true);
  });
});
