'use client';

import type { WorkflowRunView } from '@ai-workflow-studio/run-orchestrator';
import { useEffect, useState } from 'react';

import { CheckIcon, RunsIcon, ShieldIcon } from '@/components/icons';

const statusStyle: Readonly<Record<WorkflowRunView['status'], string>> = {
  awaiting_approval: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-slate-200 text-slate-700',
  failed: 'bg-red-100 text-red-800',
  queued: 'bg-sky-100 text-sky-800',
  running: 'bg-indigo-100 text-indigo-800',
  succeeded: 'bg-emerald-100 text-emerald-800',
  timed_out: 'bg-red-100 text-red-800',
};

interface RunDetailsPanelProps {
  readonly initialRun: WorkflowRunView;
}

export function RunDetailsPanel({ initialRun }: RunDetailsPanelProps) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [message, setMessage] = useState<string>();
  const [run, setRun] = useState(initialRun);
  const [working, setWorking] = useState(false);

  async function refresh(runId: string) {
    const response = await fetch(`/api/runs/${encodeURIComponent(runId)}`, {
      cache: 'no-store',
    });
    const value = (await response.json()) as {
      readonly run?: WorkflowRunView;
    };
    if (response.ok && value.run !== undefined) {
      setRun(value.run);
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
      const value = (await response.json()) as {
        readonly error?: { readonly message?: string };
        readonly run?: WorkflowRunView;
      };
      if (!response.ok || value.run === undefined) {
        throw new Error(value.error?.message ?? 'Run action failed.');
      }
      setRun(value.run);
      setConfirmCancel(false);
      setMessage('Run 狀態已更新。');
    } catch {
      setMessage('操作未完成；請重新整理後確認目前狀態。');
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
                  {run.status.replace('_', ' ')}
                </span>
                <span className="text-xs text-slate-400">
                  Attempt {run.attempts} / {run.maxAttempts}
                </span>
              </div>
              <h2 className="mt-4 text-xl font-semibold text-slate-950">{run.workflowName}</h2>
              <p className="mt-1 text-xs text-slate-500">
                Timeout {new Date(run.timeoutAt).toLocaleString('zh-TW')}
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
                  {confirmCancel ? '再次按下確認取消' : '取消 Run'}
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
                    重試
                  </button>
                )}
              <button
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700"
                disabled={working}
                onClick={() => void refresh(run.id)}
                type="button"
              >
                重新整理
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
                  <p className="text-sm font-semibold text-slate-900">{step.nodeId}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {step.nodeType} · {step.processedFileCount} files · {step.processedRowCount}{' '}
                    rows
                  </p>
                </div>
                <span className="w-fit rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                  {step.status}
                </span>
              </article>
            ))}
          </div>
          {message === undefined ? null : (
            <p aria-live="polite" className="mt-4 text-xs font-semibold text-indigo-700">
              {message}
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
                <h2 className="text-base font-semibold text-amber-950">需要執行核准</h2>
                <p className="mt-1 text-xs leading-5 text-amber-800">
                  核准前不會建立 Desktop Job。請確認寫入與外部操作摘要。
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                ['Write', run.approval.riskSummary.write.length],
                ['External', run.approval.riskSummary.external.length],
                ['Destructive', run.approval.riskSummary.destructive.length],
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
                核准並派送
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
                拒絕
              </button>
            </div>
          </section>
        ) : null}
      </div>

      <aside className="space-y-5">
        <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm">
          <RunsIcon className="size-6 text-indigo-300" />
          <h2 className="mt-4 text-base font-semibold">Audit timeline</h2>
          <div className="mt-4 space-y-4">
            {[...run.audit].reverse().map((entry) => (
              <div className="border-l border-white/15 pl-4" key={entry.id}>
                <p className="text-xs font-semibold text-white">{entry.action}</p>
                <p className="mt-1 text-[10px] text-slate-400">
                  {entry.actorType} · {new Date(entry.createdAt).toLocaleString('zh-TW')}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <CheckIcon className="size-6 text-emerald-600" />
          <h2 className="mt-4 text-base font-semibold text-slate-950">Notifications</h2>
          <div className="mt-4 space-y-3">
            {[...run.notifications].reverse().map((notification) => (
              <div className="rounded-xl bg-slate-50 p-3" key={notification.id}>
                <p className="text-xs font-semibold text-slate-900">{notification.title}</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">{notification.message}</p>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
