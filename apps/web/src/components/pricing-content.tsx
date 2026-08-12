'use client';

import { PRODUCT_PLANS } from '@ai-workflow-studio/shared/plans';
import Link from 'next/link';

import { Brand } from '@/components/brand';
import { ArrowRightIcon, CheckIcon } from '@/components/icons';
import { LanguageSwitcher, useLanguage } from '@/components/language-provider';

const copy = {
  'zh-Hant': {
    annual: '年繳',
    back: '返回首頁',
    create: '建立帳戶',
    eyebrow: '簡單透明的方案費率',
    features: {
      audit: (value: string) => `${value} 天稽核紀錄`,
      devices: (value: number) => `${value} 台裝置`,
      members: (value: number) => `${value} 位成員`,
      runs: (value: string) => `每月 ${value} 次執行`,
      workflows: (value: string) => `${value} 個工作流`,
    },
    footnote:
      '上述為建議定價與平台額度。正式付費前會顯示付款週期、稅額與取消條款；目前尚未連接付款服務，不會自動扣款。',
    freeStart: '免費開始',
    perMonth: '/月',
    recommended: '推薦方案',
    subtitle: '所有方案都包含工作流驗證、Dry Run、核准流程與本機資料夾權限控制。',
    title: '從安全的小型自動化開始',
  },
  en: {
    annual: 'Billed annually',
    back: 'Back home',
    create: 'Create account',
    eyebrow: 'Simple, transparent pricing',
    features: {
      audit: (value: string) => `${value}-day audit history`,
      devices: (value: number) => `${value} devices`,
      members: (value: number) => `${value} members`,
      runs: (value: string) => `${value} runs per month`,
      workflows: (value: string) => `${value} workflows`,
    },
    footnote:
      'These are suggested prices and platform limits. Billing cycle, taxes, and cancellation terms will be shown before payment. Billing is not connected yet, so no charges can occur.',
    freeStart: 'Start free',
    perMonth: '/month',
    recommended: 'Recommended',
    subtitle:
      'Every plan includes workflow validation, Dry Run, approvals, and local folder permission controls.',
    title: 'Start with safe, focused automation',
  },
} as const;

function currency(value: number, locale: 'en' | 'zh-Hant'): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'zh-TW').format(value);
}

export function PricingContent() {
  const { locale } = useLanguage();
  const text = copy[locale];

  return (
    <main className="min-h-screen bg-[#f7f8f5]">
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-10">
        <Brand />
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link className="hidden text-sm font-semibold text-slate-700 sm:inline" href="/">
            {text.back}
          </Link>
          <Link
            className="rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
            href="/register"
          >
            {text.freeStart}
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 pb-24 pt-20 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">
            {text.eyebrow}
          </p>
          <h1 className="mt-5 text-balance text-5xl font-semibold tracking-[-0.055em] text-slate-950 sm:text-6xl">
            {text.title}
          </h1>
          <p className="mt-5 text-lg leading-8 text-slate-600">{text.subtitle}</p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {PRODUCT_PLANS.map((plan) => {
            const features = [
              text.features.workflows(currency(plan.workflowLimit, locale)),
              text.features.runs(currency(plan.monthlyRunLimit, locale)),
              text.features.devices(plan.deviceLimit),
              text.features.members(plan.memberLimit),
              text.features.audit(currency(plan.auditRetentionDays, locale)),
            ];

            return (
              <article
                className={`relative flex flex-col rounded-3xl border p-6 shadow-sm ${
                  plan.featured
                    ? 'border-indigo-400 bg-slate-950 text-white ring-4 ring-indigo-100'
                    : 'border-slate-200 bg-white text-slate-950'
                }`}
                key={plan.code}
              >
                {plan.featured && (
                  <span className="absolute -top-3 left-6 rounded-full bg-indigo-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                    {text.recommended}
                  </span>
                )}
                <p
                  className={`text-xs font-bold uppercase tracking-[0.16em] ${
                    plan.featured ? 'text-emerald-300' : 'text-indigo-600'
                  }`}
                >
                  {plan.code}
                </p>
                <h2 className="mt-3 text-2xl font-semibold">
                  {locale === 'en' ? plan.name.en : plan.name.zhHant}
                </h2>
                <p
                  className={`mt-3 min-h-16 text-sm leading-6 ${
                    plan.featured ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  {locale === 'en' ? plan.description.en : plan.description.zhHant}
                </p>
                <div className="mt-6">
                  <span className="text-4xl font-semibold tracking-[-0.04em]">
                    NT${currency(plan.monthlyPriceTwd, locale)}
                  </span>
                  <span className={plan.featured ? 'text-slate-400' : 'text-slate-500'}>
                    {text.perMonth}
                  </span>
                </div>
                <p
                  className={`mt-2 text-xs ${plan.featured ? 'text-slate-400' : 'text-slate-500'}`}
                >
                  {text.annual} NT${currency(plan.annualPriceTwd, locale)}
                </p>
                <ul className="mt-7 space-y-3 text-sm">
                  {features.map((feature) => (
                    <li className="flex items-start gap-2" key={feature}>
                      <CheckIcon
                        className={`mt-0.5 size-4 shrink-0 ${
                          plan.featured ? 'text-emerald-300' : 'text-emerald-600'
                        }`}
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  className={`mt-8 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${
                    plan.featured
                      ? 'bg-white text-slate-950'
                      : 'border border-slate-300 bg-slate-50 text-slate-900'
                  }`}
                  href="/register"
                >
                  {plan.code === 'free' ? text.freeStart : text.create}
                  <ArrowRightIcon className="size-4" />
                </Link>
              </article>
            );
          })}
        </div>

        <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-5 text-slate-500">
          {text.footnote}
        </p>
      </section>
    </main>
  );
}
