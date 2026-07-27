'use client';

import { WebsiteProjectSchema, type WebsiteProject } from '@ai-workflow-studio/website-schema';
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

const ProjectResponseSchema = z.object({ project: WebsiteProjectSchema });

const copy = {
  en: {
    briefing: 'Brief in progress',
    create: 'Create project',
    createFailed: 'The website project could not be created.',
    creating: 'Creating…',
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
    locked: 'Publishing unavailable',
    name: 'Project name',
    namePlaceholder: 'For example: AI Workflow Studio product site',
    open: 'Continue brief',
    safety: 'Guided, tenant-isolated, draft-only',
    subtitle:
      'Turn a clear product brief into a validated website project. AI generation and preview are introduced in the next gated phases.',
    title: 'Plan a website before generating it.',
  },
  'zh-Hant': {
    briefing: '需求整理中',
    create: '建立專案',
    createFailed: '網站專案建立失敗，請稍後再試。',
    creating: '建立中…',
    draft: '已驗證草稿',
    empty: '尚未建立網站專案',
    emptyBody: '建立專案後，引導流程會先收集所有必要決策，資料完整前不會允許建立草稿。',
    features: [
      ['目的與受眾', '先說清楚網站為何存在、要服務哪些人。'],
      ['頁面與內容', '在產生任何版面前，先定義每個頁面的任務。'],
      ['品牌與行動', '記錄品牌語氣、視覺方向與希望訪客採取的行動。'],
    ],
    heading: '網站工作室',
    locked: '尚未開放發布',
    name: '專案名稱',
    namePlaceholder: '例如：AI Workflow Studio 產品官網',
    open: '繼續整理',
    safety: '步驟引導、租戶隔離、僅限草稿',
    subtitle: '先把產品需求整理成經驗證的網站專案；AI 產生與預覽會在後續安全階段加入。',
    title: '先把網站想清楚，再開始生成。',
  },
} as const;

export function WebsiteStudioHome({
  initialProjects,
}: Readonly<{
  initialProjects: readonly WebsiteProject[];
}>) {
  const router = useRouter();
  const { locale } = useLanguage();
  const text = copy[locale];
  const [name, setName] = useState('');
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
      if (!response.ok) throw new Error('create failed');
      const project = ProjectResponseSchema.parse(payload).project;
      router.push(`/dashboard/sites/${project.id}`);
    } catch {
      setMessage(text.createFailed);
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
          <div className="rounded-3xl border border-white/10 bg-white/7 p-5 backdrop-blur">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-indigo-400/15 text-indigo-200">
                <PlusIcon className="size-5" />
              </span>
              <div>
                <p className="font-semibold">{text.create}</p>
                <p className="mt-0.5 text-xs text-slate-400">Website Project · Draft only</p>
              </div>
            </div>
            <label className="mt-5 block">
              <span className="text-xs font-semibold text-slate-300">{text.name}</span>
              <input
                className="mt-2 w-full rounded-2xl border border-white/15 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-400"
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
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={creating || name.trim().length < 2}
              onClick={() => void createProject()}
              type="button"
            >
              {creating ? text.creating : text.create}
              <ArrowRightIcon className="size-4" />
            </button>
            {message !== undefined ? (
              <p aria-live="polite" className="mt-3 text-xs text-rose-200">
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
