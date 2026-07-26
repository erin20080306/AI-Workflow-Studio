'use client';

import { PRODUCT } from '@ai-workflow-studio/shared/product';
import Link from 'next/link';

import { Brand } from '@/components/brand';
import { ArrowRightIcon, CheckIcon, SparkIcon } from '@/components/icons';
import { LanguageSwitcher, useLanguage } from '@/components/language-provider';

const copy = {
  'zh-Hant': {
    nav: {
      login: '登入',
      mock: 'Mock 模式',
      pricing: '方案費率',
      start: '開始使用',
    },
    hero: {
      eyebrow: 'AI 負責規劃，確定性工具安全執行',
      title: '用一句話，讓工作流理解你的需求。',
      description: `${PRODUCT.displayName} 將自然語言需求轉換為可檢視、可核准的自動化流程，安全處理 Excel、Google Sheets 與團隊日常工具。`,
      dashboard: '開啟工作台',
      learnMore: '看看如何運作',
      capabilities: [
        '讀取並整合本機 Excel 檔案',
        '清理、對應與驗證欄位',
        '核准後同步至 Google Sheets',
      ],
    },
    preview: {
      label: '工作流預覽',
      name: '每日訂單整合',
      status: '草稿',
      nodes: [
        ['01', '監看資料夾', '新增 .xlsx 檔案'],
        ['02', '讀取並去除重複', '依訂單編號'],
        ['03', '建立報表', '產生新的輸出檔案'],
      ],
      validated: '3 個步驟驗證完成',
      review: '檢視權限 →',
    },
    process: {
      eyebrow: '安全透明的設計',
      title: '自動化，不再是黑箱。',
      description:
        '每個工作流都有明確結構、資料驗證與權限範圍；碰觸檔案之前，你永遠看得到完整計畫。',
      steps: [
        {
          index: '01',
          title: '描述想要的結果',
          body: '說明要完成什麼、何時執行，以及結果應該儲存在哪裡。',
        },
        {
          index: '02',
          title: '檢視安全計畫',
          body: '啟用前確認每個來源、權限、寫入動作、外部傳輸與核准點。',
        },
        {
          index: '03',
          title: '交給 Agent 執行',
          body: '已配對的桌面 Agent 只處理你核准的資料夾，並回報已遮蔽敏感資訊的進度。',
        },
      ],
    },
    footer: '本機檔案預設留在你已核准的裝置中。',
  },
  en: {
    nav: {
      login: 'Sign in',
      mock: 'Mock mode',
      pricing: 'Pricing',
      start: 'Get started',
    },
    hero: {
      eyebrow: 'AI plans. Deterministic tools execute.',
      title: 'Workflows that understand your words.',
      description: `${PRODUCT.displayName} turns plain-language requests into reviewable automations for Excel, Google Sheets, and the services your team already uses.`,
      dashboard: 'Open workspace',
      learnMore: 'See how it works',
      capabilities: [
        'Read and combine local Excel files',
        'Clean, map, and validate columns',
        'Sync approved data to Google Sheets',
      ],
    },
    preview: {
      label: 'Workflow preview',
      name: 'Daily order consolidation',
      status: 'Draft',
      nodes: [
        ['01', 'Folder watch', 'New .xlsx file'],
        ['02', 'Read & deduplicate', 'Order number'],
        ['03', 'Create report', 'New output file'],
      ],
      validated: '3 steps validated',
      review: 'Review permissions →',
    },
    process: {
      eyebrow: 'Clear by design',
      title: 'Automation without the black box.',
      description:
        'Every workflow is structured, validated, permission-aware, and visible before it touches a file.',
      steps: [
        {
          index: '01',
          title: 'Describe the outcome',
          body: 'Write what should happen, when it should run, and where the result belongs.',
        },
        {
          index: '02',
          title: 'Review the safe plan',
          body: 'See every source, permission, write, external transfer, and approval before activation.',
        },
        {
          index: '03',
          title: 'Let the agent run',
          body: 'Your paired desktop agent processes approved folders and reports redacted progress.',
        },
      ],
    },
    footer: 'Local files stay on your approved device by default.',
  },
} as const;

