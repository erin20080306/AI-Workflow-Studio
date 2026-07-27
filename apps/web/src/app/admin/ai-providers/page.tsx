import type { Metadata } from 'next';
import Link from 'next/link';

import { ArrowRightIcon, CheckIcon, ShieldIcon, SparkIcon } from '@/components/icons';
import { LocalizedText } from '@/components/language-provider';
import { updateAiModelMappingAction } from '@/app/admin/actions';
import { ALLOWED_AI_MODELS_BY_TIER, type ProductionAiProvider } from '@/lib/ai-model-catalog';
import { listAiModelMappings } from '@/lib/ai-model-routing';
import { listAiProviderHealth, type AiProviderHealthStatus } from '@/lib/ai-provider-health';
import { getEnvironment } from '@/lib/env';

export const metadata: Metadata = {
  title: 'AI Provider 狀態',
};

const providerCopy = {
  anthropic: {
    environmentVariable: 'ANTHROPIC_API_KEY',
    label: 'Claude',
  },
  gemini: {
    environmentVariable: 'GEMINI_API_KEY',
    label: 'Gemini',
  },
  openai: {
    environmentVariable: 'OPENAI_API_KEY',
    label: 'OpenAI',
  },
} as const;

const tierCopy = {
  advanced: { en: 'Advanced', zhHant: '進階' },
  economy: { en: 'Economy', zhHant: '經濟' },
  flagship: { en: 'Flagship', zhHant: '旗艦' },
  standard: { en: 'Standard', zhHant: '標準' },
} as const;

const healthCopy: Readonly<
  Record<
    AiProviderHealthStatus,
    {
      readonly className: string;
      readonly en: string;
      readonly zhHant: string;
    }
  >
> = {
  authentication_failed: {
    className: 'bg-rose-100 text-rose-800',
    en: 'Authentication failed',
    zhHant: '驗證失敗',
  },
  available: {
    className: 'bg-emerald-100 text-emerald-800',
    en: 'Verified',
    zhHant: '已驗證',
  },
  not_configured: {
    className: 'bg-slate-100 text-slate-500',
    en: 'Not configured',
    zhHant: '尚未設定',
  },
  rate_limited: {
    className: 'bg-amber-100 text-amber-900',
    en: 'Quota limited',
    zhHant: '配額受限',
  },
  unreachable: {
    className: 'bg-amber-100 text-amber-900',
    en: 'Check unavailable',
    zhHant: '目前無法檢查',
  },
};

