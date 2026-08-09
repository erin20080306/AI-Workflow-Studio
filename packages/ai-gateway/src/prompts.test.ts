import { describe, expect, it } from 'vitest';

import { parseStrictPlannerOutput } from './json';
import {
  buildPlannerSafeFallback,
  buildPlannerShapeExample,
  buildPlannerUserPrompt,
} from './prompts';
import type { PlannerRequest } from './types';
import { validateWorkflowIntentCoverage } from './workflow-intent';

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

  it('keeps cloud Drive Excel planning at the selected folder by default without changing the node sequence', () => {
    const googleRequest: PlannerRequest = {
      ...request,
      context: {
        ...request.context,
        googleConnectionIds: ['10000000-0000-4000-8000-000000000911'],
      },
      prompt:
        '讀取 https://drive.google.com/drive/folders/1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ 內 Excel，匯總成一份 Excel，產生摘要報告、5 頁 Google Slides 與核准型 GAS。',
    };
    const example = buildPlannerShapeExample(googleRequest);

    expect(example.workflow.nodes.map((node) => node.type)).toEqual([
      'google_drive.read_excel_folder',
      'google_drive.create_excel_report',
      'ai.summarize',
      'report.compose',
      'google_slides.create',
      'apps_script.deploy_template',
    ]);
    expect(example.workflow.nodes[0]).toMatchObject({
      config: { includeSubfolders: false },
      type: 'google_drive.read_excel_folder',
    });
    expect(parseStrictPlannerOutput(JSON.stringify(example)).success).toBe(true);
  });

  it('keeps subfolder traversal disabled when the prompt explicitly rejects recursion', () => {
    const googleRequest: PlannerRequest = {
      ...request,
      context: {
        ...request.context,
        googleConnectionIds: ['10000000-0000-4000-8000-000000000911'],
      },
      prompt:
        '讀取 https://drive.google.com/drive/folders/1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ 內 Excel 並匯總，不遞迴讀取子資料夾。',
    };
    const example = buildPlannerShapeExample(googleRequest);

    expect(example.workflow.nodes[0]).toMatchObject({
      config: { includeSubfolders: false },
      type: 'google_drive.read_excel_folder',
    });
  });

  it.each([
    ['Traditional Chinese', '並連同所有子資料夾'],
    ['Simplified Chinese', '并包括所有子文件夹'],
    ['English', 'including all nested folders recursively'],
  ])(
    'enables cloud Drive subfolder traversal only when explicitly requested in %s',
    (_language, traversalRequest) => {
      const googleRequest: PlannerRequest = {
        ...request,
        context: {
          ...request.context,
          googleConnectionIds: ['10000000-0000-4000-8000-000000000911'],
        },
        prompt: `讀取 https://drive.google.com/drive/folders/1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ 內 Excel，${traversalRequest}，匯總成一份 Excel，產生摘要報告、5 頁 Google Slides 與核准型 GAS。`,
      };
      const example = buildPlannerShapeExample(googleRequest);

      expect(example.workflow.nodes.map((node) => node.type)).toEqual([
        'google_drive.read_excel_folder',
        'google_drive.create_excel_report',
        'ai.summarize',
        'report.compose',
        'google_slides.create',
        'apps_script.deploy_template',
      ]);
      expect(example.workflow.nodes[0]).toMatchObject({
        config: { includeSubfolders: true },
        type: 'google_drive.read_excel_folder',
      });
      expect(parseStrictPlannerOutput(JSON.stringify(example)).success).toBe(true);
    },
  );

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

  it('grounds a Drive Excel folder into report, Slides, and approval-gated GAS nodes', () => {
    const googleRequest: PlannerRequest = {
      ...request,
      context: {
        ...request.context,
        allowedFolderAliasIds: ['10000000-0000-4000-8000-000000000912'],
        executionTarget: {
          deviceId: '10000000-0000-4000-8000-000000000913',
          type: 'desktop',
        },
        googleConnectionIds: ['10000000-0000-4000-8000-000000000911'],
      },
      prompt:
        '從 https://drive.google.com/drive/folders/1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ 下載 Excel 到已核准資料夾，在本機匯總成一份 Excel 並開啟結果。',
    };
    const example = buildPlannerShapeExample(googleRequest);

    expect(example.workflow.executionTarget).toEqual({
      deviceId: '10000000-0000-4000-8000-000000000913',
      type: 'desktop',
    });
    expect(example.workflow.nodes.map((node) => node.type)).toEqual([
      'google_drive.download_excel_folder',
      'excel.read',
      'excel.merge',
      'excel.create_report',
      'excel.visible_review',
    ]);
    expect(example.workflow.edges).toEqual([
      { from: 'download_drive_workbooks', to: 'read_local_workbooks' },
      { from: 'read_local_workbooks', to: 'merge_local_workbooks' },
      { from: 'merge_local_workbooks', to: 'create_local_report' },
      { from: 'create_local_report', to: 'open_excel_result' },
    ]);
    expect(example.workflow.nodes[0]).toMatchObject({
      config: {
        connectionId: '10000000-0000-4000-8000-000000000911',
        folderAliasId: '10000000-0000-4000-8000-000000000912',
        folderId: '1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ',
        includeSubfolders: false,
        maxFileSizeBytes: 20_000_000,
        maxFiles: 500,
      },
      type: 'google_drive.download_excel_folder',
    });
    expect(example.workflow.nodes.at(-1)).toMatchObject({
      config: {
        actions: ['autofit_used_range', 'save_workbook', 'verify_active_workbook'],
        application: 'excel',
      },
      type: 'excel.visible_review',
    });
    expect(parseStrictPlannerOutput(JSON.stringify(example)).success).toBe(true);
  });

  it('continues an API-transferred Downloads-folder consolidation into platform summary, Slides, and GAS', () => {
    const hybridRequest: PlannerRequest = {
      ...request,
      context: {
        ...request.context,
        allowedFolderAliasIds: ['10000000-0000-4000-8000-000000000912'],
        executionTarget: {
          deviceId: '10000000-0000-4000-8000-000000000913',
          type: 'desktop',
        },
        googleConnectionIds: ['10000000-0000-4000-8000-000000000911'],
      },
      prompt:
        '開啟 https://drive.google.com/drive/folders/1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ 雲端資料夾，把 Excel 下載到下載項目並整合，產生摘要報告、8 頁 Google Slides 與核准型 GAS。',
    };
    const example = buildPlannerShapeExample(hybridRequest);

    expect(example.workflow.executionTarget).toEqual({
      deviceId: '10000000-0000-4000-8000-000000000913',
      type: 'desktop',
    });
    expect(example.workflow.nodes.map((node) => node.type)).toEqual([
      'google_drive.download_excel_folder',
      'excel.read',
      'excel.merge',
      'excel.create_report',
      'excel.visible_review',
      'ai.summarize',
      'report.compose',
      'google_slides.create',
      'apps_script.deploy_template',
    ]);
    expect(example.workflow.nodes[0]).toMatchObject({
      config: {
        connectionId: '10000000-0000-4000-8000-000000000911',
        folderAliasId: '10000000-0000-4000-8000-000000000912',
        folderId: '1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ',
        includeSubfolders: false,
      },
      type: 'google_drive.download_excel_folder',
    });
    expect(
      example.workflow.nodes.find((node) => node.type === 'google_slides.create'),
    ).toMatchObject({
      config: {
        connectionId: '10000000-0000-4000-8000-000000000911',
        folderId: '1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ',
        maxSlides: 8,
      },
    });
    expect(example.workflow.nodes.at(-1)).toMatchObject({
      config: { template: 'slides-executive-report' },
      type: 'apps_script.deploy_template',
    });
    expect(parseStrictPlannerOutput(JSON.stringify(example)).success).toBe(true);
  });

  it('grounds the visible Codex Chrome request through local Excel before the path-free cloud continuation', () => {
    const downloadsAliasId = '10000000-0000-4000-8000-000000000912';
    const connectionId = '10000000-0000-4000-8000-000000000911';
    const visibleCodexRequest: PlannerRequest = {
      ...request,
      context: {
        ...request.context,
        allowedFolderAliasIds: [downloadsAliasId],
        executionTarget: {
          deviceId: '10000000-0000-4000-8000-000000000913',
          type: 'desktop',
        },
        googleConnectionIds: [connectionId],
      },
      prompt:
        '使用可見 Codex 模式開啟 Chrome，從 https://drive.google.com/drive/folders/1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ 下載 Excel，在我的電腦安全整合，再將不含原始資料的統計摘要交回雲端產生報告、Slides 與 GAS 簡報。',
    };
    const example = buildPlannerShapeExample(visibleCodexRequest);

    expect(example.workflow.executionTarget).toEqual({
      deviceId: '10000000-0000-4000-8000-000000000913',
      type: 'desktop',
    });
    const nodeTypes = example.workflow.nodes.map((node) => node.type);
    expect(nodeTypes).toEqual([
      'google_drive.visible_download_folder',
      'excel.read',
      'excel.merge',
      'excel.create_report',
      'excel.visible_review',
      'ai.summarize',
      'report.compose',
      'google_slides.create',
      'apps_script.deploy_template',
    ]);
    expect(nodeTypes).not.toContain('google_drive.read_excel_folder');
    expect(nodeTypes).not.toContain('google_drive.create_excel_report');
    expect(example.workflow.edges).toEqual([
      { from: 'download_drive_workbooks', to: 'read_local_workbooks' },
      { from: 'read_local_workbooks', to: 'merge_local_workbooks' },
      { from: 'merge_local_workbooks', to: 'create_local_report' },
      { from: 'create_local_report', to: 'open_excel_result' },
      { from: 'open_excel_result', to: 'summarize_local_result' },
      { from: 'summarize_local_result', to: 'compose_local_result_report' },
      { from: 'compose_local_result_report', to: 'create_result_slides' },
      { from: 'create_result_slides', to: 'deploy_result_apps_script' },
    ]);
    expect(example.workflow.nodes[0]).toMatchObject({
      config: {
        browser: 'chrome',
        downloadTimeoutSeconds: 600,
        folderAliasId: downloadsAliasId,
        folderId: '1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ',
        maxFileSizeBytes: 50_000_000,
        maxFiles: 500,
      },
      type: 'google_drive.visible_download_folder',
    });
    expect(example.workflow.nodes[1]).toMatchObject({
      config: {
        maxFileSizeBytes: 20_000_000,
        maxRows: 100_000,
        maxSheets: 200,
      },
      type: 'excel.read',
    });
    expect(example.workflow.nodes[2]).toMatchObject({
      config: { columnMode: 'union', includeSourceFile: true },
      type: 'excel.merge',
    });
    expect(example.workflow.nodes[3]).toMatchObject({
      config: { folderAliasId: downloadsAliasId, overwrite: false },
      type: 'excel.create_report',
    });
    expect(example.workflow.nodes[4]).toMatchObject({
      config: {
        actions: ['autofit_used_range', 'save_workbook', 'verify_active_workbook'],
        application: 'excel',
        folderAliasId: downloadsAliasId,
      },
      type: 'excel.visible_review',
    });
    expect(example.workflow.nodes[5]).toMatchObject({
      config: { maxCharacters: 6_000, provider: 'auto', tier: 'auto' },
      type: 'ai.summarize',
    });
    expect(example.workflow.nodes[7]).toMatchObject({
      config: {
        connectionId,
        folderId: '1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ',
        maxSlides: 10,
      },
      type: 'google_slides.create',
    });
    expect(example.workflow.nodes[8]).toMatchObject({
      config: {
        connectionId,
        deployment: 'api_executable',
        template: 'slides-executive-report',
      },
      type: 'apps_script.deploy_template',
    });
    expect(example.assumptions).toContain(
      'Only a bounded path-free statistical profile of the consolidated workbook is relayed to approved cloud report steps; the local workbook and absolute paths remain on the Desktop Agent.',
    );
    expect(parseStrictPlannerOutput(JSON.stringify(example)).success).toBe(true);
  });

  it('preserves source worksheets when the request asks for many tabs', () => {
    const multiSheetRequest: PlannerRequest = {
      ...request,
      context: {
        ...request.context,
        allowedFolderAliasIds: ['10000000-0000-4000-8000-000000000914'],
        executionTarget: {
          deviceId: '10000000-0000-4000-8000-000000000915',
          type: 'desktop',
        },
        googleConnectionIds: ['10000000-0000-4000-8000-000000000916'],
      },
      prompt:
        '從 https://drive.google.com/drive/folders/1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ 下載報價 Excel，在一個 Excel 檔案保留每個來源工作表，各自成為很多分頁，並建立摘要與簡報。',
    };
    const example = buildPlannerShapeExample(multiSheetRequest);
    expect(example.workflow.nodes.find((node) => node.type === 'excel.merge')).toMatchObject({
      config: { layout: 'separate_sheets' },
    });
    // A many-tabs request produces the formatting-preserving combine node
    // (LibreOffice + ExcelJS) instead of the value-only create_report write.
    const combineNode = example.workflow.nodes.find(
      (node) => node.type === 'excel.combine_workbooks',
    );
    expect(combineNode).toMatchObject({ config: { overwrite: false } });
    expect(example.workflow.nodes.some((node) => node.type === 'excel.create_report')).toBe(false);
    expect(validateWorkflowIntentCoverage(multiSheetRequest, example)).toEqual([]);
    expect(parseStrictPlannerOutput(JSON.stringify(example)).success).toBe(true);
  });

  it('adds the required summary and report predecessors for a visible Slides-only request', () => {
    const visibleSlidesRequest: PlannerRequest = {
      ...request,
      context: {
        ...request.context,
        allowedFolderAliasIds: ['10000000-0000-4000-8000-000000000912'],
        executionTarget: {
          deviceId: '10000000-0000-4000-8000-000000000913',
          type: 'desktop',
        },
        googleConnectionIds: ['10000000-0000-4000-8000-000000000911'],
      },
      prompt:
        '使用可見 Codex 模式開啟 Chrome，從 https://drive.google.com/drive/folders/1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ 下載並整合 Excel，然後建立 Google Slides。',
    };

    const example = buildPlannerShapeExample(visibleSlidesRequest);

    expect(example.workflow.nodes.map((node) => node.type)).toEqual([
      'google_drive.visible_download_folder',
      'excel.read',
      'excel.merge',
      'excel.create_report',
      'excel.visible_review',
      'ai.summarize',
      'report.compose',
      'google_slides.create',
    ]);
    expect(parseStrictPlannerOutput(JSON.stringify(example)).success).toBe(true);
  });

  it('closes a visible GAS-only request over summary and report without inventing Slides', () => {
    const visibleGasRequest: PlannerRequest = {
      ...request,
      context: {
        ...request.context,
        allowedFolderAliasIds: ['10000000-0000-4000-8000-000000000912'],
        executionTarget: {
          deviceId: '10000000-0000-4000-8000-000000000913',
          type: 'desktop',
        },
        googleConnectionIds: ['10000000-0000-4000-8000-000000000911'],
      },
      prompt:
        '使用可見 Codex 模式開啟 Chrome，從 https://drive.google.com/drive/folders/1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ 下載並整合 Excel，並部署核准型 GAS。',
    };

    const example = buildPlannerShapeExample(visibleGasRequest);

    expect(example.workflow.nodes.map((node) => node.type)).toEqual([
      'google_drive.visible_download_folder',
      'excel.read',
      'excel.merge',
      'excel.create_report',
      'excel.visible_review',
      'ai.summarize',
      'report.compose',
      'apps_script.deploy_template',
    ]);
    expect(example.workflow.nodes.at(-1)).toMatchObject({
      config: { template: 'sheet-cost-summary' },
      type: 'apps_script.deploy_template',
    });
    expect(parseStrictPlannerOutput(JSON.stringify(example)).success).toBe(true);
  });
});
