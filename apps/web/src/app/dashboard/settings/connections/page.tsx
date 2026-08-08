import type { Metadata } from 'next';
import Link from 'next/link';

import { LocalizedText } from '@/components/language-provider';
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
          <LocalizedText en="Settings" zhHant="設定" />
        </Link>
        <span className="mx-2 text-slate-300">/</span>
        <span className="text-slate-800">
          <LocalizedText en="Connections" zhHant="連線" />
        </span>
      </nav>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
        <LocalizedText en="Connected services" zhHant="已連線服務" />
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
        <LocalizedText en="External service connections" zhHant="外部服務連線" />
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        <LocalizedText
          en="Manage Google Workspace connections available to workflows. Access and refresh tokens are never displayed here."
          zhHant="管理工作流可引用的 Google Workspace connection。這裡永遠不顯示 Access Token 或 Refresh Token。"
        />
      </p>
      {query.google === 'upgraded' ? (
        <p
          className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-900"
          role="status"
        >
          <LocalizedText
            en="A new upgraded Google connection was created with a new ID. Existing reviewed workflows and runs still reference the older connection; create a new plan before running GAS work."
            zhHant="已用新的 ID 建立升級版 Google 連線。既有已審閱工作流與執行仍引用舊連線；請重新建立計畫後再執行 GAS 工作。"
          />
        </p>
      ) : query.google === 'connected' ? (
        <p
          className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
          role="status"
        >
          <LocalizedText
            en="The Google Workspace authorization was saved encrypted."
            zhHant="Google Workspace 授權已更新並加密保存。"
          />
        </p>
      ) : query.google === 'error' ? (
        <p
          className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
          role="alert"
        >
          <LocalizedText
            en="Google OAuth did not complete. Reconnect and try again; detailed credential errors are not shown in the browser."
            zhHant="Google OAuth 未完成。請重新連線；詳細憑證錯誤不會顯示於瀏覽器。"
          />
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
