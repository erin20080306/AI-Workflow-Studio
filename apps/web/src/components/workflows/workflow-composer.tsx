'use client';

import { AIPlannerOutputSchema, type Workflow } from '@ai-workflow-studio/workflow-schema';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';

import {
  ArrowRightIcon,
  CheckIcon,
  DeviceIcon,
  FolderIcon,
  ShieldIcon,
  SparkIcon,
} from '@/components/icons';
import { MOCK_DEVICE_ID, MOCK_FOLDER_ALIAS_ID } from '@/lib/mock-workflows';

import { WorkflowReview } from './workflow-review';

const EXAMPLE_PROMPT = '每天整理訂單資料夾裡的 Excel，依訂單編號去重，並建立一份新的彙整報表。';
const PlannerApiResponseSchema = z
  .object({
    output: AIPlannerOutputSchema,
  })
  .passthrough();

export function WorkflowComposer() {
  const [prompt, setPrompt] = useState('');
  const [promptError, setPromptError] = useState<string>();
  const [workflow, setWorkflow] = useState<Workflow>();
  const [planning, setPlanning] = useState(false);
  const [saved, setSaved] = useState(false);

  async function createPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    if (prompt.trim().length < 12) {
      setWorkflow(undefined);
      setPromptError('請至少用 12 個字描述資料來源、處理方式與預期輸出。');
      return;
    }
    setPromptError(undefined);
    setPlanning(true);
    try {
      const response = await fetch('/api/ai/plan', {
        body: JSON.stringify({
          context: {
            allowedFolderAliasIds: [MOCK_FOLDER_ALIAS_ID],
            executionTarget: {
              deviceId: MOCK_DEVICE_ID,
              type: 'desktop',
            },
            locale: 'zh-Hant',
            timezone: 'Asia/Taipei',
          },
          maxRepairAttempts: 1,
          prompt,
          provider: 'mock',
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });
      const parsed = PlannerApiResponseSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) {
        throw new Error('Invalid planning response');
      }
      setWorkflow(parsed.data.output.workflow);
    } catch {
      setWorkflow(undefined);
      setPromptError('目前無法建立安全預覽，請稍後重試。沒有任何工作流被儲存或執行。');
    } finally {
      setPlanning(false);
    }
  }

  return (
    <div>
      <form
        className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
        onSubmit={createPreview}
      >
        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_330px]">
          <div>
            <div className="flex items-center gap-2 text-indigo-700">
              <SparkIcon className="size-4" />
              <p className="text-xs font-bold uppercase tracking-[0.16em]">Mock AI planner</p>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
              描述你想自動化的工作
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              AI 只會產生 Workflow JSON 草稿；不會產生或執行程式碼，也不會直接啟用流程。
            </p>

            <label
              className="mt-7 block text-sm font-semibold text-slate-900"
              htmlFor="workflow-prompt"
            >
              自然語言需求
            </label>
            <textarea
              aria-describedby={promptError === undefined ? 'prompt-help' : 'prompt-error'}
              className="mt-2 min-h-36 w-full resize-y rounded-2xl border border-slate-300 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-950 shadow-inner transition placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white"
              id="workflow-prompt"
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={EXAMPLE_PROMPT}
              value={prompt}
            />
            {promptError === undefined ? (
              <p className="mt-2 text-xs text-slate-500" id="prompt-help">
                建議包含來源、規則、輸出與執行時間；敏感資料請使用已設定的連線或資料夾別名。
              </p>
            ) : (
              <p className="mt-2 text-xs font-medium text-rose-700" id="prompt-error" role="alert">
                {promptError}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                disabled={planning}
                type="submit"
              >
                {planning ? '正在驗證…' : '產生安全預覽'}
                <ArrowRightIcon className="size-4" />
              </button>
              <button
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                onClick={() => setPrompt(EXAMPLE_PROMPT)}
                type="button"
              >
                使用範例需求
              </button>
            </div>
          </div>

          <aside className="rounded-2xl bg-slate-950 p-5 text-white">
            <div className="flex items-center gap-2 text-emerald-300">
              <ShieldIcon className="size-4" />
              <p className="text-xs font-bold uppercase tracking-[0.14em]">Execution context</p>
            </div>
            <div className="mt-5 space-y-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-indigo-400/20 text-indigo-200">
                    <DeviceIcon className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs text-slate-400">Mock device</p>
                    <p className="mt-0.5 text-sm font-semibold">Erin’s MacBook Air</p>
                  </div>
                  <CheckIcon className="ml-auto size-4 text-emerald-300" />
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-emerald-400/15 text-emerald-200">
                    <FolderIcon className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs text-slate-400">Approved folder alias</p>
                    <p className="mt-0.5 text-sm font-semibold">訂單匯入資料夾</p>
                  </div>
                  <CheckIcon className="ml-auto size-4 text-emerald-300" />
                </div>
              </div>
            </div>
            <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-slate-400">
              Mock 模式不會讀取真實資料夾。實際路徑永遠留在桌面 Agent，本網站只保存別名 ID。
            </p>
          </aside>
        </div>
      </form>

      {workflow !== undefined && (
        <section className="mt-7">
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">
              Generated draft
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
              {workflow.name}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{workflow.description}</p>
          </div>
          <WorkflowReview onSaveDraft={() => setSaved(true)} workflow={workflow} />
        </section>
      )}

      {saved && (
        <div
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-sm text-white shadow-2xl"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-500">
            <CheckIcon className="size-4" />
          </span>
          <div>
            <p className="font-semibold">草稿已儲存於 Mock 工作區</p>
            <p className="mt-0.5 text-xs text-slate-400">尚未啟用，也未執行任何資料寫入。</p>
          </div>
        </div>
      )}
    </div>
  );
}
