import type { Metadata } from 'next';
import Link from 'next/link';

import { LocalizedText } from '@/components/language-provider';
import { RunDetailsPanel } from '@/components/runs/run-details-panel';
import { getRun } from '@/lib/run-server';

export const metadata: Metadata = {
  title: 'Run details',
};

export default async function RunDetailsPage({
  params,
}: {
  readonly params: Promise<{ readonly runId: string }>;
}) {
  const run = await getRun((await params).runId);
  return (
    <div className="mx-auto max-w-[1120px]">
      <nav className="text-xs font-semibold text-slate-500">
        <Link className="transition hover:text-indigo-700" href="/dashboard/runs">
          <LocalizedText en="Run history" zhHant="執行紀錄" />
        </Link>
        <span className="mx-2 text-slate-300">/</span>
        <span className="text-slate-800">
          <LocalizedText en="Run details" zhHant="執行詳情" />
        </span>
      </nav>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
        <LocalizedText en="Correlation" zhHant="關聯識別碼" /> {run.id.slice(0, 8)}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
        <LocalizedText en="Run details" zhHant="執行詳情" />
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        <LocalizedText
          en="The client shows only counts, statuses, and safe error summaries—never local paths or row contents."
          zhHant="用戶端僅顯示計數、狀態與安全錯誤摘要，不顯示本機路徑或資料列內容。"
        />
      </p>
      <RunDetailsPanel initialRun={run} />
    </div>
  );
}
