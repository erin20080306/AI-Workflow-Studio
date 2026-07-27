import type { Metadata } from 'next';
import Link from 'next/link';

import { ArrowRightIcon, CheckIcon, ShieldIcon, SparkIcon } from '@/components/icons';
import { LocalizedText } from '@/components/language-provider';
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

export default function AdminAiProvidersPage() {
  const environment = getEnvironment();
  const providers = (Object.keys(providerCopy) as readonly (keyof typeof providerCopy)[]).map(
    (provider) => ({
      configured: environment.providers[provider],
      environmentVariable: providerCopy[provider].environmentVariable,
      label: providerCopy[provider].label,
      model: environment.providerModels[provider],
    }),
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
                    <p className="mt-1 font-mono text-xs text-slate-500">{provider.model}</p>
                    <p className="mt-3 font-mono text-[10px] text-slate-400">
                      {provider.environmentVariable}
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
                    provider.configured
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {provider.configured && <CheckIcon className="size-3.5" />}
                  {provider.configured ? (
                    <LocalizedText en="Configured" zhHant="已設定" />
                  ) : (
                    <LocalizedText en="Not configured" zhHant="尚未設定" />
                  )}
                </span>
              </div>
            </article>
          ))}
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
