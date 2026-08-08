'use client';

import type {
  GoogleConnectionView,
  GoogleSpreadsheetSummary,
} from '@ai-workflow-studio/google-sheets';
import { useState } from 'react';

import { CheckIcon, FlowIcon, ShieldIcon } from '@/components/icons';
import { useLanguage } from '@/components/language-provider';

interface GoogleConnectionsPanelProps {
  readonly configured: boolean;
  readonly initialConnections: readonly GoogleConnectionView[];
  readonly mockMode: boolean;
}

type PanelMessage = 'health-failed' | 'health-ok' | 'revoke-failed' | 'revoked';

const copy = {
  'zh-Hant': {
    add: '新增 Google 連線',
    checking: '檢查中…',
    confirmRevoke: '再次按下確認撤銷',
    health: '健康檢查',
    lastChecked: (value: string) => `最近檢查 ${value}`,
    messages: {
      'health-failed': '健康檢查失敗；Token 與 Google 詳細錯誤未顯示於瀏覽器。',
      'health-ok': 'Google Sheets 連線正常，試算表清單已更新。',
      'revoke-failed': '撤銷失敗，請稍後再試。',
      revoked: '連線已撤銷，本機與伺服器端不再保留可用 Token。',
    },
    mock: '目前為 Mock connection；所有清單與健康狀態皆為本機 Fixture。',
    noConnection: '尚未建立 Google Sheets 連線。',
    noHealth: '尚未執行健康檢查',
    oauthMissing: 'Server OAuth 尚未設定',
    privacy: '只載入 ID、名稱與修改時間',
    production: '正式模式必須由已驗證的 Tenant membership 取得連線。',
    reauthorizationHelp:
      '這個舊連線缺少目前 GAS 工作流程所需權限，且未保存可驗證原 Google 帳號的穩定識別。升級會建立新的連線 ID；既有工作流與執行仍引用舊連線，必須重新建立計畫。',
    reauthorizationRequired: '需要建立升級連線',
    reauthorize: '建立升級版 Google 連線',
    revoke: '撤銷',
    security: [
      'Refresh Token 僅以 AES-256-GCM 密文保存在伺服器端。',
      '工作流只保存 connectionId，不保存 Token 或 Google URL。',
      'Batch request 低於 2 MB；429 使用有上限的 exponential backoff。',
      'Append 結果不明時停止自動重試，避免重複列。',
    ],
    securityTitle: 'Token 安全界線',
    subtitle: '獨立 OAuth connection · Offline access',
  },
  en: {
    add: 'Add Google connection',
    checking: 'Checking…',
    confirmRevoke: 'Press again to confirm',
    health: 'Health check',
    lastChecked: (value: string) => `Last checked ${value}`,
    messages: {
      'health-failed':
        'Health check failed. Tokens and detailed Google errors are not shown in the browser.',
      'health-ok': 'Google Sheets is healthy and the spreadsheet list was updated.',
      'revoke-failed': 'Revocation failed. Try again later.',
      revoked: 'Connection revoked. No usable token remains locally or on the server.',
    },
    mock: 'This is a Mock connection. Lists and health data are local fixtures.',
    noConnection: 'No Google Sheets connection has been created.',
    noHealth: 'No health check yet',
    oauthMissing: 'Server OAuth is not configured',
    privacy: 'Only ID, name, and modified time are loaded',
    production: 'Live connections require a verified tenant membership.',
    reauthorizationHelp:
      'This older connection lacks current GAS access and has no stored stable Google principal to verify the same account. Upgrade creates a new connection ID; existing workflows and runs remain bound to the old connection and require a new plan.',
    reauthorizationRequired: 'Upgraded connection required',
    reauthorize: 'Create upgraded Google connection',
    revoke: 'Revoke',
    security: [
      'Refresh tokens are stored server-side only as AES-256-GCM ciphertext.',
      'Workflows store only connectionId—never a token or Google URL.',
      'Batch requests stay under 2 MB; 429 responses use bounded exponential backoff.',
      'Ambiguous append results stop automatic retries to prevent duplicate rows.',
    ],
    securityTitle: 'Token security boundary',
    subtitle: 'Independent OAuth connection · Offline access',
  },
} as const;

