'use client';

import {
  WebsiteSpecClientGenerationSchema,
  type WebsitePublication,
  type WebsiteGenerationSelection,
  type WebsiteSpecClientGeneration,
} from '@ai-workflow-studio/website-schema';
import { useState } from 'react';
import { z } from 'zod';

import { CheckIcon, ShieldIcon, SparkIcon } from '@/components/icons';
import { useLanguage } from '@/components/language-provider';
import { WebsiteModelDropdowns } from '@/components/sites/website-model-dropdowns';
import { WebsiteSpecEditor } from '@/components/sites/website-spec-editor';
import type { AiModelTierSelection, AiTierOption } from '@/lib/ai-model-selection';
import type { WebsiteGenerationModelOption } from '@/lib/website-generation-models';

const GenerationResponseSchema = z.object({
  generation: WebsiteSpecClientGenerationSchema,
});

const copy = {
  en: {
    attempt: 'Validated attempts',
    available: 'Choose a model',
    empty:
      'AI website generation is not enabled yet. Ask the platform administrator to configure a server-only provider.',
    failed: 'The website specification could not be generated or did not pass validation.',
    generate: 'Generate validated website spec',
    generated: 'Website specification validated',
    generating: 'Generating safely…',
    pages: 'Pages',
    phase: 'AI specification · Phase 24',
    provider: 'Provider',
    safety:
      'Only registered components, bounded copy, internal actions, and asset references are accepted. Code and arbitrary URLs are rejected.',
    sections: 'Registered sections',
    title: 'Turn this brief into a safe website structure',
    version: 'Spec version',
  },
  'zh-Hant': {
    attempt: '通過驗證的嘗試次數',
    available: '選擇模型',
    empty: 'AI 網站生成功能尚未開放，請由平台管理者在伺服器端設定至少一個 Provider。',
    failed: '網站規格無法產生，或內容未通過安全驗證。',
    generate: '產生已驗證網站規格',
    generated: '網站規格已通過驗證',
    generating: '安全產生中…',
    pages: '頁面',
    phase: 'AI 網站規格 · Phase 24',
    provider: 'Provider',
    safety: '只接受已註冊元件、有上限的文案、內部動作與素材參照；程式碼及任意網址會被拒絕。',
    sections: '已註冊區塊',
    title: '將需求轉成安全的網站結構',
    version: '規格版本',
  },
} as const;

export function WebsiteSpecGenerator({
  canExportWebsite,
  initialGeneration,
  initialPublication,
  initialVersions,
  modelOptions,
  projectId,
  tierOptions,
}: Readonly<{
  canExportWebsite: boolean;
  initialGeneration: WebsiteSpecClientGeneration | undefined;
  initialPublication: WebsitePublication | undefined;
  initialVersions: readonly WebsiteSpecClientGeneration[];
  modelOptions: readonly WebsiteGenerationModelOption[];
  projectId: string;
  tierOptions: readonly AiTierOption[];
}>) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const [selected, setSelected] = useState<WebsiteGenerationSelection>(
    modelOptions[0]?.id ?? 'auto',
  );
  const [selectedTier, setSelectedTier] = useState<AiModelTierSelection>('auto');
  const [generation, setGeneration] = useState(initialGeneration);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string>();

  async function generate(): Promise<void> {
    if (generating || modelOptions.length === 0 || generation !== undefined) return;
    setGenerating(true);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/websites/${projectId}/spec`, {
        body: JSON.stringify({ locale, model: selected, tier: selectedTier }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error('generation failed');
      setGeneration(GenerationResponseSchema.parse(payload).generation);
    } catch {
      setMessage(text.failed);
    } finally {
      setGenerating(false);
    }
  }

  const sectionCount =
    generation?.spec.pages.reduce((sum, page) => sum + page.sections.length, 0) ?? 0;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
          <SparkIcon className="size-5" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">
            {text.phase}
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-slate-950">
            {text.title}
          </h2>
          <p className="mt-2 text-xs leading-6 text-slate-500">{text.safety}</p>
        </div>
      </div>

      {generation === undefined ? (
        modelOptions.length > 0 ? (
          <>
            <div className="mt-6">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                {text.available}
              </p>
              <WebsiteModelDropdowns
                disabled={generating}
                locale={locale}
                modelOptions={modelOptions}
                onModelChange={setSelected}
                onTierChange={setSelectedTier}
                selectedModel={selected}
                selectedTier={selectedTier}
                tierOptions={tierOptions}
              />
            </div>
            <button
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={generating}
              onClick={() => void generate()}
              type="button"
            >
              <ShieldIcon className="size-4" />
              {generating ? text.generating : text.generate}
            </button>
          </>
        ) : (
          <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium leading-6 text-amber-900">
            {text.empty}
          </p>
        )
      ) : (
        <div className="mt-6">
          <p className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-900">
            <CheckIcon className="size-4" />
            {text.generated}
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              [text.version, generation.version],
              [text.pages, generation.spec.pages.length],
              [text.sections, sectionCount],
              [text.provider, generation.provider],
              [text.attempt, generation.attempts],
            ].map(([label, value]) => (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4" key={label}>
                <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  {label}
                </dt>
                <dd className="mt-2 break-words text-sm font-semibold text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
          <WebsiteSpecEditor
            canExportWebsite={canExportWebsite}
            initialGeneration={generation}
            initialPublication={initialPublication}
            initialVersions={initialVersions.length === 0 ? [generation] : initialVersions}
            modelOptions={modelOptions}
            projectId={projectId}
            tierOptions={tierOptions}
          />
        </div>
      )}

      {message !== undefined ? (
        <p
          aria-live="polite"
          className="mt-4 rounded-xl bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-800"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
