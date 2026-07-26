'use client';

import { useState } from 'react';

import { CheckIcon, PlusIcon, ShieldIcon } from '@/components/icons';
import { useLanguage } from '@/components/language-provider';

const copy = {
  en: {
    activate: 'Activate workflow',
    activated:
      'Workflow activated in the mock workspace. The first live run will still require write approval.',
    checkbox:
      'I reviewed the data source, execution device, read/write scope, and first-run approval rules.',
    created: 'Mock v4 created. The current version remains unchanged.',
    description: 'AI-generated workflows remain drafts until a user reviews and activates them.',
    needsReview: 'Review the permissions and write summary first.',
    newVersion: 'Create new version',
    pause: 'Pause workflow',
    paused: 'Workflow paused. It will not accept new runs.',
    status: { active: 'Active', draft: 'Draft', paused: 'Paused' },
  },
  'zh-Hant': {
    activate: '啟用工作流',
    activated: '工作流已在 Mock 工作區啟用。首次正式執行仍會要求寫入核准。',
    checkbox: '我已檢查資料來源、執行裝置、讀寫範圍與首次執行核准規則。',
    created: '已建立 Mock v4；目前版本仍保持不變。',
    description: 'AI 產生的流程預設為草稿，只有使用者完成檢查後才能啟用。',
    needsReview: '請先確認權限與寫入摘要。',
    newVersion: '建立新版本',
    pause: '暫停工作流',
    paused: '工作流已暫停，不會接受新的執行。',
    status: { active: '已啟用', draft: '草稿', paused: '已暫停' },
  },
} as const;

type ActionMessage = 'activated' | 'created' | 'needs-review' | 'paused';

export function WorkflowDetailActions() {
  const { locale } = useLanguage();
  const text = copy[locale];
  const [status, setStatus] = useState<'active' | 'draft' | 'paused'>('draft');
  const [approvalReviewed, setApprovalReviewed] = useState(false);
  const [message, setMessage] = useState<ActionMessage>();

  function activate() {
    if (!approvalReviewed) {
      setMessage('needs-review');
      return;
    }
    setStatus('active');
    setMessage('activated');
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`size-2 rounded-full ${
                status === 'active'
                  ? 'bg-emerald-500'
                  : status === 'paused'
                    ? 'bg-amber-500'
                    : 'bg-slate-400'
              }`}
            />
            <p className="text-sm font-semibold text-slate-950">{text.status[status]}</p>
          </div>
          <p className="mt-1 text-xs text-slate-500">{text.description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800"
            onClick={() => setMessage('created')}
            type="button"
          >
            <PlusIcon className="size-4" />
            {text.newVersion}
          </button>
          {status === 'active' ? (
            <button
              className="rounded-xl bg-amber-100 px-4 py-2.5 text-sm font-semibold text-amber-900"
              onClick={() => {
                setStatus('paused');
                setMessage('paused');
              }}
              type="button"
            >
              {text.pause}
            </button>
          ) : (
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
              onClick={activate}
              type="button"
            >
              <ShieldIcon className="size-4" />
              {text.activate}
            </button>
          )}
        </div>
      </div>

      {status !== 'active' && (
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-700">
          <input
            checked={approvalReviewed}
            className="mt-0.5 size-4 accent-indigo-600"
            onChange={(event) => setApprovalReviewed(event.target.checked)}
            type="checkbox"
          />
          {text.checkbox}
        </label>
      )}

      {message !== undefined && (
        <div
          aria-live="polite"
          className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium ${
            message === 'needs-review'
              ? 'bg-amber-50 text-amber-900'
              : 'bg-emerald-50 text-emerald-800'
          }`}
        >
          {message !== 'needs-review' && <CheckIcon className="size-4 shrink-0" />}
          {
            {
              activated: text.activated,
              created: text.created,
              'needs-review': text.needsReview,
              paused: text.paused,
            }[message]
          }
        </div>
      )}
    </section>
  );
}
