import Link from 'next/link';

import { ArrowRightIcon, CheckIcon, DeviceIcon, FlowIcon, RunsIcon } from '@/components/icons';
import { getEnvironment } from '@/lib/env';

const stats = [
  {
    accent: 'bg-indigo-100 text-indigo-700',
    change: '+2 this week',
    icon: FlowIcon,
    label: '啟用中的工作流',
    value: '6',
  },
  {
    accent: 'bg-emerald-100 text-emerald-700',
    change: '98.2% success',
    icon: CheckIcon,
    label: '今日成功',
    value: '42',
  },
  {
    accent: 'bg-amber-100 text-amber-700',
    change: '2 need review',
    icon: RunsIcon,
    label: '需要注意',
    value: '3',
  },
  {
    accent: 'bg-sky-100 text-sky-700',
    change: 'last seen now',
    icon: DeviceIcon,
    label: '在線裝置',
    value: '2',
  },
];

const recentRuns = [
  {
    duration: '18s',
    name: '每日訂單整合',
    status: 'Completed',
    time: '12:18',
  },
  {
    duration: '7s',
    name: '庫存異常檢查',
    status: 'Completed',
    time: '11:45',
  },
  {
    duration: '—',
    name: '供應商報表同步',
    status: 'Needs approval',
    time: '10:30',
  },
];

export default function DashboardPage() {
  const environment = getEnvironment();

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
            Today · Mock workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
            午安，Erin
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            你的自動化運作正常。今天已有 42 次執行完成。
          </p>
        </div>
        <Link
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          href="/dashboard/workflows/new"
        >
          建立工作流
          <ArrowRightIcon className="size-4" />
        </Link>
      </div>

      {environment.mockMode && (
        <section className="mt-7 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-1 size-2 rounded-full bg-amber-500" />
            <div>
              <p className="text-sm font-semibold text-amber-950">Mock 資料已啟用</p>
              <p className="mt-0.5 text-xs leading-5 text-amber-800">
                目前不會連線 Supabase、AI Provider 或你的本機檔案。
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold text-amber-900">Safe to explore</span>
        </section>
      )}

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ accent, change, icon: Icon, label, value }) => (
          <article
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            key={label}
          >
            <div className="flex items-center justify-between">
              <span className={`grid size-10 place-items-center rounded-xl ${accent}`}>
                <Icon className="size-5" />
              </span>
              <span className="text-[11px] font-medium text-slate-400">{change}</span>
            </div>
            <p className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
            <p className="mt-1 text-sm text-slate-500">{label}</p>
          </article>
        ))}
      </section>

      <section className="mt-7 grid gap-6 xl:grid-cols-[1.45fr_0.55fr]">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-base font-semibold text-slate-950">最近執行</h2>
              <p className="mt-0.5 text-xs text-slate-500">來自所有已配對裝置</p>
            </div>
            <Link className="text-xs font-semibold text-indigo-700" href="/dashboard/runs">
              查看全部
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recentRuns.map((run) => (
              <div
                className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 sm:grid-cols-[1fr_130px_70px_60px] sm:px-6"
                key={`${run.name}-${run.time}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                    <FlowIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{run.name}</p>
                    <p className="mt-0.5 text-xs text-slate-400 sm:hidden">{run.time}</p>
                  </div>
                </div>
                <span
                  className={`hidden w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${
                    run.status === 'Completed'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  {run.status}
                </span>
                <span className="hidden text-xs text-slate-500 sm:block">{run.duration}</span>
                <span className="hidden text-right text-xs text-slate-400 sm:block">
                  {run.time}
                </span>
                <span
                  className={`size-2 rounded-full sm:hidden ${
                    run.status === 'Completed' ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
            Next approval
          </p>
          <h2 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">供應商報表同步</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            此流程將附加 127 列資料至 Google Sheets，需要一次寫入核准。
          </p>
          <div className="mt-7 space-y-3 border-t border-white/10 pt-5 text-xs text-slate-300">
            <div className="flex justify-between">
              <span>Risk</span>
              <span className="font-semibold text-amber-300">Write</span>
            </div>
            <div className="flex justify-between">
              <span>Target</span>
              <span className="font-semibold text-white">Google Sheets</span>
            </div>
            <div className="flex justify-between">
              <span>Device</span>
              <span className="font-semibold text-white">Erin’s MacBook</span>
            </div>
          </div>
          <button
            className="mt-7 w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-100"
            type="button"
          >
            檢視核准摘要
          </button>
        </article>
      </section>
    </div>
  );
}
