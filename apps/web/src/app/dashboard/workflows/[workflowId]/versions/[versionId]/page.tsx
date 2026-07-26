import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ChevronRightIcon, ShieldIcon } from '@/components/icons';
import { LocalizedText } from '@/components/language-provider';
import { WorkflowReview } from '@/components/workflows/workflow-review';
import {
  MOCK_WORKFLOW_SUMMARIES,
  MOCK_WORKFLOW_VERSIONS,
  getMockWorkflow,
} from '@/lib/mock-workflows';

interface WorkflowVersionPageProps {
  readonly params: Promise<{
    readonly versionId: string;
    readonly workflowId: string;
  }>;
}

export const metadata: Metadata = {
  title: '工作流版本',
};

export const dynamicParams = false;

export function generateStaticParams() {
  return MOCK_WORKFLOW_SUMMARIES.flatMap((workflow) =>
    MOCK_WORKFLOW_VERSIONS.map((version) => ({
      versionId: version.id,
      workflowId: workflow.id,
    })),
  );
}

export default async function WorkflowVersionPage({ params }: WorkflowVersionPageProps) {
  const { versionId, workflowId } = await params;
  const workflow = getMockWorkflow(workflowId);
  const version = MOCK_WORKFLOW_VERSIONS.find((candidate) => candidate.id === versionId);
  if (workflow === undefined || version === undefined) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-[1440px]">
      <nav
        aria-label="Breadcrumb"
        className="mb-5 flex min-w-0 items-center gap-1.5 text-xs text-slate-500"
      >
        <Link className="shrink-0 transition hover:text-indigo-700" href="/dashboard/workflows">
          <LocalizedText en="Workflows" zhHant="工作流" />
        </Link>
        <ChevronRightIcon className="size-3.5 shrink-0 text-slate-300" />
        <Link
          className="truncate transition hover:text-indigo-700"
          href={`/dashboard/workflows/${workflowId}`}
        >
          {workflow.name}
        </Link>
        <ChevronRightIcon className="size-3.5 shrink-0 text-slate-300" />
        <span aria-current="page" className="shrink-0 font-medium text-slate-800">
          {version.label}
        </span>
      </nav>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
            <LocalizedText en="Immutable version" zhHant="不可變更版本" />
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            {workflow.name} · {version.label}
          </h1>
          <p className="mt-2 text-sm text-slate-600">{version.note}</p>
        </div>
        <span
          className={`w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${
            version.status === 'current'
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-slate-200 text-slate-700'
          }`}
        >
          {version.status === 'current' ? (
            <LocalizedText en="Current version" zhHant="目前版本" />
          ) : (
            <LocalizedText en="Read-only archive" zhHant="唯讀封存" />
          )}
        </span>
      </header>

      <section className="mt-6 flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
        <ShieldIcon className="mt-0.5 size-5 shrink-0 text-indigo-700" />
        <div>
          <h2 className="text-sm font-semibold text-indigo-950">
            <LocalizedText
              en="This version cannot be edited directly"
              zhHant="版本內容不可直接修改"
            />
          </h2>
          <p className="mt-1 text-xs leading-5 text-indigo-800">
            <LocalizedText
              en="Viewing or running a dry run never changes this version. Return to workflow details to create an editable new version."
              zhHant="檢視與 Dry Run 不會改變此版本。若要編輯，請回到工作流詳情建立新版本。"
            />
          </p>
        </div>
      </section>

      <section className="mt-6">
        <WorkflowReview workflow={workflow} />
      </section>
    </div>
  );
}
