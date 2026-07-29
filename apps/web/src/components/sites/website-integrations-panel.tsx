'use client';

import { useEffect, useMemo, useState } from 'react';

import { CheckIcon, ShieldIcon } from '@/components/icons';
import { useLanguage } from '@/components/language-provider';
import {
  WebsiteIntegrationPlanResponseSchema,
  WebsiteIntegrationPlansResponseSchema,
  defaultProviderForKind,
  emptyWebsiteIntegrationChecklist,
  websiteIntegrationGuide,
  websiteIntegrationPlanStatus,
  type WebsiteIntegrationChecklist,
  type WebsiteIntegrationKind,
  type WebsiteIntegrationPlan,
} from '@/lib/website-integration-guidance';

const kinds = ['contact', 'analytics', 'payment', 'api'] as const;
type ChecklistKey = keyof WebsiteIntegrationChecklist;

const copy = {
  en: {
    account: 'Provider account',
    action: 'Open official provider setup',
    callbacks: 'Redirect / webhook / server paths',
    checklist: {
      callbackUrlsConfigured: 'I registered the exact callback, redirect, and webhook paths.',
      explicitConfirmation:
        'I explicitly accept this provider test for the selected website project.',
      privacyReviewed: 'I reviewed the data flow, privacy notice, retention, and consent needs.',
      providerAccountReady: 'The customer-owned provider account and test environment are ready.',
      secretNamesConfigured:
        'The named secrets are configured only in the selected server environment.',
      serverRuntimeReady: 'The required server component is deployed in a test environment.',
      testPassed: 'The provider-specific success, failure, duplicate, and abuse tests passed.',
    },
    dataFlow: 'Data flow',
    disabled:
      'The generated static site keeps this feature disabled until the server component and provider test are accepted.',
    failed: 'The integration readiness plan could not be saved.',
    intro:
      'Choose an allowlisted module, follow the provider-specific safety contract, and record only completion states. Never paste a key or secret here.',
    kinds: {
      analytics: 'Analytics',
      api: 'External API',
      contact: 'Contact delivery',
      payment: 'Payment',
    },
    loading: 'Loading saved integration plans…',
    noCallbacks: 'No custom callback path is required.',
    noPublic: 'No public client placeholder is required.',
    noSecrets: 'No provider secret is required.',
    prerequisites: 'Implementation prerequisites',
    privacy: 'Privacy impact',
    public: 'Validated public placeholders',
    save: 'Save readiness plan',
    saving: 'Saving the non-secret readiness plan…',
    secrets: 'Server-only secret names',
    server: 'Required server component',
    status: {
      draft: 'Draft · feature remains disabled',
      ready_for_test: 'Ready for provider test · feature remains disabled',
      test_accepted: 'Provider test accepted · ready for controlled implementation',
    },
    success: 'The non-secret integration readiness plan was saved.',
    testMode: 'Required provider test',
    title: 'Safe integration workspace',
  },
  'zh-Hant': {
    account: '服務商帳戶',
    action: '開啟官方服務商設定',
    callbacks: 'Redirect／Webhook／後端路徑',
    checklist: {
      callbackUrlsConfigured: '我已設定確切的 Callback、Redirect 與 Webhook 路徑。',
      explicitConfirmation: '我明確同意此網站專案的服務商測試驗收結果。',
      privacyReviewed: '我已檢查資料流、隱私聲明、保留期限與同意需求。',
      providerAccountReady: '客戶自己的服務商帳戶與測試環境已準備完成。',
      secretNamesConfigured: '指定金鑰只設定在所選後端環境，沒有貼到本網站。',
      serverRuntimeReady: '需要的後端元件已部署在測試環境。',
      testPassed: '服務商規定的成功、失敗、重複與濫用測試皆已通過。',
    },
    dataFlow: '資料流',
    disabled: '產生的靜態網站會維持此功能停用，直到後端元件與服務商測試通過驗收。',
    failed: '目前無法儲存串接準備計畫。',
    intro:
      '選擇白名單功能，依服務商安全契約逐步完成；平台只記錄完成狀態，請勿在這裡貼上任何 Key 或 Secret。',
    kinds: {
      analytics: '網站分析',
      api: '外部 API',
      contact: '聯絡表單寄送',
      payment: '付款',
    },
    loading: '正在讀取已儲存的串接計畫…',
    noCallbacks: '不需要自訂 Callback 路徑。',
    noPublic: '不需要公開前端參數。',
    noSecrets: '不需要服務商 Secret。',
    prerequisites: '實作前置條件',
    privacy: '隱私影響',
    public: '已驗證的公開參數名稱',
    save: '儲存串接準備計畫',
    saving: '正在儲存不含金鑰的準備計畫…',
    secrets: '只限後端的金鑰名稱',
    server: '需要的後端元件',
    status: {
      draft: '草稿 · 功能維持停用',
      ready_for_test: '可進行服務商測試 · 功能維持停用',
      test_accepted: '服務商測試已驗收 · 可進入受控實作',
    },
    success: '已儲存不含金鑰的串接準備計畫。',
    testMode: '必要服務商測試',
    title: '安全串接工作區',
  },
} as const;