export default function HomePage() {
  const { locale } = useLanguage();
  const text = copy[locale];
  const mockMode = process.env.NEXT_PUBLIC_MOCK_MODE !== 'false';

  return (
    <main className="min-h-screen overflow-hidden">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <Brand />
        <div className="flex items-center gap-3">
          {mockMode && (
            <span className="hidden items-center gap-1.5 rounded-full border border-amber-300/70 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800 md:inline-flex">
              <span className="size-1.5 rounded-full bg-amber-500" />
              {text.nav.mock}
            </span>
          )}
          <LanguageSwitcher />
          <Link
            className="hidden rounded-full px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-white/70 lg:inline-flex"
            href="/pricing"
          >
            {text.nav.pricing}
          </Link>
          <Link
            className="hidden rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white/70 sm:inline-flex"
            href="/login"
          >
            {text.nav.login}
          </Link>
          <Link
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800"
            href="/register"
          >
            {text.nav.start}
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:pb-28 lg:pt-28">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur">
            <SparkIcon className="size-4 text-indigo-600" />
            {text.hero.eyebrow}
          </div>
          <h1 className="text-balance max-w-3xl text-[clamp(3.2rem,7.5vw,6.6rem)] font-semibold leading-[0.91] tracking-[-0.065em] text-slate-950">
            {text.hero.title}
          </h1>
          <p className="mt-7 max-w-xl text-balance text-lg leading-8 text-slate-600 sm:text-xl">
            {text.hero.description}
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_12px_35px_rgba(91,85,230,0.28)] transition hover:-translate-y-0.5 hover:bg-indigo-700"
              href="/dashboard"
            >
              {text.hero.dashboard}
              <ArrowRightIcon className="size-4" />
            </Link>
            <a
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white/60 px-6 py-3.5 text-sm font-semibold text-slate-800 transition hover:bg-white"
              href="#how-it-works"
            >
              {text.hero.learnMore}
            </a>
          </div>
          <ul className="mt-9 space-y-3 text-sm text-slate-600">
            {text.hero.capabilities.map((capability) => (
              <li className="flex items-center gap-2.5" key={capability}>
                <span className="grid size-5 place-items-center rounded-full bg-emerald-100 text-emerald-800">
                  <CheckIcon className="size-3.5" />
                </span>
                {capability}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-gradient-to-br from-emerald-200/60 via-white/30 to-indigo-200/70 blur-2xl" />
          <div className="overflow-hidden rounded-[2rem] border border-white/90 bg-slate-950 p-2 shadow-[0_30px_80px_rgba(23,33,27,0.24)]">
            <div className="rounded-[1.55rem] bg-[#f4f6f2] p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    {text.preview.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{text.preview.name}</p>
                </div>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                  {text.preview.status}
                </span>
              </div>

              <div className="workflow-grid relative mt-5 min-h-96 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
                <div className="absolute left-[47px] top-20 h-52 w-px bg-slate-300 sm:left-[55px]" />
                {text.preview.nodes.map(([number, title, detail], index) => (
                  <div
                    className={`relative flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm ${
                      index === 1
                        ? 'ml-5 border-indigo-200 ring-4 ring-indigo-50 sm:ml-8'
                        : 'mr-5 border-slate-200 sm:mr-8'
                    } ${index > 0 ? 'mt-7' : ''}`}
                    key={number}
                  >
                    <span
                      className={`relative z-10 grid size-10 shrink-0 place-items-center rounded-xl text-xs font-bold ${
                        index === 1 ? 'bg-indigo-600 text-white' : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {number}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{detail}</p>
                    </div>
                    <span className="ml-auto size-2 rounded-full bg-emerald-500" />
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  {text.preview.validated}
                </div>
                <span className="text-xs font-semibold text-indigo-700">{text.preview.review}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className="border-y border-slate-200/80 bg-white/65 py-20 backdrop-blur-sm"
        id="how-it-works"
      >
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">
              {text.process.eyebrow}
            </p>
            <h2 className="text-balance mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
              {text.process.title}
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">{text.process.description}</p>
          </div>

          <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-slate-200 bg-slate-200 md:grid-cols-3">
            {text.process.steps.map((step) => (
              <article className="bg-[#fbfcfa] p-7 sm:p-9" key={step.index}>
                <span className="text-xs font-bold tracking-[0.18em] text-indigo-600">
                  {step.index}
                </span>
                <h3 className="mt-12 text-xl font-semibold tracking-tight text-slate-950">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-10 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <Brand />
        <p>{text.footer}</p>
      </footer>
    </main>
  );
}