export default async function AdminAiProvidersPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ readonly status?: string }>;
}>) {
  const environment = getEnvironment();
  const status = (await searchParams).status;
  const mappings = await listAiModelMappings();
  const providerHealth = await listAiProviderHealth();
  const providers = (Object.keys(providerCopy) as readonly (keyof typeof providerCopy)[]).map(
    (provider) => {
      const health = providerHealth.find((item) => item.provider === provider);
      const healthStatus =
        health?.status ?? (environment.providers[provider] ? 'unreachable' : 'not_configured');
      return {
        environmentVariable: providerCopy[provider].environmentVariable,
        healthStatus,
        label: providerCopy[provider].label,
        mappings: mappings.filter((mapping) => mapping.provider === provider),
        provider,
      };
    },
  );

  return (
    <div>
      <Link
        className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-700 transition hover:text-indigo-900"
        href="/admin"
      >
        ← <LocalizedText en="Platform administration" zhHant="平台管理總覽" />
      </Link>

      <header className="mt-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
          <LocalizedText en="Server-only configuration" zhHant="僅限伺服器端設定" />
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em] text-slate-950">
          <LocalizedText en="AI provider status" zhHant="AI Provider 狀態" />
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          <LocalizedText
            en="This page exposes only readiness and model names. API keys are managed in Vercel Production environment variables and are never returned to this page."
            zhHant="此頁只顯示就緒狀態與模型名稱。API 金鑰由 Vercel Production 環境變數管理，永遠不會回傳到這個頁面。"
          />
        </p>
      </header>

      {status !== undefined ? (
        <p
          className={`mt-5 rounded-xl border px-4 py-3 text-sm font-semibold ${
            status === 'model-updated'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {status === 'model-updated' ? (
            <LocalizedText en="Model mapping updated." zhHant="模型對應已更新。" />
          ) : (
            <LocalizedText
              en="The model mapping could not be updated."
              zhHant="模型對應無法更新。"
            />
          )}
        </p>
      ) : null}

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-4" aria-label="AI providers">
          {providers.map((provider) => (
            <article
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              key={provider.label}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
                    <SparkIcon className="size-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-slate-950">{provider.label}</h2>
                    <p className="mt-3 font-mono text-[10px] text-slate-400">
                      {provider.environmentVariable}
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
                    healthCopy[provider.healthStatus].className
                  }`}
                >
                  {provider.healthStatus === 'available' && <CheckIcon className="size-3.5" />}
                  <LocalizedText
                    en={healthCopy[provider.healthStatus].en}
                    zhHant={healthCopy[provider.healthStatus].zhHant}
                  />
                </span>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {provider.mappings.map((mapping) => (
                  <form
                    action={updateAiModelMappingAction}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    key={mapping.tier}
                  >
                    <input name="provider" type="hidden" value={provider.provider} />
                    <input name="tier" type="hidden" value={mapping.tier} />
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
                        <LocalizedText
                          en={tierCopy[mapping.tier].en}
                          zhHant={tierCopy[mapping.tier].zhHant}
                        />
                      </p>
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <input defaultChecked={mapping.enabled} name="enabled" type="checkbox" />
                        <LocalizedText en="Enabled" zhHant="開放" />
                      </label>
                    </div>
                    <select
                      className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700"
                      defaultValue={mapping.model}
                      name="model"
                    >
                      {ALLOWED_AI_MODELS_BY_TIER[provider.provider as ProductionAiProvider][
                        mapping.tier
                      ].map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-[10px] text-slate-400">
                        {mapping.costMultiplier.toFixed(1)}×
                        {mapping.reasoningEffort === undefined
                          ? ''
                          : ` · ${mapping.reasoningEffort}`}
                      </span>
                      <button
                        className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white"
                        type="submit"
                      >
                        <LocalizedText en="Update" zhHant="更新" />
                      </button>
                    </div>
                  </form>
                ))}
              </div>
            </article>
          ))}
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                  <ShieldIcon className="size-5" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-slate-950">Microsoft Store</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    <LocalizedText
                      en="Only verified Store subscription entitlements can grant paid customer plans."
                      zhHant="一般客戶的付費方案只能由已驗證的 Store 訂閱權益授予。"
                    />
                  </p>
                  <p className="mt-3 font-mono text-[10px] text-slate-400">
                    MICROSOFT_STORE_* · {environment.microsoftStore.planMappings.length} mappings
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
                  environment.microsoftStore.configured
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {environment.microsoftStore.configured && <CheckIcon className="size-3.5" />}
                {environment.microsoftStore.configured ? (
                  <LocalizedText en="Configured" zhHant="已設定" />
                ) : (
                  <LocalizedText en="Not configured" zhHant="尚未設定" />
                )}
              </span>
            </div>
          </article>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm">
            <div className="flex items-center gap-2 text-emerald-300">
              <ShieldIcon className="size-4" />
              <h2 className="text-xs font-bold uppercase tracking-[0.14em]">
                <LocalizedText en="Secret boundary" zhHant="機密界線" />
              </h2>
            </div>
            <p className="mt-4 text-sm font-semibold">
              <LocalizedText en="Keys stay in Vercel" zhHant="金鑰只保留在 Vercel" />
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              <LocalizedText
                en="Use encrypted Production variables without the NEXT_PUBLIC_ prefix. A redeployment is required after a change."
                zhHant="請使用加密的 Production 環境變數，名稱不可加上 NEXT_PUBLIC_ 前綴；變更後需重新部署。"
              />
            </p>
          </section>

          <a
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-indigo-300"
            href="https://vercel.com/docs/environment-variables"
            rel="noreferrer"
            target="_blank"
          >
            <LocalizedText en="Vercel environment variables" zhHant="Vercel 環境變數說明" />
            <ArrowRightIcon className="size-4 text-indigo-600" />
          </a>
        </aside>
      </div>
    </div>
  );
}
