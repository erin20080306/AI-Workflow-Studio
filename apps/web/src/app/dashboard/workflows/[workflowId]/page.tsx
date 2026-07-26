import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ChevronRightIcon, DeviceIcon, FlowIcon } from '@/components/icons';
import { WorkflowDetailActions } from '@/components/workflows/workflow-detail-actions';
import { WorkflowReview } from '@/components/workflows/workflow-review';
import {
  MOCK_WORKFLOW_SUMMARIES,
  MOCK_WORKFLOW_VERSIONS,
  getMockWorkflow,
} from '@/lib/mock-workflows';

interface WorkflowDetailPageProps {
  readonly params: Promise<{
    readonly workflowId: string;
  }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return MOCK_WORKFLOW_SUMMARIES.map((workflow) => ({
    workflowId: workflow.id,
  }));
}

export async function generateMetadata({ params }: WorkflowDetailPageProps): Promise<Metadata> {
  const { workflowId } = await params;
  const workflow = getMockWorkflow(workflowId);
  return {
    title: workflow?.name ?? '找不到工作流',
  };
}

export default async function WorkflowDetailPage({ params }: WorkflowDetailPageProps) {
  const { workflowId } = await params;
  const workflow = getMockWorkflow(workflowId);
  if (workflow === undefined) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-[1440px]">
      <nav
        aria-label="Breadcrumb"
        className="mb-5 flex items-center gap-1.5 text-xs text-slate-500"
      >
        <Link className="transition hover:text-indigo-700" href="/dashboard/workflows">
          工作流
        </Link>
        <ChevronRightIcon className="size-3.5 text-slate-300" />
        <span aria-current="page" className="truncate font-medium text-slate-800">
          {workflow.name}
        </span>
      </nav>

      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
            Workflow detail · Mock
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
            {workflow.name}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{workflow.description}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700">
            <FlowIcon className="size-4 text-indigo-600" />
            v3 · {workflow.nodes.length} 個節點
          </span>
          <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700">
            <DeviceIcon className="size-4 text-emerald-600" />
            Erin’s MacBook Air
          </span>
        </div>
      </header>

      <div className="mt-6">
        <WorkflowDetailActions />
      </div>

      <section className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">視覺化流程</h2>
            <p className="mt-1 text-xs text-slate-500">選取節點以查看安全設定與核准規則。</p>
          </div>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700">
            Current v3
          </span>
        </div>
        <WorkflowReview workflow={workflow} />
      </section>

      <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 className="text-base font-semibold text-slate-950">版本紀錄</h2>
          <p className="mt-1 text-xs text-slate-500">每次修改都建立不可變更的 Workflow 版本。</p>
        </div>
        <div className="divide-y divide-slate-100">
          {MOCK_WORKFLOW_VERSIONS.map((version) => (
            <Link
              className="group grid gap-3 px-5 py-4 transition hover:bg-slate-50 sm:grid-cols-[70px_minmax(0,1fr)_170px_110px] sm:items-center sm:px-6"
              href={`/dashboard/workflows/${workflowId}/versions/${version.id}`}
              key={version.id}
            >
              <span className="text-sm font-semibold text-slate-950">{version.label}</span>
              <div>
                <p className="text-sm text-slate-700">{version.note}</p>
                <p className="mt-1 text-xs text-slate-400 sm:hidden">{version.author}</p>
              </div>
              <p className="hidden text-xs text-slate-500 sm:block">{version.author}</p>
              <span
                className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  version.status === 'current'
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {version.status === 'current' ? '目前版本' : '已封存'}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
