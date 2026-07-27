'use client';

import {
  WEBSITE_BRIEF_STEPS,
  WebsiteProjectSchema,
  websiteBriefProgress,
  type WebsiteBriefDraft,
  type WebsiteBriefPatch,
  type WebsiteBriefStep,
  type WebsitePage,
  type WebsiteProject,
  type WebsiteSpecClientGeneration,
} from '@ai-workflow-studio/website-schema';
import Link from 'next/link';
import { useState } from 'react';
import { z } from 'zod';

import {
  ArrowRightIcon,
  CheckIcon,
  ChevronRightIcon,
  PlusIcon,
  ShieldIcon,
  SiteIcon,
  SparkIcon,
} from '@/components/icons';
import { useLanguage } from '@/components/language-provider';
import { WebsiteSpecGenerator } from '@/components/sites/website-spec-generator';
import type { AiTierOption } from '@/lib/ai-model-selection';
import type { WebsiteGenerationModelOption } from '@/lib/website-generation-models';

const ProjectResponseSchema = z.object({ project: WebsiteProjectSchema });

const copy = {
  en: {
    addPage: 'Add page',
    assistant: 'Guided website brief',
    back: 'All website projects',
    briefing: 'Briefing',
    callsHint: 'One call to action per line, up to 8.',
    complete: 'All required decisions are complete.',
    createDraft: 'Create validated site draft',
    createFailed: 'The validated draft could not be created.',
    created: 'Validated website draft created. Publishing remains locked.',
    draft: 'Draft locked',
    draftHelp:
      'This phase creates a structured project draft only. It cannot publish, run code, or access credentials.',
    goal: 'Page goal',
    locked: 'This draft is locked until versioned editing is introduced.',
    modelLater:
      'After the brief is locked, choose Auto, OpenAI, Claude, or Gemini to generate a validated component specification.',
    next: 'Save and continue',
    pageSlug: 'URL slug',
    pageTitle: 'Page title',
    phase: 'Website Studio · Phase 24',
    progress: 'Brief progress',
    publish: 'Publishing unavailable until Phase 27',
    remove: 'Remove',
    save: 'Save step',
    saveFailed: 'This step is incomplete or could not be saved.',
    saved: 'Step saved safely.',
    steps: {
      audience: {
        help: 'Describe the people, roles, situations, and main problems this website serves.',
        label: 'Who should this website help?',
        title: 'Audience',
      },
      brandDirection: {
        help: 'Describe voice, personality, color direction, references, and what to avoid.',
        label: 'What should the brand feel like?',
        title: 'Brand direction',
      },
      callsToAction: {
        help: 'List the exact actions a visitor should take, in priority order.',
        label: 'Which calls to action matter?',
        title: 'Calls to action',
      },
      content: {
        help: 'List available copy, proof points, pricing, FAQs, media, and missing content.',
        label: 'What content do you have or need?',
        title: 'Content',
      },
      pages: {
        help: 'Add up to 12 pages. Each needs a stable URL slug and a clear job.',
        label: 'Which pages does the site need?',
        title: 'Pages',
      },
      purpose: {
        help: 'Explain the business outcome, the visitor problem, and what success looks like.',
        label: 'What is this website meant to achieve?',
        title: 'Purpose',
      },
    },
  },
  'zh-Hant': {
    addPage: '新增頁面',
    assistant: '網站需求引導',
    back: '返回網站專案',
    briefing: '需求整理中',
    callsHint: '每行輸入一個行動呼籲，最多 8 個。',
    complete: '六項必要決策已完整。',
    createDraft: '建立已驗證網站草稿',
    createFailed: '無法建立網站草稿，請確認所有需求皆已完成。',
    created: '已建立通過驗證的網站草稿；發布功能仍維持鎖定。',
    draft: '草稿已鎖定',
    draftHelp: '本階段只建立結構化專案草稿，不會發布網站、執行程式碼或讀取憑證。',
    goal: '頁面任務',
    locked: '此草稿會保持鎖定，直到版本化編輯階段開放。',
    modelLater: '需求鎖定後，可選擇 Auto、OpenAI、Claude 或 Gemini 產生已驗證元件規格。',
    next: '儲存並繼續',
    pageSlug: '網址代稱',
    pageTitle: '頁面名稱',
    phase: '網站工作室 · Phase 24',
    progress: '需求完成度',
    publish: '發布功能將於 Phase 27 開放',
    remove: '移除',
    save: '儲存此步驟',
    saveFailed: '這個步驟尚未完整，或目前無法儲存。',
    saved: '步驟已安全儲存。',
    steps: {
      audience: {
        help: '描述這個網站服務的人、角色、使用情境與主要問題。',
        label: '這個網站最需要幫助誰？',
        title: '目標受眾',
      },
      brandDirection: {
        help: '描述語氣、個性、顏色方向、參考風格，以及不希望出現的設計。',
        label: '品牌應該讓人感覺如何？',
        title: '品牌方向',
      },
      callsToAction: {
        help: '依優先順序列出希望訪客採取的具體行動。',
        label: '最重要的行動呼籲是什麼？',
        title: '行動呼籲',
      },
      content: {
        help: '列出已有的文案、證明、方案價格、常見問題、圖片，以及還缺少的內容。',
        label: '目前有哪些內容、還需要哪些內容？',
        title: '內容素材',
      },
      pages: {
        help: '最多 12 頁；每一頁都需要穩定網址代稱與清楚任務。',
        label: '網站需要哪些頁面？',
        title: '網站頁面',
      },
      purpose: {
        help: '說明商業成果、訪客問題，以及怎樣才算網站成功。',
        label: '這個網站最重要的目的為何？',
        title: '網站目的',
      },
    },
  },
} as const;

