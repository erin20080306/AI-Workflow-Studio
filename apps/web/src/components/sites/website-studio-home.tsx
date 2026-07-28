'use client';

import {
  WebsiteProjectSchema,
  type WebsiteGenerationSelection,
  type WebsiteProject,
} from '@ai-workflow-studio/website-schema';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';

import {
  ArrowRightIcon,
  CheckIcon,
  PlusIcon,
  ShieldIcon,
  SiteIcon,
  SparkIcon,
} from '@/components/icons';
import { useLanguage } from '@/components/language-provider';
import { WebsiteModelDropdowns } from '@/components/sites/website-model-dropdowns';
import type { AiModelTierSelection, AiTierOption } from '@/lib/ai-model-selection';
import type { WebsiteGenerationModelOption } from '@/lib/website-generation-models';

const ProjectResponseSchema = z.object({ project: WebsiteProjectSchema });
const ErrorResponseSchema = z.object({
  error: z.object({ message: z.string().min(1).max(500) }),
});

const copy = {
  en: {
    advanced: 'Advanced manual setup',
    briefing: 'Brief in progress',
    create: 'Create project',
    createFailed: 'The website project could not be created.',
    creating: 'Creating…',
    description: 'Describe the website in a few sentences',
    descriptionPlaceholder:
      'Create a polished bilingual website for a workflow automation product. It should explain the value, pricing, security, and guide small teams to start a free trial.',
    draft: 'Validated draft',
    empty: 'No website projects yet',
    emptyBody:
      'Create a project and the guided brief will collect every required decision before a draft is allowed.',
    features: [
      ['Purpose and audience', 'Clarify why the site exists and who it serves.'],
      ['Pages and content', 'Define each page before any layout is generated.'],
      ['Brand and actions', 'Record the desired voice, visual direction, and conversion goals.'],
    ],
    heading: 'Website Studio',
    locked: 'Explicit approval before publishing',
    name: 'Project name',
    namePlaceholder: 'For example: AI Workflow Studio product site',
    open: 'Continue brief',
    quickCreate: 'Let AI ask the next question',
    quickCreating: 'Reading your request safely…',
    safety: 'Prompt → questions → Canvas → publish approval',
    subtitle:
      'Start with one request. AI extracts a safe brief, asks only what is missing, then creates a reviewable Canvas before anything can be published.',
    title: 'Describe the website. Build it through conversation.',
  },
  'zh-Hant': {
    advanced: '進階手動建立',
    briefing: '需求整理中',
    create: '建立專案',
    createFailed: '網站專案建立失敗，請稍後再試。',
    creating: '建立中…',
    description: '用幾句話描述想建立的網站',
    descriptionPlaceholder:
      '幫我建立一個時尚、專業的中英文 AI 自動化平台網站，說明功能、方案、安全性，主要服務中小企業，並引導訪客免費體驗。',
    draft: '已驗證草稿',
    empty: '尚未建立網站專案',
    emptyBody: '建立專案後，引導流程會先收集所有必要決策，資料完整前不會允許建立草稿。',
    features: [
      ['目的與受眾', '先說清楚網站為何存在、要服務哪些人。'],
      ['頁面與內容', '在產生任何版面前，先定義每個頁面的任務。'],
      ['品牌與行動', '記錄品牌語氣、視覺方向與希望訪客採取的行動。'],
    ],
    heading: '網站工作室',
    locked: '發布前必須明確確認',
    name: '專案名稱',
    namePlaceholder: '例如：AI Workflow Studio 產品官網',
    open: '繼續整理',
    quickCreate: '讓 AI 開始追問',
    quickCreating: '正在安全理解需求…',
    safety: '一句話 → AI 追問 → Canvas → 確認發布',
    subtitle:
      '先說明想做什麼；AI 會整理安全需求，只追問缺少的資訊，並在任何發布前建立可檢查、可對話修改的 Canvas。',
    title: '說出你的網站，透過對話完成它。',
  },
} as const;

