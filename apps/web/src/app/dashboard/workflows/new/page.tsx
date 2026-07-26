import type { Metadata } from 'next';
import Link from 'next/link';

import { ChevronRightIcon } from '@/components/icons';
import { LocalizedText } from '@/components/language-provider';
import { WorkflowComposer } from '@/components/workflows/workflow-composer';

export const metadata: Metadata = {
  title: '新建工作流',
};

export default function NewWorkflowPage() {
  return (
    <div className="mx-auto max-w-[1440px]">
      <nav
        aria-label="Breadcrumb"
        className="mb-5 flex items-center gap-1.5 text-xs text-slate-500"
      >
        <Link className="transition hover:text-indigo-700" href="/dashboard/workflows">
          <LocalizedText en="Workflows" zhHant="工作流" />
        </Link>
        <ChevronRightIcon className="size-3.5 text-slate-300" />
        <span aria-current="page" className="font-medium text-slate-800">
          <LocalizedText en="New" zhHant="新建" />
        </span>
      </nav>
      <WorkflowComposer />
    </div>
  );
}
