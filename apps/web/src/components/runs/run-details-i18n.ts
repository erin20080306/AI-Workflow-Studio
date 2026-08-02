import type { AppLocale } from '@/components/language-provider';

interface LocalizedValue {
  readonly en: string;
  readonly 'zh-Hant': string;
}

const workflowNames: Readonly<Record<string, LocalizedValue>> = {
  'AI daily operations summary and report': {
    en: 'AI daily operations summary and report',
    'zh-Hant': 'AI 日營運摘要與報告',
  },
  'AI 日營運摘要與報告': {
    en: 'AI daily operations summary and report',
    'zh-Hant': 'AI 日營運摘要與報告',
  },
};

const nodeTypes: Readonly<Record<string, LocalizedValue>> = {
  'ai.summarize': { en: 'AI summary', 'zh-Hant': 'AI 摘要' },
  'apps_script.deploy_template': {
    en: 'Deploy Apps Script template',
    'zh-Hant': '部署 Apps Script 範本',
  },
  'data.aggregate': { en: 'Aggregate data', 'zh-Hant': '彙總資料' },
  'data.deduplicate': { en: 'Remove duplicates', 'zh-Hant': '移除重複資料' },
  'data.filter': { en: 'Filter data', 'zh-Hant': '篩選資料' },
  'data.group': { en: 'Group data', 'zh-Hant': '資料分組' },
  'data.inline': { en: 'Request source', 'zh-Hant': '需求資料來源' },
  'data.map_columns': { en: 'Map columns', 'zh-Hant': '對應欄位' },
  'data.sort': { en: 'Sort data', 'zh-Hant': '資料排序' },
  'data.validate': { en: 'Validate data', 'zh-Hant': '驗證資料' },
  'excel.create_report': { en: 'Create Excel report', 'zh-Hant': '建立 Excel 報告' },
  'excel.merge': { en: 'Merge Excel data', 'zh-Hant': '合併 Excel 資料' },
  'excel.open_file': { en: 'Open result in Excel', 'zh-Hant': '用 Excel 開啟結果' },
  'excel.visible_review': {
    en: 'Visibly review result in Excel',
    'zh-Hant': '在 Excel 畫面中檢視結果',
  },
  'excel.read': { en: 'Read Excel data', 'zh-Hant': '讀取 Excel 資料' },
  'excel.split_by_field': { en: 'Split Excel output', 'zh-Hant': '拆分 Excel 輸出' },
  'excel.write': { en: 'Write Excel file', 'zh-Hant': '寫入 Excel 檔案' },
  'folder.archive_file': { en: 'Archive file', 'zh-Hant': '封存檔案' },
  'folder.file_changed': { en: 'File changed trigger', 'zh-Hant': '檔案變更觸發' },
  'folder.file_created': { en: 'New file trigger', 'zh-Hant': '新增檔案觸發' },
  'folder.list_files': { en: 'List approved files', 'zh-Hant': '列出核准檔案' },
  'folder.move_file': { en: 'Move file', 'zh-Hant': '移動檔案' },
  'folder.rename_file': { en: 'Rename file', 'zh-Hant': '重新命名檔案' },
  'gmail.read': { en: 'Read Gmail messages', 'zh-Hant': '讀取 Gmail 郵件' },
  'gmail.send': { en: 'Create or send Gmail message', 'zh-Hant': '建立或寄送 Gmail 郵件' },
  'google_drive.download_excel_folder': {
    en: 'Download Drive workbooks to Desktop',
    'zh-Hant': '下載 Drive 活頁簿到本機',
  },
  'google_drive.visible_download_folder': {
    en: 'Visibly download Drive folder in Chrome',
    'zh-Hant': '在 Chrome 畫面中下載 Drive 資料夾',
  },
  'google_drive.create_excel_report': {
    en: 'Create Drive Excel report',
    'zh-Hant': '建立 Drive Excel 報告',
  },
  'google_drive.read_excel_folder': {
    en: 'Read Drive Excel folder',
    'zh-Hant': '讀取 Drive Excel 資料夾',
  },
  'google_forms.read_responses': {
    en: 'Read Google Forms responses',
    'zh-Hant': '讀取 Google 表單回覆',
  },
  'google_sheets.append': { en: 'Append Google Sheet', 'zh-Hant': '附加 Google 試算表資料' },
  'google_sheets.read': { en: 'Read Google Sheet', 'zh-Hant': '讀取 Google 試算表' },
  'google_sheets.sync': { en: 'Sync Google Sheet', 'zh-Hant': '同步 Google 試算表' },
  'google_sheets.update': { en: 'Update Google Sheet', 'zh-Hant': '更新 Google 試算表' },
  'google_slides.create': {
    en: 'Create Google Slides presentation',
    'zh-Hant': '建立 Google 簡報',
  },
  'manual.trigger': { en: 'Manual trigger', 'zh-Hant': '手動觸發' },
  'notification.desktop': { en: 'Desktop notification', 'zh-Hant': '桌面通知' },
  'report.compose': { en: 'Compose report', 'zh-Hant': '產生報告' },
  'schedule.trigger': { en: 'Scheduled trigger', 'zh-Hant': '排程觸發' },
  'webhook.call': { en: 'Call webhook', 'zh-Hant': '呼叫 Webhook' },
};

