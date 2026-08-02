import { describe, expect, it } from 'vitest';

import {
  localizeActorType,
  localizeAuditAction,
  localizeComputerUseAction,
  localizeNotification,
  localizeRunStep,
  localizeWorkflowName,
} from './run-details-i18n';

describe('run details localization', () => {
  it('switches the accepted workflow and its steps between Traditional Chinese and English', () => {
    expect(localizeWorkflowName('AI 日營運摘要與報告', 'en')).toBe(
      'AI daily operations summary and report',
    );
    expect(localizeWorkflowName('AI daily operations summary and report', 'zh-Hant')).toBe(
      'AI 日營運摘要與報告',
    );
    expect(localizeRunStep('inline_source', 'data.inline', 'zh-Hant')).toBe('需求資料來源');
    expect(localizeRunStep('ai_summarize', 'ai.summarize', 'zh-Hant')).toBe('AI 摘要');
    expect(localizeRunStep('compose_report', 'report.compose', 'en')).toBe('Compose report');
  });

  it('turns stored audit codes and actors into readable bilingual labels', () => {
    expect(localizeAuditAction('cloud_run.created', 'zh-Hant')).toBe('已建立雲端執行');
    expect(localizeAuditAction('run.running', 'zh-Hant')).toBe('開始執行');
    expect(localizeAuditAction('cloud_run.succeeded', 'en')).toBe('Cloud run succeeded');
    expect(localizeAuditAction('agent_cloud_step.succeeded', 'zh-Hant')).toBe(
      '已完成核准的雲端續接步驟',
    );
    expect(localizeComputerUseAction('drive.verify_download', 'zh-Hant')).toBe(
      '正在驗證完成的本機下載',
    );
    expect(localizeActorType('user', 'zh-Hant')).toBe('使用者');
    expect(localizeActorType('system', 'en')).toBe('System');
  });

  it('localizes existing English production notifications without mutating stored records', () => {
    expect(
      localizeNotification(
        'Cloud workflow completed',
        'The cloud workflow completed all validated steps.',
        'zh-Hant',
      ),
    ).toEqual({
      message: '雲端工作流已完成所有通過驗證的步驟。',
      title: '雲端工作流執行完成',
    });
    expect(
      localizeNotification(
        'Workflow run completed',
        'Open Run details to review the metadata-only execution summary.',
        'zh-Hant',
      ),
    ).toEqual({
      message: '開啟執行詳情，以檢視僅含中繼資料的執行摘要。',
      title: '工作流執行完成',
    });
  });

  it('localizes existing Chinese notifications for English users', () => {
    expect(localizeNotification('需要執行核准', '未派送任何 Desktop Job。', 'en')).toEqual({
      message: 'No Desktop Job was dispatched.',
      title: 'Workflow approval required',
    });
    expect(
      localizeNotification('工作流執行完成', 'AI 日營運摘要與報告 已成功完成。', 'en'),
    ).toEqual({
      message: 'AI daily operations summary and report completed successfully.',
      title: 'Workflow run completed',
    });
    expect(
      localizeNotification('Desktop Job 派送失敗', 'Run 尚未執行，可在連線恢復後重試。', 'en'),
    ).toEqual({
      message: 'The Run has not executed. Retry after the connection is restored.',
      title: 'Desktop Job dispatch failed',
    });
  });

  it('preserves unknown customer-defined names and future event values', () => {
    expect(localizeWorkflowName('Erin 月報', 'en')).toBe('Erin 月報');
    expect(localizeRunStep('customer_step', 'customer.future_node', 'zh-Hant')).toBe(
      'customer_step',
    );
    expect(localizeAuditAction('future.event', 'zh-Hant')).toBe('future.event');
    expect(localizeActorType('integration', 'en')).toBe('integration');
    expect(localizeNotification('自訂通知', '自訂內容', 'en')).toEqual({
      message: '自訂內容',
      title: '自訂通知',
    });
  });
});
