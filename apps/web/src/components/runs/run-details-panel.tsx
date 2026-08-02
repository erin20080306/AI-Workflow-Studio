'use client';

import { WorkflowRunViewSchema, type WorkflowRunView } from '@ai-workflow-studio/run-orchestrator';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import { CheckIcon, RunsIcon, ShieldIcon } from '@/components/icons';
import { useLanguage } from '@/components/language-provider';
import {
  localizeActorType,
  localizeAuditAction,
  localizeComputerUseAction,
  localizeNotification,
  localizeRunStep,
  localizeWorkflowName,
} from '@/components/runs/run-details-i18n';

const statusStyle: Readonly<Record<WorkflowRunView['status'], string>> = {
  awaiting_approval: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-slate-200 text-slate-700',
  failed: 'bg-red-100 text-red-800',
  queued: 'bg-sky-100 text-sky-800',
  running: 'bg-indigo-100 text-indigo-800',
  succeeded: 'bg-emerald-100 text-emerald-800',
  timed_out: 'bg-red-100 text-red-800',
};

const RunApiResponseSchema = z
  .object({
    error: z
      .object({
        message: z.string().max(500).optional(),
      })
      .passthrough()
      .optional(),
    run: WorkflowRunViewSchema.optional(),
  })
  .strict();

const statusLabels = {
  en: {
    awaiting_approval: 'Awaiting approval',
    cancelled: 'Cancelled',
    failed: 'Failed',
    queued: 'Queued',
    running: 'Running',
    succeeded: 'Succeeded',
    timed_out: 'Timed out',
  },
  'zh-Hant': {
    awaiting_approval: '等待核准',
    cancelled: '已取消',
    failed: '失敗',
    queued: '佇列中',
    running: '執行中',
    succeeded: '已成功',
    timed_out: '已逾時',
  },
} as const;

const stepStatusLabels = {
  en: {
    cancelled: 'Cancelled',
    failed: 'Failed',
    pending: 'Pending',
    running: 'Running',
    skipped: 'Skipped',
    succeeded: 'Succeeded',
  },
  'zh-Hant': {
    cancelled: '已取消',
    failed: '失敗',
    pending: '等待中',
    running: '執行中',
    skipped: '已略過',
    succeeded: '已成功',
  },
} as const;

const copy = {
  en: {
    approve: 'Approve and dispatch',
    approval: 'Run approval required',
    approvalHelp:
      'No Desktop Job is created before approval. Review the write and external-action summary.',
    attempt: 'Attempt',
    audit: 'Audit timeline',
    cancel: 'Cancel run',
    cancelConfirm: 'Press again to confirm',
    destructive: 'Destructive',
    external: 'External',
    files: 'files',
    notifications: 'Notifications',
    operationFailed: 'The action did not complete. Refresh to confirm the current status.',
    refresh: 'Refresh',
    reject: 'Reject',
    retry: 'Retry',
    rows: 'rows',
    statusUpdated: 'Run status updated.',
    timeout: 'Timeout',
    write: 'Write',
  },
  'zh-Hant': {
    approve: '核准並派送',
    approval: '需要執行核准',
    approvalHelp: '核准前不會建立桌面工作。請確認寫入與外部操作摘要。',
    attempt: '嘗試次數',
    audit: '稽核時間軸',
    cancel: '取消執行',
    cancelConfirm: '再次按下確認取消',
    destructive: '破壞性',
    external: '外部服務',
    files: '個檔案',
    notifications: '通知',
    operationFailed: '操作未完成；請重新整理後確認目前狀態。',
    refresh: '重新整理',
    reject: '拒絕',
    retry: '重試',
    rows: '列',
    statusUpdated: '執行狀態已更新。',
    timeout: '逾時時間',
    write: '寫入',
  },
} as const;

interface RunDetailsPanelProps {
  readonly initialRun: WorkflowRunView;
}