const auditActions: Readonly<Record<string, LocalizedValue>> = {
  'agent_job.dispatch_failed': {
    en: 'Desktop Job dispatch failed',
    'zh-Hant': '桌面工作派送失敗',
  },
  'agent_job.queued': { en: 'Desktop Job queued', 'zh-Hant': '桌面工作已進入佇列' },
  'approval.approved': { en: 'Approval granted', 'zh-Hant': '已核准執行' },
  'approval.expired': { en: 'Approval expired', 'zh-Hant': '核准要求已過期' },
  'approval.rejected': { en: 'Approval rejected', 'zh-Hant': '已拒絕執行' },
  'approval.requested': { en: 'Approval requested', 'zh-Hant': '已要求核准' },
  'cloud_run.cancelled': { en: 'Cloud run cancelled', 'zh-Hant': '雲端執行已取消' },
  'cloud_run.created': { en: 'Cloud run created', 'zh-Hant': '已建立雲端執行' },
  'cloud_run.failed': { en: 'Cloud run failed', 'zh-Hant': '雲端執行失敗' },
  'cloud_run.succeeded': { en: 'Cloud run succeeded', 'zh-Hant': '雲端執行成功' },
  'cloud_run.timed_out': { en: 'Cloud run timed out', 'zh-Hant': '雲端執行已逾時' },
  'run.awaiting_approval': { en: 'Awaiting approval', 'zh-Hant': '等待核准' },
  'run.cancelled': { en: 'Run cancelled', 'zh-Hant': '執行已取消' },
  'run.created': { en: 'Run created', 'zh-Hant': '已建立執行' },
  'run.failed': { en: 'Run failed', 'zh-Hant': '執行失敗' },
  'run.queued': { en: 'Run queued', 'zh-Hant': '執行已進入佇列' },
  'run.retry_requested': { en: 'Retry requested', 'zh-Hant': '已要求重試' },
  'run.retry_scheduled': { en: 'Retry scheduled', 'zh-Hant': '已排定重試' },
  'run.running': { en: 'Run started', 'zh-Hant': '開始執行' },
  'run.step_progress': { en: 'Step progress updated', 'zh-Hant': '步驟進度已更新' },
  'run.succeeded': { en: 'Run succeeded', 'zh-Hant': '執行成功' },
  'run.timed_out': { en: 'Run timed out', 'zh-Hant': '執行已逾時' },
};

const actorTypes: Readonly<Record<string, LocalizedValue>> = {
  device: { en: 'Desktop Agent', 'zh-Hant': '桌面代理程式' },
  system: { en: 'System', 'zh-Hant': '系統' },
  user: { en: 'User', 'zh-Hant': '使用者' },
};

