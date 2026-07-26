import { PRODUCT } from '@ai-workflow-studio/shared/product';
import Link from 'next/link';

import { Brand } from '@/components/brand';
import { ArrowRightIcon, CheckIcon, SparkIcon } from '@/components/icons';
import { MockModeBadge } from '@/components/mock-mode-badge';

const capabilities = [
  'Read and combine local Excel files',
  'Clean, map, and validate columns',
  'Sync approved data to Google Sheets',
];

const steps = [
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
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <Brand />
        <div className="flex items-center gap-3">
          <MockModeBadge />
          <Link
            className="hidden rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white/70 sm:inline-flex"
            href="/login"
          >
            登入
          </Link>
          <Link
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800"
            href="/register"
          >
            開始使用
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:pb-28 lg:pt-28">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur">
            <SparkIcon className="size-4 text-indigo-600" />
            AI plans. Deterministic tools execute.
          </div>
          <h1 className="text-balance max-w-3xl text-[clamp(3.2rem,7.5vw,6.6rem)] font-semibold leading-[0.91] tracking-[-0.065em] text-slate-950">
            Workflows that understand your words.
          </h1>
          <p className="mt-7 max-w-xl text-balance text-lg leading-8 text-slate-600 sm:text-xl">
            {PRODUCT.displayName} turns plain-language requests into reviewable automations for
            Excel, Google Sheets, and the services your team already uses.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_12px_35px_rgba(91,85,230,0.28)] transition hover:-translate-y-0.5 hover:bg-indigo-700"
              href="/dashboard"
            >
              開啟 Mock 控制台
              <ArrowRightIcon className="size-4" />
            </Link>
            <a
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white/60 px-6 py-3.5 text-sm font-semibold text-slate-800 transition hover:bg-white"
              href="#how-it-works"
            >
              看看如何運作
            </a>
          </div>
          <ul className="mt-9 space-y-3 text-sm text-slate-600">
            {capabilities.map((capability) => (
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
                    Workflow preview
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">每日訂單整合</p>
                </div>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                  Draft
                </span>
              </div>

              <div className="workflow-grid relative mt-5 min-h-96 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
                <div className="absolute left-[47px] top-20 h-52 w-px bg-slate-300 sm:left-[55px]" />
                {[
                  ['01', 'Folder watch', 'New .xlsx file'],
                  ['02', 'Read & deduplicate', 'Order number'],
                  ['03', 'Create report', 'New output file'],
                ].map(([number, title, detail], index) => (
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
                  <span className="size-2 rounded-full bg-emerald-500" />3 steps validated
                </div>
                <span className="text-xs font-semibold text-indigo-700">Review permissions →</span>
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
              Clear by design
            </p>
            <h2 className="text-balance mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
              Automation without the black box.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Every workflow is structured, validated, permission-aware, and visible before it
              touches a file.
            </p>
          </div>

          <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-slate-200 bg-slate-200 md:grid-cols-3">
            {steps.map((step) => (
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
        <p>Local files stay on your approved device by default.</p>
      </footer>
    </main>
  );
}
