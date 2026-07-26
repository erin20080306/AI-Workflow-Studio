'use client';

import { useState } from 'react';

import { CheckIcon, ShieldIcon, SparkIcon } from '@/components/icons';

export interface ProviderSettingView {
  readonly configured: boolean;
  readonly description: string;
  readonly id: 'anthropic' | 'gemini' | 'mock' | 'openai';
  readonly label: string;
  readonly model: string;
}

export function ProviderSettingsPanel({
  providers,
}: Readonly<{
  providers: readonly ProviderSettingView[];
}>) {
  const [selectedProvider, setSelectedProvider] = useState('mock');
  const [saved, setSaved] = useState(false);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        {providers.map((provider) => {
          const selectable = provider.configured || provider.id === 'mock';
          const selected = selectedProvider === provider.id;
          return (
            <article
              className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
                selected ? 'border-indigo-400 ring-4 ring-indigo-50' : 'border-slate-200'
              }`}
              key={provider.id}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <span
                    className={`grid size-11 shrink-0 place-items-center rounded-xl ${
                      provider.id === 'mock'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-indigo-100 text-indigo-700'
                    }`}
                  >
                    <SparkIcon className="size-5" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-950">{provider.label}</h2>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${
                          selectable
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {selectable ? 'Available' : 'Key required'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{provider.description}</p>
                    <div className="mt-3 inline-flex rounded-lg bg-slate-100 px-2.5 py-1.5 font-mono text-[11px] text-slate-700">
                      {provider.model}
                    </div>
                  </div>
                </div>
                <button
                  aria-pressed={selected}
                  className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold ${
                    selected
                      ? 'bg-indigo-600 text-white'
                      : selectable
                        ? 'border border-slate-300 text-slate-700'
                        : 'cursor-not-allowed bg-slate-100 text-slate-400'
                  }`}
                  disabled={!selectable}
                  onClick={() => {
                    setSelectedProvider(provider.id);
                    setSaved(false);
                  }}
                  type="button"
                >
                  {selected ? '目前預設' : '設為預設'}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <aside className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
          <div className="flex items-center gap-2 text-emerald-300">
            <ShieldIcon className="size-4" />
            <h2 className="text-xs font-bold uppercase tracking-[0.14em]">Secret boundary</h2>
          </div>
          <p className="mt-4 text-sm font-semibold">API keys 永遠不送到瀏覽器</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            此頁只接收「是否已設定」與模型名稱。金鑰只從 Server Environment 讀取，回應與 usage log
            均不包含金鑰、Prompt 或原始輸出。
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-950">7 日用量 · Mock</h2>
          <dl className="mt-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Planner requests</dt>
              <dd className="font-semibold text-slate-900">18</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Input units</dt>
              <dd className="font-semibold text-slate-900">12,480</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Output units</dt>
              <dd className="font-semibold text-slate-900">8,120</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Rejected outputs</dt>
              <dd className="font-semibold text-emerald-700">0 executed</dd>
            </div>
          </dl>
        </section>

        <button
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white"
          onClick={() => setSaved(true)}
          type="button"
        >
          <CheckIcon className="size-4" />
          儲存 Mock 設定
        </button>
        {saved && (
          <p
            aria-live="polite"
            className="rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-800"
          >
            Mock 偏好已更新；未寫入任何金鑰。
          </p>
        )}
      </aside>
    </div>
  );
}
