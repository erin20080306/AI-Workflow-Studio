import type { Metadata } from 'next';
import Link from 'next/link';

import {
  ArrowRightIcon,
  ChevronRightIcon,
  FlowIcon,
  PlusIcon,
  SearchIcon,
} from '@/components/icons';
import { LocalizedText } from '@/components/language-provider';
import { MOCK_WORKFLOW_SUMMARIES } from '@/lib/mock-workflows';

export const metadata: Metadata = {
  title: '工作流',
};

const statusStyles = {
  active: 'bg-emerald-50 text-emerald-800',
  draft: 'bg-slate-100 text-slate-700',
  paused: 'bg-amber-50 text-amber-800',
} as const;

const statusLabels = {
  active: { en: 'Active', zhHant: '啟用中' },
  draft: { en: 'Draft', zhHant: '草稿' },
  paused: { en: 'Paused', zhHant: '已暫停' },
} as const;

export default function WorkflowsPage() {
  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
            <LocalizedText en="Automation library" zhHant="自動化資料庫" />
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
            <LocalizedText en="Workflows" zhHant="工作流" />
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            <LocalizedText
              en="Create, review, and version your safe automation workflows."
              zhHant="建立、檢查與版本化你的安全自動化流程。"
            />
          </p>
        </div>
        <Link
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          href="/dashboard/workflows/new"
        >
          <PlusIcon className="size-4" />
          <LocalizedText en="New workflow" zhHant="新建工作流" />
        </Link>
      </div>

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <span className="sr-only">
              <LocalizedText en="Search workflows" zhHant="搜尋工作流" />
            </span>
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400"
              placeholder="搜尋工作流 / Search workflows"
              type="search"
            />
          </label>
          <div className="flex gap-2 text-xs font-semibold">
            <button className="rounded-xl bg-slate-950 px-3.5 py-2.5 text-white" type="button">
              <LocalizedText en="All 3" zhHant="全部 3" />
            </button>
            <button
              className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-slate-600"
              type="button"
            >
              <LocalizedText en="Active 1" zhHant="啟用中 1" />
            </button>
            <button
              className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-slate-600"
              type="button"
            >
              <LocalizedText en="Draft 1" zhHant="草稿 1" />
            </button>
          </div>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[minmax(220px,1.4fr)_140px_170px_110px_90px_28px] gap-4 border-b border-slate-100 px-6 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 lg:grid">
          <span>
            <LocalizedText en="Workflow" zhHant="工作流" />
          </span>
          <span>
            <LocalizedText en="Status" zhHant="狀態" />
          </span>
          <span>
            <LocalizedText en="Target" zhHant="執行位置" />
          </span>
          <span>
            <LocalizedText en="Last run" zhHant="最近執行" />
          </span>
          <span>
            <LocalizedText en="Success" zhHant="成功率" />
          </span>
          <span />
        </div>
        <div className="divide-y divide-slate-100">
          {MOCK_WORKFLOW_SUMMARIES.map((workflow) => (
            <Link
              className="group grid gap-4 px-5 py-5 transition hover:bg-slate-50 lg:grid-cols-[minmax(220px,1.4fr)_140px_170px_110px_90px_28px] lg:items-center lg:px-6"
              href={`/dashboard/workflows/${workflow.id}`}
              key={workflow.id}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                  <FlowIcon className="size-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-slate-950">{workflow.name}</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    <LocalizedText
                      en={
                        <>
                          {workflow.nodeCount} nodes · Updated {workflow.updatedAt}
                        </>
                      }
                      zhHant={
                        <>
                          {workflow.nodeCount} 個節點 · 更新於 {workflow.updatedAt}
                        </>
                      }
                    />
                  </p>
                </div>
              </div>
              <div>
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[workflow.status]}`}
                >
                  <LocalizedText
                    en={statusLabels[workflow.status].en}
                    zhHant={statusLabels[workflow.status].zhHant}
                  />
                </span>
              </div>
              <p className="text-xs font-medium text-slate-600">{workflow.target}</p>
              <p className="text-xs text-slate-500">{workflow.lastRun}</p>
              <p className="text-xs font-semibold text-slate-700">{workflow.successRate}</p>
              <ChevronRightIcon className="hidden size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-600 lg:block" />
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-5 flex flex-col gap-4 rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/50 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">
            <LocalizedText
              en="Create your next workflow with natural language"
              zhHant="用自然語言建立下一個流程"
            />
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            <LocalizedText
              en="Mock AI first creates a validated draft, then you review risks and permissions."
              zhHant="Mock AI 會先產生可驗證草稿，再由你檢查風險與權限。"
            />
          </p>
        </div>
        <Link
          className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700"
          href="/dashboard/workflows/new"
        >
          <LocalizedText en="Start creating" zhHant="開始建立" />
          <ArrowRightIcon className="size-4" />
        </Link>
      </section>
    </div>
  );
}
