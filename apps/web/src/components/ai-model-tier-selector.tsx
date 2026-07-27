'use client';

import type { AiModelTierSelection, AiTierOption } from '@/lib/ai-model-selection';

export function AiModelTierSelector({
  autoLabel,
  disabled = false,
  lockedLabel,
  locale,
  onChange,
  selected,
  tiers,
}: Readonly<{
  autoLabel: string;
  disabled?: boolean;
  lockedLabel: string;
  locale: 'en' | 'zh-Hant';
  onChange(tier: AiModelTierSelection): void;
  selected: AiModelTierSelection;
  tiers: readonly AiTierOption[];
}>) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          aria-pressed={selected === 'auto'}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            selected === 'auto'
              ? 'bg-slate-950 text-white'
              : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
          }`}
          disabled={disabled}
          onClick={() => onChange('auto')}
          type="button"
        >
          {autoLabel}
        </button>
        {tiers.map((tier) => (
          <button
            aria-pressed={selected === tier.id}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              selected === tier.id
                ? 'bg-indigo-600 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
            } disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300`}
            disabled={disabled || !tier.enabled}
            key={tier.id}
            onClick={() => onChange(tier.id)}
            type="button"
          >
            {locale === 'en' ? tier.label.en : tier.label.zhHant}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {tiers.map((tier) => (
          <article
            className={`rounded-xl border p-3 ${
              tier.enabled
                ? 'border-slate-200 bg-slate-50'
                : 'border-slate-100 bg-slate-50/60 opacity-55'
            }`}
            key={tier.id}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                {locale === 'en' ? tier.label.en : tier.label.zhHant}
              </h3>
              {!tier.enabled ? (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-bold text-slate-500">
                  {lockedLabel}
                </span>
              ) : null}
            </div>
            <ul className="mt-2 space-y-1.5">
              {tier.models.map((model) => (
                <li className="min-w-0 text-[10px] leading-4 text-slate-600" key={model.provider}>
                  <span className="font-semibold text-slate-800">{model.providerLabel}</span>
                  <code className="ml-1 break-all font-mono text-[9px] text-slate-500">
                    {model.model}
                  </code>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
