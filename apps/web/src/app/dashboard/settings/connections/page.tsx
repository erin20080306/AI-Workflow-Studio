import type { Metadata } from 'next';
import Link from 'next/link';

import { GoogleConnectionsPanel } from '@/components/settings/google-connections-panel';
import { googleConnectionPageState } from '@/lib/google-connections';

export const metadata: Metadata = {
  title: '連線',
};

export default async function ConnectionsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly google?: string }>;
}) {
  const [state, query] = await Promise.all([googleConnectionPageState(), searchParams]);
  return (
    <div className="mx-auto max-w-[1120px]">
      <nav className="text-xs font-semibold text-slate-500">
        <Link className="transition hover:text-indigo-700" href="/dashboard/settings">
          設定
        </Link>
        <span className="mx-2 text-slate-300">/</span>
        <span className="text-slate-800">連線</span>
      </nav>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
        Connected services
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
        外部服務連線
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        管理工作流可引用的 Google Sheets connection。這裡永遠不顯示 Access Token 或 Refresh Token。
      </p>
      {query.google === 'connected' ? (
        <p
          className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
          role="status"
        >
          Google Sheets 連線已建立並加密保存。
        </p>
      ) : query.google === 'error' ? (
        <p
          className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
          role="alert"
        >
          Google OAuth 未完成。請重新連線；詳細憑證錯誤不會顯示於瀏覽器。
        </p>
      ) : null}
      <GoogleConnectionsPanel
        configured={state.configured}
        initialConnections={state.connections}
        mockMode={state.mockMode}
      />
    </div>
  );
}
