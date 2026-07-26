import Link from 'next/link';

import { ArrowRightIcon, CheckIcon, DeviceIcon, FlowIcon, RunsIcon } from '@/components/icons';
import { LocalizedText } from '@/components/language-provider';
import { requireWorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';

const stats = [
  {
    accent: 'bg-indigo-100 text-indigo-700',
    change: { en: '+2 this week', zhHant: '本週 +2' },
    icon: FlowIcon,
    label: { en: 'Active workflows', zhHant: '啟用中的工作流' },
    value: '6',
  },
  {
    accent: 'bg-emerald-100 text-emerald-700',
    change: { en: '98.2% success', zhHant: '成功率 98.2%' },
    icon: CheckIcon,
    label: { en: 'Succeeded today', zhHant: '今日成功' },
    value: '42',
  },
  {
    accent: 'bg-amber-100 text-amber-700',
    change: { en: '2 need review', zhHant: '2 項待檢視' },
    icon: RunsIcon,
    label: { en: 'Needs attention', zhHant: '需要注意' },
    value: '3',
  },
  {
    accent: 'bg-sky-100 text-sky-700',
    change: { en: 'last seen now', zhHant: '剛剛上線' },
    icon: DeviceIcon,
    label: { en: 'Online devices', zhHant: '在線裝置' },
    value: '2',
  },
];

const recentRuns = [
  {
    duration: '18s',
    name: { en: 'Daily order consolidation', zhHant: '每日訂單整合' },
    status: { en: 'Completed', zhHant: '已完成' },
    statusCode: 'completed',
    time: '12:18',
  },
  {
    duration: '7s',
    name: { en: 'Inventory anomaly check', zhHant: '庫存異常檢查' },
    status: { en: 'Completed', zhHant: '已完成' },
    statusCode: 'completed',
    time: '11:45',
  },
  {
    duration: '—',
    name: { en: 'Supplier report sync', zhHant: '供應商報表同步' },
    status: { en: 'Needs approval', zhHant: '等待核准' },
    statusCode: 'approval',
    time: '10:30',
  },
];

export default async function DashboardPage() {
  const environment = getEnvironment();
  const context = await requireWorkspaceContext();
  const firstName = context.displayName.split(/\s+/u)[0] ?? context.displayName;
  const visibleStats = environment.mockMode
    ? stats
    : stats.map((stat) => ({
        ...stat,
        change: { en: 'Waiting for live data', zhHant: '等待第一筆正式資料' },
        value: '0',
      }));

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
            <LocalizedText
              en={<>Today · {context.subscription.plan} plan</>}
              zhHant={<>今天 · {context.subscription.plan} 方案</>}
            />
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
            <LocalizedText en={<>Good afternoon, {firstName}</>} zhHant={<>午安，{firstName}</>} />
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {environment.mockMode ? (
              <LocalizedText
                en="Your automations are healthy. 42 runs completed today."
                zhHant="你的自動化運作正常。今天已有 42 次執行完成。"
              />
            ) : (
              <LocalizedText
                en="Your account and workspace are active. Start by creating a safe workflow."
                zhHant="帳戶與工作區已啟用，可以開始建立第一個安全工作流。"
              />
            )}
          </p>
        </div>
        <Link
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          href="/dashboard/workflows/new"
        >
          <LocalizedText en="Create workflow" zhHant="建立工作流" />
          <ArrowRightIcon className="size-4" />
        </Link>
      </div>

      {environment.mockMode && (
        <section className="mt-7 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-1 size-2 rounded-full bg-amber-500" />
            <div>
              <p className="text-sm font-semibold text-amber-950">
                <LocalizedText en="Mock data is active" zhHant="Mock 資料已啟用" />
              </p>
              <p className="mt-0.5 text-xs leading-5 text-amber-800">
                <LocalizedText
                  en="Supabase, AI providers, and local files are not contacted."
                  zhHant="目前不會連線 Supabase、AI Provider 或你的本機檔案。"
                />
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold text-amber-900">
            <LocalizedText en="Safe to explore" zhHant="可安全探索" />
          </span>
        </section>
      )}

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {visibleStats.map(({ accent, change, icon: Icon, label, value }) => (
          <article
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            key={label.en}
          >
            <div className="flex items-center justify-between">
              <span className={`grid size-10 place-items-center rounded-xl ${accent}`}>
                <Icon className="size-5" />
              </span>
              <span className="text-[11px] font-medium text-slate-400">
                <LocalizedText en={change.en} zhHant={change.zhHant} />
              </span>
            </div>
            <p className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
            <p className="mt-1 text-sm text-slate-500">
              <LocalizedText en={label.en} zhHant={label.zhHant} />
            </p>
          </article>
        ))}
      </section>

      <section className="mt-7 grid gap-6 xl:grid-cols-[1.45fr_0.55fr]">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                <LocalizedText en="Recent runs" zhHant="最近執行" />
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                <LocalizedText en="Across all paired devices" zhHant="來自所有已配對裝置" />
              </p>
            </div>
            <Link className="text-xs font-semibold text-indigo-700" href="/dashboard/runs">
              <LocalizedText en="View all" zhHant="查看全部" />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {(environment.mockMode ? recentRuns : []).map((run) => (
              <div
                className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 sm:grid-cols-[1fr_130px_70px_60px] sm:px-6"
                key={`${run.name.en}-${run.time}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                    <FlowIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      <LocalizedText en={run.name.en} zhHant={run.name.zhHant} />
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400 sm:hidden">{run.time}</p>
                  </div>
                </div>
                <span
                  className={`hidden w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${
                    run.statusCode === 'completed'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  <LocalizedText en={run.status.en} zhHant={run.status.zhHant} />
                </span>
                <span className="hidden text-xs text-slate-500 sm:block">{run.duration}</span>
                <span className="hidden text-right text-xs text-slate-400 sm:block">
                  {run.time}
                </span>
                <span
                  className={`size-2 rounded-full sm:hidden ${
                    run.statusCode === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
              </div>
            ))}
            {!environment.mockMode && (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-semibold text-slate-800">
                  <LocalizedText en="No live runs yet" zhHant="尚無正式執行紀錄" />
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  <LocalizedText
                    en="After you create a workflow and pair the Desktop Agent, run status will appear here."
                    zhHant="建立工作流並配對 Desktop Agent 後，執行狀態會顯示在這裡。"
                  />
                </p>
              </div>
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
            <LocalizedText en="Next approval" zhHant="下一項核准" />
          </p>
          <h2 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">
            <LocalizedText en="Supplier report sync" zhHant="供應商報表同步" />
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            <LocalizedText
              en="This workflow will append 127 rows to Google Sheets and requires one write approval."
              zhHant="此流程將附加 127 列資料至 Google Sheets，需要一次寫入核准。"
            />
          </p>
          <div className="mt-7 space-y-3 border-t border-white/10 pt-5 text-xs text-slate-300">
            <div className="flex justify-between">
              <span>
                <LocalizedText en="Risk" zhHant="風險" />
              </span>
              <span className="font-semibold text-amber-300">
                <LocalizedText en="Write" zhHant="寫入" />
              </span>
            </div>
            <div className="flex justify-between">
              <span>
                <LocalizedText en="Target" zhHant="目標" />
              </span>
              <span className="font-semibold text-white">Google Sheets</span>
            </div>
            <div className="flex justify-between">
              <span>
                <LocalizedText en="Device" zhHant="裝置" />
              </span>
              <span className="font-semibold text-white">
                <LocalizedText en="Erin’s MacBook" zhHant="Erin 的 MacBook" />
              </span>
            </div>
          </div>
          <button
            className="mt-7 w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-100"
            type="button"
          >
            <LocalizedText en="Review approval summary" zhHant="檢視核准摘要" />
          </button>
        </article>
      </section>
    </div>
  );
}