const notificationText: Readonly<Record<string, LocalizedValue>> = {
  'Cloud workflow completed': {
    en: 'Cloud workflow completed',
    'zh-Hant': '雲端工作流執行完成',
  },
  'Desktop Job dispatch failed': {
    en: 'Desktop Job dispatch failed',
    'zh-Hant': '桌面工作派送失敗',
  },
  'Desktop Job 派送失敗': {
    en: 'Desktop Job dispatch failed',
    'zh-Hant': '桌面工作派送失敗',
  },
  'Desktop Job 已停止派送。': {
    en: 'Desktop Job dispatch has stopped.',
    'zh-Hant': '桌面工作已停止派送。',
  },
  'Execution stopped. Review the detailed error code in Run details.': {
    en: 'Execution stopped. Review the detailed error code in Run details.',
    'zh-Hant': '執行已停止；請在執行詳情檢視錯誤代碼。',
  },
  'No Desktop Job was dispatched.': {
    en: 'No Desktop Job was dispatched.',
    'zh-Hant': '未派送任何桌面工作。',
  },
  'Open Run details to review the metadata-only execution summary.': {
    en: 'Open Run details to review the metadata-only execution summary.',
    'zh-Hant': '開啟執行詳情，以檢視僅含中繼資料的執行摘要。',
  },
  'The cloud workflow completed all validated steps.': {
    en: 'The cloud workflow completed all validated steps.',
    'zh-Hant': '雲端工作流已完成所有通過驗證的步驟。',
  },
  'The Run has not executed. Retry after the connection is restored.': {
    en: 'The Run has not executed. Retry after the connection is restored.',
    'zh-Hant': '執行尚未開始；請在連線恢復後重試。',
  },
  'The Run stopped. You can retry manually after reviewing the cause.': {
    en: 'The Run stopped. You can retry manually after reviewing the cause.',
    'zh-Hant': '執行已停止；確認原因後可以手動重試。',
  },
  'The approval request was rejected. No Desktop Job was dispatched.': {
    en: 'The approval request was rejected. No Desktop Job was dispatched.',
    'zh-Hant': '核准要求已被拒絕，未派送任何桌面工作。',
  },
  'The workflow was created. No Desktop Job will be dispatched before approval.': {
    en: 'The workflow was created. No Desktop Job will be dispatched before approval.',
    'zh-Hant': '工作流已建立；核准前不會派送桌面工作。',
  },
  'Run 尚未執行，可在連線恢復後重試。': {
    en: 'The Run has not executed. Retry after the connection is restored.',
    'zh-Hant': '執行尚未開始；請在連線恢復後重試。',
  },
  'Run 已停止，可在確認原因後手動重試。': {
    en: 'The Run stopped. You can retry manually after reviewing the cause.',
    'zh-Hant': '執行已停止；確認原因後可以手動重試。',
  },
  'Workflow approval required': {
    en: 'Workflow approval required',
    'zh-Hant': '工作流需要核准',
  },
  'Workflow run completed': { en: 'Workflow run completed', 'zh-Hant': '工作流執行完成' },
  'Workflow run failed': { en: 'Workflow run failed', 'zh-Hant': '工作流執行失敗' },
  'Workflow run timed out': { en: 'Workflow run timed out', 'zh-Hant': '工作流執行逾時' },
  執行已取消: { en: 'Run cancelled', 'zh-Hant': '執行已取消' },
  '執行已停止；詳細錯誤代碼可在 Run details 檢視。': {
    en: 'Execution stopped. Review the detailed error code in Run details.',
    'zh-Hant': '執行已停止；請在執行詳情檢視錯誤代碼。',
  },
  '工作流已建立，核准前不會派送至 Desktop Agent。': {
    en: 'The workflow was created. No Desktop Job will be dispatched before approval.',
    'zh-Hant': '工作流已建立；核准前不會派送桌面工作。',
  },
  工作流執行完成: { en: 'Workflow run completed', 'zh-Hant': '工作流執行完成' },
  工作流執行失敗: { en: 'Workflow run failed', 'zh-Hant': '工作流執行失敗' },
  工作流執行逾時: { en: 'Workflow run timed out', 'zh-Hant': '工作流執行逾時' },
  '核准要求已拒絕，未派送任何 Desktop Job。': {
    en: 'The approval request was rejected. No Desktop Job was dispatched.',
    'zh-Hant': '核准要求已被拒絕，未派送任何桌面工作。',
  },
  核准要求已過期: { en: 'Approval request expired', 'zh-Hant': '核准要求已過期' },
  '未派送任何 Desktop Job。': {
    en: 'No Desktop Job was dispatched.',
    'zh-Hant': '未派送任何桌面工作。',
  },
  需要執行核准: { en: 'Workflow approval required', 'zh-Hant': '工作流需要核准' },
};

function localize(
  value: string,
  values: Readonly<Record<string, LocalizedValue>>,
  locale: AppLocale,
) {
  return values[value]?.[locale] ?? value;
}

export function localizeWorkflowName(name: string, locale: AppLocale): string {
  return localize(name, workflowNames, locale);
}

export function localizeNodeType(nodeType: string, locale: AppLocale): string | undefined {
  return nodeTypes[nodeType]?.[locale];
}

export function localizeRunStep(nodeId: string, nodeType: string, locale: AppLocale): string {
  return localizeNodeType(nodeType, locale) ?? nodeId;
}

export function localizeComputerUseAction(
  action:
    | 'excel.autofit_used_range'
    | 'excel.open_workbook'
    | 'excel.save_workbook'
    | 'excel.verify_active_workbook',
  locale: AppLocale,
): string {
  const actions = {
    'excel.autofit_used_range': {
      en: 'Auto-fitting used rows and columns',
      'zh-Hant': '正在自動調整使用中欄列',
    },
    'excel.open_workbook': {
      en: 'Opening the approved workbook',
      'zh-Hant': '正在開啟已核准活頁簿',
    },
    'excel.save_workbook': {
      en: 'Saving the approved workbook',
      'zh-Hant': '正在儲存已核准活頁簿',
    },
    'excel.verify_active_workbook': {
      en: 'Verifying the active workbook',
      'zh-Hant': '正在驗證目前活頁簿',
    },
  } as const;
  return actions[action][locale];
}

export function localizeAuditAction(action: string, locale: AppLocale): string {
  return localize(action, auditActions, locale);
}

export function localizeActorType(actorType: string, locale: AppLocale): string {
  return localize(actorType, actorTypes, locale);
}

export function localizeNotification(
  title: string,
  message: string,
  locale: AppLocale,
): Readonly<{ message: string; title: string }> {
  const completedMatch = /^(.*?) 已成功完成。$/.exec(message);
  const localizedMessage =
    completedMatch === null
      ? localize(message, notificationText, locale)
      : locale === 'en'
        ? `${localizeWorkflowName(completedMatch[1] ?? '', locale)} completed successfully.`
        : message;

  return {
    message: localizedMessage,
    title: localize(title, notificationText, locale),
  };
}