const checklistOrder: readonly ChecklistKey[] = [
  'providerAccountReady',
  'serverRuntimeReady',
  'secretNamesConfigured',
  'callbackUrlsConfigured',
  'privacyReviewed',
  'testPassed',
  'explicitConfirmation',
];

export function WebsiteIntegrationsPanel({
  projectId,
}: Readonly<{
  projectId: string;
}>) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const [kind, setKind] = useState<WebsiteIntegrationKind>('contact');
  const [plans, setPlans] = useState<readonly WebsiteIntegrationPlan[]>([]);
  const [checklist, setChecklist] = useState<WebsiteIntegrationChecklist>(
    emptyWebsiteIntegrationChecklist,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const provider = defaultProviderForKind(kind);
  const guide = useMemo(() => websiteIntegrationGuide(provider, locale), [locale, provider]);
  const status = websiteIntegrationPlanStatus(checklist);

  useEffect(() => {
    let active = true;
    void fetch(`/api/websites/${projectId}/integrations`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('load failed');
        return WebsiteIntegrationPlansResponseSchema.parse(await response.json()).plans;
      })
      .then((loaded) => {
        if (!active) return;
        setPlans(loaded);
        const selected = loaded.find((plan) => plan.kind === kind);
        setChecklist(selected?.checklist ?? emptyWebsiteIntegrationChecklist());
      })
      .catch(() => {
        if (active) setMessage(text.failed);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind, projectId, text.failed]);

  function selectKind(nextKind: WebsiteIntegrationKind): void {
    setKind(nextKind);
    setMessage(undefined);
    const selected = plans.find((plan) => plan.kind === nextKind);
    setChecklist(selected?.checklist ?? emptyWebsiteIntegrationChecklist());
  }

  function updateChecklist(key: ChecklistKey, checked: boolean): void {
    setMessage(undefined);
    setChecklist((current) => {
      if (key === 'explicitConfirmation' && checked) {
        return { ...current, explicitConfirmation: true };
      }
      if (key !== 'explicitConfirmation' && !checked && current.explicitConfirmation) {
        return { ...current, [key]: false, explicitConfirmation: false };
      }
      return { ...current, [key]: checked };
    });
  }

  async function save(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/websites/${projectId}/integrations`, {
        body: JSON.stringify({ checklist, kind, provider }),
        headers: { 'content-type': 'application/json' },
        method: 'PUT',
      });
      if (!response.ok) throw new Error('save failed');
      const plan = WebsiteIntegrationPlanResponseSchema.parse(await response.json()).plan;
      setPlans((current) => [...current.filter((entry) => entry.kind !== kind), plan]);
      setChecklist(plan.checklist);
      setMessage(text.success);
    } catch {
      setMessage(text.failed);
    } finally {
      setSaving(false);
    }
  }

  const prerequisitesReady =
    checklist.callbackUrlsConfigured &&
    checklist.privacyReviewed &&
    checklist.providerAccountReady &&
    checklist.secretNamesConfigured &&
    checklist.serverRuntimeReady &&
    checklist.testPassed;

  return (
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">Phase 40</p>
      <h3 className="mt-2 text-xl font-semibold text-slate-950">{text.title}</h3>
      <p className="mt-2 max-w-4xl text-xs leading-6 text-slate-600">{text.intro}</p>
      <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">
        {text.disabled}
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {kinds.map((value) => {
          const saved = plans.find((plan) => plan.kind === value);
          return (
            <button
              aria-pressed={kind === value}
              className={`rounded-2xl border p-3 text-left ${
                kind === value
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-900'
              }`}
              key={value}
              onClick={() => selectKind(value)}
              type="button"
            >
              <span className="block text-sm font-semibold">{text.kinds[value]}</span>
              <span
                className={`mt-1 block text-[10px] ${
                  kind === value ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                {text.status[saved?.status ?? 'draft']}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="mt-5 text-sm text-slate-500">{text.loading}</p>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                  {text.kinds[kind]}
                </p>
                <h4 className="mt-1 text-base font-semibold text-slate-950">
                  {guide.providerLabel}
                </h4>
              </div>
              <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-slate-700">
                {text.status[status]}
              </span>
            </div>

            <dl className="mt-4 space-y-3 text-xs">
              {[
                [text.server, guide.serverComponent],
                [text.account, guide.account],
                [text.dataFlow, guide.dataFlow],
                [text.privacy, guide.privacyImpact],
                [text.testMode, guide.testMode],
              ].map(([label, value]) => (
                <div className="rounded-xl bg-white p-3" key={label}>
                  <dt className="font-semibold text-slate-500">{label}</dt>
                  <dd className="mt-1 leading-5 text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>

            <h5 className="mt-4 text-xs font-semibold text-slate-900">{text.prerequisites}</h5>
            <ol className="mt-2 space-y-2 text-xs leading-5 text-slate-600">
              {guide.prerequisites.map((step, index) => (
                <li className="flex gap-2" key={step}>
                  <span className="font-mono text-indigo-600">{index + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <a
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-900"
              href={guide.actionUrl}
              rel="noreferrer"
              target="_blank"
            >
              {text.action} ↗
            </a>
          </article>

          <article className="rounded-2xl border border-slate-200 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-600">{text.secrets}</p>
                <p className="mt-2 break-words font-mono text-[10px] leading-5 text-slate-900">
                  {guide.secretNames.length > 0 ? guide.secretNames.join(' · ') : text.noSecrets}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-600">{text.public}</p>
                <p className="mt-2 break-words font-mono text-[10px] leading-5 text-slate-900">
                  {guide.publicPlaceholders.length > 0
                    ? guide.publicPlaceholders.join(' · ')
                    : text.noPublic}
                </p>
              </div>
            </div>
            <div className="mt-3 rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-600">{text.callbacks}</p>
              <p className="mt-2 break-words font-mono text-[10px] leading-5 text-slate-900">
                {guide.callbacks.length > 0 ? guide.callbacks.join(' · ') : text.noCallbacks}
              </p>
            </div>

            <div className="mt-4 space-y-2">
              {checklistOrder.map((key) => (
                <label
                  className={`flex items-start gap-3 rounded-xl border p-3 text-xs leading-5 ${
                    key === 'explicitConfirmation'
                      ? 'border-indigo-200 bg-indigo-50 font-semibold text-indigo-950'
                      : 'border-slate-200 text-slate-700'
                  }`}
                  key={key}
                >
                  <input
                    checked={checklist[key]}
                    className="mt-0.5 size-4"
                    disabled={saving || (key === 'explicitConfirmation' && !prerequisitesReady)}
                    onChange={(event) => updateChecklist(key, event.target.checked)}
                    type="checkbox"
                  />
                  <span>{text.checklist[key]}</span>
                </label>
              ))}
            </div>

            <button
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              disabled={saving}
              onClick={() => void save()}
              type="button"
            >
              {status === 'test_accepted' ? (
                <CheckIcon className="size-4" />
              ) : (
                <ShieldIcon className="size-4" />
              )}
              {saving ? text.saving : text.save}
            </button>
            {message !== undefined ? (
              <p
                aria-live="polite"
                className={`mt-3 rounded-xl p-3 text-xs font-semibold ${
                  message === text.success
                    ? 'bg-emerald-50 text-emerald-900'
                    : 'bg-rose-50 text-rose-800'
                }`}
              >
                {message}
              </p>
            ) : null}
          </article>
        </div>
      )}
    </section>
  );
}
