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

  it('requires an inline source when a report request contains no external source', () => {
    expect(
      detectWorkflowIntent(
        '將「本日 12 筆訂單，營收 86,500 元」整理成繁體中文摘要並產生 Markdown 報告',
      ),
    ).toEqual({
      needsDesktop: false,
      needsGoogleConnection: false,
      requiredNodeTypes: ['data.inline', 'ai.summarize', 'report.compose'],
    });
  });

  it('routes a Google Drive Excel folder consolidation to cloud nodes instead of Desktop', () => {
    expect(
      detectWorkflowIntent(
        '讀取 https://drive.google.com/drive/folders/1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ 內 Excel，匯總成一份 Excel，產生摘要報告、5 頁 Google Slides 與核准型 GAS。',
      ),
    ).toEqual({
      needsDesktop: false,
      needsGoogleConnection: true,
      requiredNodeTypes: [
        'ai.summarize',
        'report.compose',
        'google_slides.create',
        'apps_script.deploy_template',
        'google_drive.read_excel_folder',
        'google_drive.create_excel_report',
      ],
    });
  });

  it('requires Desktop when a Drive Excel request explicitly asks for visible local Excel work', () => {
    expect(
      detectWorkflowIntent(
        '從 https://drive.google.com/drive/folders/1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ 下載 Excel 到已核准資料夾，在本機匯總成一份 Excel，完成後在 Microsoft Excel 可見開啟。',
      ),
    ).toEqual({
      needsDesktop: true,
      needsGoogleConnection: true,
      requiredNodeTypes: ['google_drive.read_excel_folder', 'google_drive.create_excel_report'],
    });
  });

  it('recognizes a Downloads-folder handoff with report artifacts as a mixed Desktop request', () => {
    expect(
      detectWorkflowIntent(
        '開啟 https://drive.google.com/drive/folders/1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ 雲端資料夾，把 Excel 下載到下載項目並整合，產生摘要報告、8 頁 Google Slides 與 GAS。',
      ),
    ).toEqual({
      needsDesktop: true,
      needsGoogleConnection: true,
      requiredNodeTypes: [
        'ai.summarize',
        'report.compose',
        'google_slides.create',
        'apps_script.deploy_template',
        'google_drive.read_excel_folder',
        'google_drive.create_excel_report',
      ],
    });
  });

  it('routes an explicit visible Codex Chrome handoff to the Desktop workflow', () => {
    expect(
      detectWorkflowIntent(
        '使用可見 Codex 模式開啟 Chrome，從 https://drive.google.com/drive/folders/1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ 下載 Excel，在我的電腦安全整合，再將不含原始資料的統計摘要交回雲端產生報告、Slides 與 GAS 簡報。',
      ),
    ).toEqual({
      needsDesktop: true,
      needsGoogleConnection: true,
      requiredNodeTypes: [
        'ai.summarize',
        'report.compose',
        'google_slides.create',
        'apps_script.deploy_template',
        'google_drive.read_excel_folder',
        'google_drive.create_excel_report',
      ],
    });
  });

  it('treats GAS 簡報 wording as both presentation and approved Apps Script output', () => {
    const intent = detectWorkflowIntent(
      '使用可見 Codex 模式開啟 Chrome，下載並整合 Drive Excel，再產生摘要與 GAS 簡報。',
    );

    expect(intent.requiredNodeTypes).toEqual(
      expect.arrayContaining([
        'ai.summarize',
        'report.compose',
        'google_slides.create',
        'apps_script.deploy_template',
      ]),
    );
  });

  it('closes a GAS-only request over summary and report without inventing Slides', () => {
    const intent = detectWorkflowIntent(
      '使用可見 Codex 模式開啟 Chrome，下載並整合 Drive Excel，並部署核准型 GAS。',
    );

    expect(intent.requiredNodeTypes).toEqual(
      expect.arrayContaining(['ai.summarize', 'report.compose', 'apps_script.deploy_template']),
    );
    expect(intent.requiredNodeTypes).not.toContain('google_slides.create');
    expect(intent.needsGoogleConnection).toBe(true);
  });

  it('does not invent Slides or Apps Script when both outputs are explicitly negated', () => {
    const intent = detectWorkflowIntent(
      '讀取 https://drive.google.com/drive/folders/1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ 內 Excel 並匯總，不要建立簡報，也不要部署 GAS。',
    );

    expect(intent.requiredNodeTypes).not.toContain('google_slides.create');
    expect(intent.requiredNodeTypes).not.toContain('apps_script.deploy_template');
    expect(intent.requiredNodeTypes).toContain('google_drive.read_excel_folder');
    expect(intent.requiredNodeTypes).toContain('google_drive.create_excel_report');
  });

  it('does not invent Gmail as a source when the request explicitly forbids email delivery', () => {
    const intent = detectWorkflowIntent(
      '讀取 https://drive.google.com/drive/folders/1Wf67U4l1VCWM6RkyFsvtYxe7YlArO1mQ 內 Excel，匯總成報表與 GAS，不要寄送郵件。',
    );

    expect(intent.requiredNodeTypes).not.toContain('gmail.read');
    expect(intent.requiredNodeTypes).not.toContain('gmail.send');
    expect(intent.requiredNodeTypes).toContain('google_drive.read_excel_folder');
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
