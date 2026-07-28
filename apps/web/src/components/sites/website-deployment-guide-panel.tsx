'use client';

import { useState } from 'react';

import { CheckIcon, SparkIcon } from '@/components/icons';
import { useLanguage } from '@/components/language-provider';
import {
  websiteDeploymentGuide,
  type WebsiteDeploymentProvider,
} from '@/lib/website-deployment-guide';
import type { WebsiteGithubPublication } from '@/lib/website-github-schema';

const copy = {
  en: {
    branch: 'Exact branch',
    choose: 'Deployment service',
    intro:
      'The guide below is automatically tailored to the repository and isolated branch you just published. Deployment stays under your own service account.',
    noDeploy:
      'External deployment is optional. Switch to Platform subdomain above if you want AI Workflow Studio to host the site for you.',
    repository: 'Repository',
    title: 'AI deployment guide',
  },
  'zh-Hant': {
    branch: '確切分支',
    choose: '部署服務',
    intro: '下方步驟會依照剛推送的儲存庫與隔離分支自動帶入；部署仍由客戶自己的服務帳戶管理。',
    noDeploy: '外部部署並非必要；若想由平台直接代管，請切換到上方「平台子網域」。',
    repository: '儲存庫',
    title: 'AI 部署引導',
  },
} as const;

export function WebsiteDeploymentGuidePanel({
  publication,
}: Readonly<{ publication: WebsiteGithubPublication }>) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const [provider, setProvider] = useState<WebsiteDeploymentProvider>('vercel');
  const guide = websiteDeploymentGuide(provider, publication, locale);

  return (
    <section className="mt-5 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-cyan-100">
        <SparkIcon className="size-4" /> {text.title}
      </h4>
      <p className="mt-2 text-xs leading-6 text-slate-300">{text.intro}</p>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-xl bg-slate-950/50 p-3">
          <dt className="text-slate-400">{text.repository}</dt>
          <dd className="mt-1 break-all font-mono text-slate-100">
            {publication.repositoryFullName}
          </dd>
        </div>
        <div className="rounded-xl bg-slate-950/50 p-3">
          <dt className="text-slate-400">{text.branch}</dt>
          <dd className="mt-1 break-all font-mono text-slate-100">{publication.branch}</dd>
        </div>
      </dl>
      <label className="mt-4 block text-xs font-semibold text-slate-200">
        <span className="mb-2 block">{text.choose}</span>
        <select
          className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-white"
          onChange={(event) => setProvider(event.target.value as WebsiteDeploymentProvider)}
          value={provider}
        >
          <option value="vercel">Vercel</option>
          <option value="cloudflare-pages">Cloudflare Pages</option>
          <option value="github-pages">GitHub Pages</option>
        </select>
      </label>
      <ol className="mt-4 space-y-2">
        {guide.steps.map((step, index) => (
          <li
            className="flex items-start gap-2 rounded-xl border border-white/10 bg-slate-950/40 p-3 text-xs leading-5 text-slate-200"
            key={step}
          >
            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-cyan-300 text-[10px] font-bold text-slate-950">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-cyan-100">
        <CheckIcon className="mt-0.5 size-4 shrink-0" /> {guide.note}
      </p>
      <a
        className="mt-4 inline-flex rounded-xl bg-cyan-200 px-4 py-3 text-sm font-semibold text-slate-950"
        href={guide.actionUrl}
        rel="noreferrer"
        target="_blank"
      >
        {guide.actionLabel} ↗
      </a>
      <p className="mt-3 text-[11px] leading-5 text-slate-400">{text.noDeploy}</p>
    </section>
  );
}
