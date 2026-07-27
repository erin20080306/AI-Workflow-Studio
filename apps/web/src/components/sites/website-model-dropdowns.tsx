'use client';

import type { WebsiteGenerationSelection } from '@ai-workflow-studio/website-schema';

import type { AiModelTierSelection, AiTierOption } from '@/lib/ai-model-selection';
import type { WebsiteGenerationModelOption } from '@/lib/website-generation-models';

const providerBySelection = {
  anthropic: 'anthropic',
  auto: undefined,
  gemini: 'gemini',
  mock: undefined,
  openai: 'openai',
} as const;

export function WebsiteModelDropdowns({
  disabled = false,
  locale,
  modelOptions,
  onModelChange,
  onTierChange,
  selectedModel,
  selectedTier,
  tierOptions,
}: Readonly<{
  disabled?: boolean;
  locale: 'en' | 'zh-Hant';
  modelOptions: readonly WebsiteGenerationModelOption[];
  onModelChange(value: WebsiteGenerationSelection): void;
  onTierChange(value: AiModelTierSelection): void;
  selectedModel: WebsiteGenerationSelection;
  selectedTier: AiModelTierSelection;
  tierOptions: readonly AiTierOption[];
}>) {
  const text =
    locale === 'en'
      ? {
          autoTier: 'Auto · cost and task aware',
          locked: 'requires a higher Store plan',
          model: 'Model',
          tier: 'Performance level',
        }
      : {
          autoTier: '自動 · 依任務與成本選擇',
          locked: '需要更高 Microsoft Store 方案',
          model: '模型',
          tier: '效能等級',
        };
  const tier =
    selectedTier === 'auto' ? undefined : tierOptions.find((item) => item.id === selectedTier);
  const provider = providerBySelection[selectedModel];
  const exactModel =
    tier === undefined || provider === undefined
      ? undefined
      : tier.models.find((item) => item.provider === provider);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <label className="text-xs font-semibold text-slate-600">
        <span className="mb-1.5 block">{text.model}</span>
        <select
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500"
          disabled={disabled}
          onChange={(event) => onModelChange(event.target.value as WebsiteGenerationSelection)}
          value={selectedModel}
        >
          {modelOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
              {option.id === 'auto'
                ? ''
                : ` · ${locale === 'en' ? option.level.en : option.level.zhHant}`}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-semibold text-slate-600">
        <span className="mb-1.5 block">{text.tier}</span>
        <select
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500"
          disabled={disabled}
          onChange={(event) => onTierChange(event.target.value as AiModelTierSelection)}
          value={selectedTier}
        >
          <option value="auto">{text.autoTier}</option>
          {tierOptions.map((option) => (
            <option disabled={!option.enabled} key={option.id} value={option.id}>
              {locale === 'en' ? option.label.en : option.label.zhHant}
              {' · '}
              {option.models.map((model) => `${model.providerLabel} ${model.model}`).join(' / ')}
              {option.enabled ? '' : ` · ${text.locked}`}
            </option>
          ))}
        </select>
      </label>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-slate-600 lg:col-span-2">
        {exactModel === undefined ? (
          <span>{text.autoTier}</span>
        ) : (
          <>
            <span className="font-semibold text-slate-800">{exactModel.providerLabel}</span>
            <code className="ml-2 break-all font-mono text-[10px]">{exactModel.model}</code>
          </>
        )}
      </div>
    </div>
  );
}