export function RunDetailsPanel({ initialRun }: RunDetailsPanelProps) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [message, setMessage] = useState<'failed' | 'updated'>();
  const [run, setRun] = useState(initialRun);
  const [working, setWorking] = useState(false);

  async function refresh(runId: string) {
    const response = await fetch(`/api/runs/${encodeURIComponent(runId)}`, {
      cache: 'no-store',
    });
    const value = RunApiResponseSchema.safeParse(await response.json());
    if (response.ok && value.success && value.data.run !== undefined) {
      setRun(value.data.run);
    }
  }

  useEffect(() => {
    if (run.status !== 'queued' && run.status !== 'running') {
      return;
    }
    const timer = window.setInterval(() => void refresh(run.id), 2_000);
    return () => window.clearInterval(timer);
  }, [run.id, run.status]);

  async function post(suffix: string, body?: Readonly<Record<string, string>>): Promise<void> {
    setWorking(true);
    setMessage(undefined);
    try {
      const requestInit: RequestInit =
        body === undefined
          ? { method: 'POST' }
          : {
              body: JSON.stringify(body),
              headers: { 'content-type': 'application/json' },
              method: 'POST',
            };
      const response = await fetch(
        `/api/runs/${encodeURIComponent(run.id)}/${suffix}`,
        requestInit,
      );
      const value = RunApiResponseSchema.safeParse(await response.json());
      if (!response.ok || !value.success || value.data.run === undefined) {
        throw new Error(
          value.success
            ? (value.data.error?.message ?? 'Run action failed.')
            : 'Run action failed.',
        );
      }
      setRun(value.data.run);
      setConfirmCancel(false);
      setMessage('updated');
    } catch {
      setMessage('failed');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mt-7 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
      <div className="space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${statusStyle[run.status]}`}
                >
                  {statusLabels[locale][run.status]}
                </span>
                <span className="text-xs text-slate-400">
                  {text.attempt} {run.attempts} / {run.maxAttempts}
                </span>
              </div>
              <h2 className="mt-4 text-xl font-semibold text-slate-950">
                {localizeWorkflowName(run.workflowName, locale)}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {text.timeout}{' '}
                {new Date(run.timeoutAt).toLocaleString(locale === 'en' ? 'en-US' : 'zh-TW')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(run.status === 'queued' || run.status === 'running') && (
                <button
                  className={`rounded-xl px-4 py-2.5 text-xs font-semibold ${
                    confirmCancel
                      ? 'bg-red-600 text-white'
                      : 'border border-red-200 bg-white text-red-700'
                  }`}
                  disabled={working}
                  onClick={() => {
                    if (!confirmCancel) {
                      setConfirmCancel(true);
                      return;
                    }
                    void post('cancel');
                  }}
                  type="button"
                >
                  {confirmCancel ? text.cancelConfirm : text.cancel}
                </button>
              )}
              {(run.status === 'failed' || run.status === 'timed_out') &&
                run.attempts < run.maxAttempts && (
                  <button
                    className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white"
                    disabled={working}
                    onClick={() => void post('retry')}
                    type="button"
                  >
                    {text.retry}
                  </button>
                )}
              <button
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700"
                disabled={working}
                onClick={() => void refresh(run.id)}
                type="button"
              >
                {text.refresh}
              </button>
            </div>
          </div>

          {run.error === undefined ? null : (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-xs font-bold text-red-800">{run.error.code}</p>
              <p className="mt-1 text-sm text-red-700">{run.error.message}</p>
            </div>
          )}

          <div className="mt-6 space-y-3">
            {run.steps.map((step, index) => (
              <article
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-[42px_1fr_auto] sm:items-center"
                key={step.nodeId}
              >
                <span className="grid size-9 place-items-center rounded-xl bg-white text-xs font-bold text-indigo-700 shadow-sm">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900" title={step.nodeType}>
                    {localizeRunStep(step.nodeId, step.nodeType, locale)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {step.processedFileCount} {text.files} · {step.processedRowCount} {text.rows}
                  </p>
                  {step.status === 'running' && step.currentAction !== undefined ? (
                    <p className="mt-1 text-xs font-semibold text-indigo-700" aria-live="polite">
                      {localizeComputerUseAction(step.currentAction, locale)}
                    </p>
                  ) : null}
                </div>
                <span className="w-fit rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                  {stepStatusLabels[locale][step.status]}
                </span>
              </article>
            ))}
          </div>
          {message === undefined ? null : (
            <p aria-live="polite" className="mt-4 text-xs font-semibold text-indigo-700">
              {message === 'updated' ? text.statusUpdated : text.operationFailed}
            </p>
          )}
        </section>

        {run.approval?.status === 'pending' ? (
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-7">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
                <ShieldIcon className="size-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-amber-950">{text.approval}</h2>
                <p className="mt-1 text-xs leading-5 text-amber-800">{text.approvalHelp}</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                [text.write, run.approval.riskSummary.write.length],
                [text.external, run.approval.riskSummary.external.length],
                [text.destructive, run.approval.riskSummary.destructive.length],
              ].map(([label, count]) => (
                <div className="rounded-xl bg-white p-3" key={String(label)}>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {label}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">{count}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white"
                disabled={working}
                onClick={() =>
                  void post('approval', {
                    approvalId: run.approval?.id ?? '',
                    decision: 'approve',
                  })
                }
                type="button"
              >
                {text.approve}
              </button>
              <button
                className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs font-semibold text-red-700"
                disabled={working}
                onClick={() =>
                  void post('approval', {
                    approvalId: run.approval?.id ?? '',
                    decision: 'reject',
                  })
                }
                type="button"
              >
                {text.reject}
              </button>
            </div>
          </section>
        ) : null}
      </div>

      <aside className="space-y-5">
        <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm">
          <RunsIcon className="size-6 text-indigo-300" />
          <h2 className="mt-4 text-base font-semibold">{text.audit}</h2>
          <div className="mt-4 space-y-4">
            {[...run.audit].reverse().map((entry) => (
              <div className="border-l border-white/15 pl-4" key={entry.id}>
                <p className="text-xs font-semibold text-white">
                  {localizeAuditAction(entry.action, locale)}
                </p>
                <p className="mt-1 text-[10px] text-slate-400">
                  {localizeActorType(entry.actorType, locale)} ·{' '}
                  {new Date(entry.createdAt).toLocaleString(locale === 'en' ? 'en-US' : 'zh-TW')}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <CheckIcon className="size-6 text-emerald-600" />
          <h2 className="mt-4 text-base font-semibold text-slate-950">{text.notifications}</h2>
          <div className="mt-4 space-y-3">
            {[...run.notifications].reverse().map((notification) => {
              const localized = localizeNotification(
                notification.title,
                notification.message,
                locale,
              );
              return (
                <div className="rounded-xl bg-slate-50 p-3" key={notification.id}>
                  <p className="text-xs font-semibold text-slate-900">{localized.title}</p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">{localized.message}</p>
                </div>
              );
            })}
          </div>
        </section>
      </aside>
    </div>
  );
}