export function GoogleConnectionsPanel({
  configured,
  initialConnections,
  mockMode,
}: GoogleConnectionsPanelProps) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const [connections, setConnections] = useState(initialConnections);
  const [confirmRevoke, setConfirmRevoke] = useState<string>();
  const [message, setMessage] = useState<PanelMessage>();
  const [spreadsheets, setSpreadsheets] = useState<
    Readonly<Record<string, readonly GoogleSpreadsheetSummary[]>>
  >({});
  const [working, setWorking] = useState<string>();

  async function checkHealth(connectionId: string) {
    setWorking(connectionId);
    setMessage(undefined);
    try {
      const response = await fetch(
        `/api/connections/google/${encodeURIComponent(connectionId)}/health`,
        { method: 'POST' },
      );
      const value = (await response.json()) as {
        readonly connection?: GoogleConnectionView;
        readonly error?: { readonly message?: string };
        readonly spreadsheets?: readonly GoogleSpreadsheetSummary[];
      };
      if (!response.ok || value.connection === undefined) {
        throw new Error(value.error?.message ?? '連線健康檢查失敗。');
      }
      const updatedConnection = value.connection;
      setConnections((current) =>
        current.map((connection) =>
          connection.id === connectionId ? updatedConnection : connection,
        ),
      );
      setSpreadsheets((current) => ({
        ...current,
        [connectionId]: value.spreadsheets ?? [],
      }));
      setMessage('health-ok');
    } catch {
      setMessage('health-failed');
    } finally {
      setWorking(undefined);
    }
  }

  async function revoke(connectionId: string) {
    if (confirmRevoke !== connectionId) {
      setConfirmRevoke(connectionId);
      return;
    }
    setWorking(connectionId);
    setMessage(undefined);
    try {
      const response = await fetch(
        `/api/connections/google/${encodeURIComponent(connectionId)}/revoke`,
        { method: 'POST' },
      );
      if (!response.ok) {
        throw new Error('Revoke failed.');
      }
      setConnections((current) =>
        current.map((connection) =>
          connection.id === connectionId
            ? { ...connection, status: 'revoked' as const }
            : connection,
        ),
      );
      setConfirmRevoke(undefined);
      setMessage('revoked');
    } catch {
      setMessage('revoke-failed');
    } finally {
      setWorking(undefined);
    }
  }

  return (
    <div className="mt-7 grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                <FlowIcon className="size-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Google Sheets</h2>
                <p className="mt-0.5 text-xs text-slate-500">{text.subtitle}</p>
              </div>
            </div>
          </div>
          {configured ? (
            <a
              className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800"
              href="/api/connections/google/start"
            >
              {text.add}
            </a>
          ) : (
            <span className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
              {text.oauthMissing}
            </span>
          )}
        </div>

        <div className="mt-6 space-y-3">
          {connections.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
              {text.noConnection}
            </p>
          ) : null}
          {connections.map((connection) => {
            const connectionSpreadsheets = spreadsheets[connection.id] ?? [];
            const requiresReauthorization =
              connection.status !== 'revoked' && connection.requiresReauthorization;
            return (
              <article
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                key={connection.id}
              >
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`size-2.5 rounded-full ${
                          connection.status === 'active'
                            ? requiresReauthorization
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                            : connection.status === 'revoked'
                              ? 'bg-slate-400'
                              : 'bg-amber-500'
                        }`}
                      />
                      <h3 className="text-sm font-semibold text-slate-900">{connection.name}</h3>
                      <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {requiresReauthorization ? text.reauthorizationRequired : connection.status}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {connection.lastHealthCheckAt === undefined
                        ? text.noHealth
                        : text.lastChecked(
                            new Date(connection.lastHealthCheckAt).toLocaleString(
                              locale === 'en' ? 'en-US' : 'zh-TW',
                            ),
                          )}
                    </p>
                    {requiresReauthorization ? (
                      <p className="mt-3 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-900">
                        {text.reauthorizationHelp}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {configured && requiresReauthorization && connection.status === 'active' ? (
                      <a
                        className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-700"
                        href={`/api/connections/google/start?connectionId=${encodeURIComponent(connection.id)}`}
                      >
                        {text.reauthorize}
                      </a>
                    ) : null}
                    <button
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                      disabled={working === connection.id || connection.status === 'revoked'}
                      onClick={() => void checkHealth(connection.id)}
                      type="button"
                    >
                      {working === connection.id ? text.checking : text.health}
                    </button>
                    <button
                      className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                        confirmRevoke === connection.id
                          ? 'bg-red-600 text-white'
                          : 'border border-red-200 bg-white text-red-700'
                      } disabled:opacity-50`}
                      disabled={working === connection.id || connection.status === 'revoked'}
                      onClick={() => void revoke(connection.id)}
                      type="button"
                    >
                      {confirmRevoke === connection.id ? text.confirmRevoke : text.revoke}
                    </button>
                  </div>
                </div>
                {connectionSpreadsheets.length > 0 ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {connectionSpreadsheets.map((spreadsheet) => (
                      <div
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                        key={spreadsheet.id}
                      >
                        <p className="truncate text-xs font-semibold text-slate-800">
                          {spreadsheet.name}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-400">{text.privacy}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        {message === undefined ? null : (
          <p aria-live="polite" className="mt-4 text-xs font-medium text-indigo-700">
            {text.messages[message]}
          </p>
        )}
      </section>

      <aside className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm">
        <ShieldIcon className="size-7 text-emerald-300" />
        <h2 className="mt-5 text-lg font-semibold">{text.securityTitle}</h2>
        <ul className="mt-4 space-y-3 text-xs leading-5 text-slate-300">
          {text.security.map((item) => (
            <li className="flex gap-2" key={item}>
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-300" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-6 rounded-xl border border-white/10 bg-white/5 p-3 text-[11px] leading-5 text-slate-400">
          {mockMode ? text.mock : text.production}
        </p>
      </aside>
    </div>
  );
}