function updatePageField(
  pages: readonly WebsitePage[],
  index: number,
  field: keyof WebsitePage,
  value: string,
): WebsitePage[] {
  return pages.map((page, pageIndex) => (pageIndex === index ? { ...page, [field]: value } : page));
}

export function WebsiteBriefWorkspace({
  initialGeneration,
  initialProject,
  modelOptions,
  tierOptions,
}: Readonly<{
  initialGeneration: WebsiteSpecClientGeneration | undefined;
  initialProject: WebsiteProject;
  modelOptions: readonly WebsiteGenerationModelOption[];
  tierOptions: readonly AiTierOption[];
}>) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const initialMissing = websiteBriefProgress(initialProject.brief).missingSteps[0];
  const [project, setProject] = useState(initialProject);
  const [brief, setBrief] = useState<WebsiteBriefDraft>(initialProject.brief);
  const [callsText, setCallsText] = useState(initialProject.brief.callsToAction.join('\n'));
  const [activeStep, setActiveStep] = useState<WebsiteBriefStep>(initialMissing ?? 'purpose');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const progress = websiteBriefProgress(project.brief);
  const stepIndex = WEBSITE_BRIEF_STEPS.indexOf(activeStep);
  const step = text.steps[activeStep];
  const locked = project.status === 'draft';

  function patchForStep(): WebsiteBriefPatch {
    switch (activeStep) {
      case 'audience':
        return { audience: brief.audience };
      case 'brandDirection':
        return { brandDirection: brief.brandDirection };
      case 'callsToAction':
        return {
          callsToAction: callsText
            .split('\n')
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
        };
      case 'content':
        return { content: brief.content };
      case 'pages':
        return { pages: brief.pages };
      case 'purpose':
        return { purpose: brief.purpose };
    }
  }

  async function saveStep(): Promise<void> {
    if (locked) return;
    setSaving(true);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/websites/${project.id}`, {
        body: JSON.stringify(patchForStep()),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error('save failed');
      const saved = ProjectResponseSchema.parse(payload).project;
      setProject(saved);
      setBrief(saved.brief);
      setCallsText(saved.brief.callsToAction.join('\n'));
      setMessage(text.saved);
      const nextStep = WEBSITE_BRIEF_STEPS[stepIndex + 1];
      if (nextStep !== undefined) setActiveStep(nextStep);
    } catch {
      setMessage(text.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function createDraft(): Promise<void> {
    if (!progress.complete || locked) return;
    setSaving(true);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/websites/${project.id}/draft`, {
        method: 'POST',
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error('draft failed');
      const saved = ProjectResponseSchema.parse(payload).project;
      setProject(saved);
      setMessage(text.created);
    } catch {
      setMessage(text.createFailed);
    } finally {
      setSaving(false);
    }
  }

  function stepEditor() {
    if (activeStep === 'pages') {
      return (
        <div className="space-y-3">
          {brief.pages.map((page, index) => (
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4" key={index}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="text-xs font-semibold text-slate-700">{text.pageTitle}</span>
                  <input
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                    disabled={locked}
                    maxLength={80}
                    onChange={(event) =>
                      setBrief((current) => ({
                        ...current,
                        pages: updatePageField(current.pages, index, 'title', event.target.value),
                      }))
                    }
                    value={page.title}
                  />
                </label>
                <label>
                  <span className="text-xs font-semibold text-slate-700">{text.pageSlug}</span>
                  <input
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-indigo-500"
                    disabled={locked}
                    maxLength={80}
                    onChange={(event) =>
                      setBrief((current) => ({
                        ...current,
                        pages: updatePageField(
                          current.pages,
                          index,
                          'slug',
                          event.target.value.toLowerCase().replaceAll(/[^a-z0-9-]/g, ''),
                        ),
                      }))
                    }
                    value={page.slug}
                  />
                </label>
              </div>
              <label className="mt-3 block">
                <span className="text-xs font-semibold text-slate-700">{text.goal}</span>
                <input
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  disabled={locked}
                  maxLength={500}
                  onChange={(event) =>
                    setBrief((current) => ({
                      ...current,
                      pages: updatePageField(current.pages, index, 'goal', event.target.value),
                    }))
                  }
                  value={page.goal}
                />
              </label>
              {!locked ? (
                <button
                  className="mt-3 text-xs font-semibold text-rose-700"
                  onClick={() =>
                    setBrief((current) => ({
                      ...current,
                      pages: current.pages.filter((_page, pageIndex) => pageIndex !== index),
                    }))
                  }
                  type="button"
                >
                  {text.remove}
                </button>
              ) : null}
            </article>
          ))}
          {!locked && brief.pages.length < 12 ? (
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-dashed border-indigo-300 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700"
              onClick={() =>
                setBrief((current) => {
                  const pageNumber = current.pages.length + 1;
                  return {
                    ...current,
                    pages: [
                      ...current.pages,
                      {
                        goal:
                          locale === 'en'
                            ? 'Explain the primary goal of this page.'
                            : '說明這個頁面的主要任務與訪客需要。',
                        slug: pageNumber === 1 ? 'home' : `page-${pageNumber}`,
                        title:
                          pageNumber === 1
                            ? locale === 'en'
                              ? 'Home'
                              : '首頁'
                            : locale === 'en'
                              ? `Page ${pageNumber}`
                              : `頁面 ${pageNumber}`,
                      },
                    ],
                  };
                })
              }
              type="button"
            >
              <PlusIcon className="size-4" />
              {text.addPage}
            </button>
          ) : null}
        </div>
      );
    }

    if (activeStep === 'callsToAction') {
      return (
        <label className="block">
          <span className="sr-only">{step.label}</span>
          <textarea
            className="min-h-56 w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-4 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500"
            disabled={locked}
            onChange={(event) => setCallsText(event.target.value)}
            placeholder={locale === 'en' ? 'Start free\nBook a demo' : '免費開始\n預約產品導覽'}
            value={callsText}
          />
          <span className="mt-2 block text-xs text-slate-500">{text.callsHint}</span>
        </label>
      );
    }

    const value = brief[activeStep];
    return (
      <label className="block">
        <span className="sr-only">{step.label}</span>
        <textarea
          className="min-h-64 w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-4 text-sm leading-7 text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500"
          disabled={locked}
          maxLength={activeStep === 'content' ? 6_000 : 1_000}
          onChange={(event) =>
            setBrief((current) => ({ ...current, [activeStep]: event.target.value }))
          }
          placeholder={step.help}
          value={typeof value === 'string' ? value : ''}
        />
      </label>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px]">
      <Link
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-indigo-700"
        href="/dashboard/sites"
      >
        <span aria-hidden="true">←</span>
        {text.back}
      </Link>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
            {text.phase}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
            {project.name}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {locked ? text.draft : text.briefing} · {project.completedSteps} / 6
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-xs font-semibold sm:self-auto ${
            locked ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'
          }`}
        >
          {locked ? <CheckIcon className="size-4" /> : <SparkIcon className="size-4" />}
          {locked ? text.draft : text.assistant}
        </span>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[230px_minmax(0,1fr)_340px]">
        <nav
          aria-label={text.progress}
          className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          {WEBSITE_BRIEF_STEPS.map((stepName, index) => {
            const done = !progress.missingSteps.includes(stepName);
            const active = stepName === activeStep;
            return (
              <button
                aria-current={active ? 'step' : undefined}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                  active ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
                key={stepName}
                onClick={() => setActiveStep(stepName)}
                type="button"
              >
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                    done
                      ? 'bg-emerald-100 text-emerald-800'
                      : active
                        ? 'bg-white/15 text-white'
                        : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {done ? '✓' : index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                  {text.steps[stepName].title}
                </span>
                <ChevronRightIcon className="size-3.5 opacity-50" />
              </button>
            );
          })}
        </nav>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
              <SiteIcon className="size-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">
                0{stepIndex + 1} · {step.title}
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-slate-950">
                {step.label}
              </h2>
              <p className="mt-2 text-xs leading-6 text-slate-500">{step.help}</p>
            </div>
          </div>

          <div className="mt-6">{stepEditor()}</div>

          {!locked ? (
            <button
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={saving}
              onClick={() => void saveStep()}
              type="button"
            >
              {stepIndex === WEBSITE_BRIEF_STEPS.length - 1 ? text.save : text.next}
              <ArrowRightIcon className="size-4" />
            </button>
          ) : (
            <p className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm font-medium text-emerald-900">
              {text.locked}
            </p>
          )}

          {message !== undefined ? (
            <p
              aria-live="polite"
              className="mt-4 rounded-xl bg-indigo-50 px-3 py-2.5 text-xs font-semibold text-indigo-800"
            >
              {message}
            </p>
          ) : null}
        </section>

        <aside className="space-y-4">
          <section className="rounded-3xl bg-slate-950 p-5 text-white shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-300">
                {text.progress}
              </p>
              <span className="text-sm font-semibold">{project.completedSteps} / 6</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all"
                style={{ width: `${(project.completedSteps / 6) * 100}%` }}
              />
            </div>
            <p className="mt-4 text-xs leading-6 text-slate-300">
              {progress.complete ? text.complete : text.draftHelp}
            </p>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs leading-5 text-slate-300">
              <ShieldIcon className="mb-2 size-5 text-emerald-300" />
              {text.modelLater}
            </div>
            {!locked ? (
              <button
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!progress.complete || saving}
                onClick={() => void createDraft()}
                type="button"
              >
                <CheckIcon className="size-4" />
                {text.createDraft}
              </button>
            ) : null}
          </section>

          <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Publish</p>
            <button
              className="mt-3 w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-400"
              disabled
              type="button"
            >
              {text.publish}
            </button>
          </section>
        </aside>
      </div>

      {locked ? (
        <div className="mt-5">
          <WebsiteSpecGenerator
            initialGeneration={initialGeneration}
            modelOptions={modelOptions}
            projectId={project.id}
            tierOptions={tierOptions}
          />
        </div>
      ) : null}
    </div>
  );
}
