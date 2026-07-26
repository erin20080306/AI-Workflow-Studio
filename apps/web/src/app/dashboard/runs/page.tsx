import type { Metadata } from 'next';
import Link from 'next/link';

import { ArrowRightIcon, RunsIcon } from '@/components/icons';
import { ensureMockRun, listRuns } from '@/lib/run-server';

export const metadata: Metadata = {
  title: '執行紀錄',
};

const statusStyle: Readonly<Record<string, string>> = {
  awaiting_approval: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-slate-100 text-slate-700',
  failed: 'bg-red-100 text-red-800',
  queued: 'bg-sky-100 text-sky-800',
  running: 'bg-indigo-100 text-indigo-800',
  succeeded: 'bg-emerald-100 text-emerald-800',
  timed_out: 'bg-red-100 text-red-800',
};

export default async function RunsPage() {
  await ensureMockRun();
  const runs = await listRuns();
  return (
    <div className="mx-auto max-w-[1120px]">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
        Run orchestration
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
        執行紀錄
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        追蹤核准、Desktop Job、步驟進度、重試、取消、逾時與稽核事件。
      </p>

      <section className="mt-7 space-y-3">
        {runs.map((run) => (
          <Link
            className="group grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md sm:grid-cols-[48px_1fr_auto] sm:items-center"
            href={`/dashboard/runs/${run.id}`}
            key={run.id}
          >
            <span className="grid size-11 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
              <RunsIcon className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-slate-950">
                  {run.workflowName}
                </h2>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                    statusStyle[run.status] ?? 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {run.status.replace('_', ' ')}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {run.steps.filter((step) => step.status === 'succeeded').length} /{' '}
                {run.steps.length} steps · Attempt {run.attempts} / {run.maxAttempts}
              </p>
            </div>
            <ArrowRightIcon className="size-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-600" />
          </Link>
        ))}
      </section>
    </div>
  );
}