export function WebsiteStudioHome({
  initialProjects,
  modelOptions,
  tierOptions,
}: Readonly<{
  initialProjects: readonly WebsiteProject[];
  modelOptions: readonly WebsiteGenerationModelOption[];
  tierOptions: readonly AiTierOption[];
}>) {
  const router = useRouter();
  const { locale } = useLanguage();
  const text = copy[locale];
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [selectedModel, setSelectedModel] = useState<WebsiteGenerationSelection>(
    modelOptions[0]?.id ?? 'auto',
  );
  const [selectedTier, setSelectedTier] = useState<AiModelTierSelection>('auto');
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string>();

  async function createProject(): Promise<void> {
    if (name.trim().length < 2) return;
    setCreating(true);
    setMessage(undefined);
    try {
      const response = await fetch('/api/websites', {
        body: JSON.stringify({ name }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const failure = ErrorResponseSchema.safeParse(payload);
        throw new Error(failure.success ? failure.data.error.message : text.createFailed);
      }
      const project = ProjectResponseSchema.parse(payload).project;
      router.push(`/dashboard/sites/${project.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.createFailed);
      setCreating(false);
    }
  }

  async function quickStart(): Promise<void> {
    if (description.trim().length < 10 || modelOptions.length === 0) return;
    setCreating(true);
    setMessage(undefined);
    try {
      const response = await fetch('/api/websites/quick-start', {
        body: JSON.stringify({
          description,
          locale,
          model: selectedModel,
          tier: selectedTier,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const failure = ErrorResponseSchema.safeParse(payload);
        throw new Error(failure.success ? failure.data.error.message : text.createFailed);
      }
      const project = ProjectResponseSchema.parse(payload).project;
      router.push(`/dashboard/sites/${project.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.createFailed);
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1360px]">
      <section className="overflow-hidden rounded-[32px] bg-slate-950 text-white shadow-sm">
        <div className="grid gap-8 px-6 py-8 sm:px-9 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)] lg:px-12 lg:py-12">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
              <SparkIcon className="size-4" />
              {text.safety}
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
              {text.title}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">{text.subtitle}</p>
          </div>
          <div className="rounded-3xl bg-white p-5 text-slate-950 shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
                <SparkIcon className="size-5" />
              </span>
              <div>
                <p className="font-semibold">{text.quickCreate}</p>
                <p className="mt-0.5 text-xs text-slate-500">Website Copilot · Phase 37</p>
              </div>
            </div>
            <label className="mt-5 block">
              <span className="text-xs font-semibold text-slate-600">{text.description}</span>
              <textarea
                className="mt-2 min-h-32 w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm leading-6 text-slate-950 outline-none placeholder:text-slate-400 focus:border-indigo-500"
                maxLength={6_000}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={text.descriptionPlaceholder}
                value={description}
              />
            </label>
            <div className="mt-3">
              <WebsiteModelDropdowns
                disabled={creating}
                locale={locale}
                modelOptions={modelOptions}
                onModelChange={setSelectedModel}
                onTierChange={setSelectedTier}
                selectedModel={selectedModel}
                selectedTier={selectedTier}
                tierOptions={tierOptions}
              />
            </div>
            <button
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={creating || description.trim().length < 10 || modelOptions.length === 0}
              onClick={() => void quickStart()}
              type="button"
            >
              {creating ? text.quickCreating : text.quickCreate}
              <ArrowRightIcon className="size-4" />
            </button>
            <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                {text.advanced}
              </summary>
              <label className="mt-3 block">
                <span className="text-xs font-semibold text-slate-600">{text.name}</span>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void createProject();
                  }}
                  placeholder={text.namePlaceholder}
                  value={name}
                />
              </label>
              <button
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 disabled:opacity-40"
                disabled={creating || name.trim().length < 2}
                onClick={() => void createProject()}
                type="button"
              >
                <PlusIcon className="size-4" />
                {creating ? text.creating : text.create}
              </button>
            </details>
            {message !== undefined ? (
              <p aria-live="polite" className="mt-3 text-xs font-semibold text-rose-700">
                {message}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-7">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
              Website projects
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
              {text.heading}
            </h2>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500">
            <ShieldIcon className="size-4 text-emerald-600" />
            {text.locked}
          </span>
        </div>

        {initialProjects.length === 0 ? (
          <div className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-white p-7 sm:p-9">
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
                <SiteIcon className="size-6" />
              </span>
              <div>
                <h3 className="font-semibold text-slate-950">{text.empty}</h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{text.emptyBody}</p>
              </div>
            </div>
            <div className="mt-7 grid gap-3 md:grid-cols-3">
              {text.features.map(([title, body], index) => (
                <article className="rounded-2xl bg-slate-50 p-4" key={title}>
                  <span className="text-xs font-bold text-indigo-600">0{index + 1}</span>
                  <h4 className="mt-2 text-sm font-semibold text-slate-900">{title}</h4>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{body}</p>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {initialProjects.map((project) => (
              <Link
                className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
                href={`/dashboard/sites/${project.id}`}
                key={project.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-11 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
                    <SiteIcon className="size-5" />
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      project.status === 'draft'
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-amber-50 text-amber-900'
                    }`}
                  >
                    {project.status === 'draft' ? text.draft : text.briefing}
                  </span>
                </div>
                <h3 className="mt-5 font-semibold text-slate-950">{project.name}</h3>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{ width: `${(project.completedSteps / 6) * 100}%` }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <CheckIcon className="size-3.5 text-emerald-600" />
                    {project.completedSteps} / 6
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-indigo-700">
                    {text.open}
                    <ArrowRightIcon className="size-3.5 transition group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
