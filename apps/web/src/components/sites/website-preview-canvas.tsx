'use client';

import type { WebsiteSpecClientGeneration } from '@ai-workflow-studio/website-schema';
import { useEffect, useState } from 'react';

import { DeviceIcon, SparkIcon } from '@/components/icons';
import { useLanguage } from '@/components/language-provider';
import {
  WEBSITE_PREVIEW_VIEWPORTS,
  type WebsitePreviewViewport,
  websitePreviewUrl,
} from '@/lib/website-preview-contract';

const copy = {
  en: {
    canvas: 'Website preview Canvas',
    canvasHelp:
      'A deterministic rendering of the validated Website Spec. Scripts, forms, external requests, and model-generated code stay disabled.',
    failed: 'The isolated preview could not be loaded.',
    loading: 'Rendering isolated preview…',
    page: 'Page',
    phase: 'Responsive preview · Phase 26',
    refresh: 'Refresh preview',
    scale: 'Zoom',
  },
  'zh-Hant': {
    canvas: '網站預覽 Canvas',
    canvasHelp:
      '由通過驗證的 Website Spec 決定性渲染；腳本、表單、外部請求及模型產生的程式碼均維持停用。',
    failed: '隔離預覽無法載入。',
    loading: '正在渲染隔離預覽…',
    page: '頁面',
    phase: '響應式預覽 · Phase 26',
    refresh: '重新整理預覽',
    scale: '縮放',
  },
} as const;

export function WebsitePreviewCanvas({
  generation,
  projectId,
}: Readonly<{
  generation: WebsiteSpecClientGeneration;
  projectId: string;
}>) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const [pageSlug, setPageSlug] = useState(generation.spec.pages[0]?.slug ?? '');
  const [viewport, setViewport] = useState<WebsitePreviewViewport>('desktop');
  const [zoom, setZoom] = useState(75);
  const [refresh, setRefresh] = useState(0);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [frameAvailable, setFrameAvailable] = useState(false);
  const dimensions = WEBSITE_PREVIEW_VIEWPORTS[viewport];
  const scale = zoom / 100;
  const source = websitePreviewUrl(projectId, pageSlug, generation.version, refresh);

  useEffect(() => {
    const controller = new AbortController();
    setFrameAvailable(false);
    setLoadState('loading');
    void fetch(source, {
      cache: 'no-store',
      method: 'HEAD',
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('preview unavailable');
        setFrameAvailable(true);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setLoadState('failed');
        }
      });
    return () => controller.abort();
  }, [source]);

  function reload(): void {
    setLoadState('loading');
    setFrameAvailable(false);
    setRefresh((value) => value + 1);
  }

  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 text-white">
      <div className="border-b border-white/10 p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">
              <SparkIcon className="size-4" />
              {text.phase}
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-[-0.02em]">{text.canvas}</h3>
            <p className="mt-2 text-xs leading-6 text-slate-300">{text.canvasHelp}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[440px]">
            <label className="text-xs font-semibold text-slate-300">
              <span className="mb-1.5 block">{text.page}</span>
              <select
                className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white"
                onChange={(event) => {
                  setLoadState('loading');
                  setFrameAvailable(false);
                  setPageSlug(event.target.value);
                }}
                value={pageSlug}
              >
                {generation.spec.pages.map((page) => (
                  <option className="text-slate-950" key={page.slug} value={page.slug}>
                    {page.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-300">
              <span className="mb-1.5 flex items-center justify-between">
                <span>{text.scale}</span>
                <span>{zoom}%</span>
              </span>
              <input
                aria-label={text.scale}
                className="h-10 w-full accent-emerald-400"
                max="100"
                min="50"
                onChange={(event) => setZoom(Number(event.target.value))}
                step="25"
                type="range"
                value={zoom}
              />
            </label>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {(Object.keys(WEBSITE_PREVIEW_VIEWPORTS) as WebsitePreviewViewport[]).map((option) => {
            const definition = WEBSITE_PREVIEW_VIEWPORTS[option];
            const active = option === viewport;
            return (
              <button
                aria-pressed={active}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                  active
                    ? 'border-white bg-white text-slate-950'
                    : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
                }`}
                key={option}
                onClick={() => setViewport(option)}
                type="button"
              >
                <DeviceIcon className="size-4" />
                {locale === 'en' ? definition.label.en : definition.label.zhHant}
                <span className={active ? 'text-slate-500' : 'text-slate-400'}>
                  {definition.width} × {definition.height}
                </span>
              </button>
            );
          })}
          <button
            className="ml-auto rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
            onClick={reload}
            type="button"
          >
            {text.refresh}
          </button>
        </div>
      </div>

      <div
        className="relative min-h-[640px] overflow-auto bg-[radial-gradient(circle_at_top,#263348_0,#111827_40%,#020617_100%)] p-5 sm:p-8"
        data-testid="website-preview-stage"
      >
        <div
          className="relative mx-auto overflow-hidden rounded-[22px] bg-white shadow-2xl ring-1 ring-white/15"
          style={{ height: dimensions.height * scale, width: dimensions.width * scale }}
        >
          {loadState !== 'ready' ? (
            <div
              aria-live="polite"
              className={`absolute inset-0 z-10 grid place-items-center text-sm font-semibold ${
                loadState === 'failed' ? 'bg-rose-50 text-rose-800' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {loadState === 'failed' ? text.failed : text.loading}
            </div>
          ) : null}
          {frameAvailable ? (
            <iframe
              data-testid="website-preview-frame"
              onError={() => setLoadState('failed')}
              onLoad={() => setLoadState('ready')}
              referrerPolicy="no-referrer"
              sandbox=""
              src={source}
              style={{
                border: 0,
                height: dimensions.height,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                width: dimensions.width,
              }}
              title={text.canvas}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
