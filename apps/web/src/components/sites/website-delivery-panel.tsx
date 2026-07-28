'use client';

import type {
  WebsitePublication,
  WebsiteSpecClientGeneration,
} from '@ai-workflow-studio/website-schema';
import { useState } from 'react';

import { useLanguage } from '@/components/language-provider';
import { WebsiteGithubPublishPanel } from '@/components/sites/website-github-publish-panel';
import { WebsitePublishPanel } from '@/components/sites/website-publish-panel';
import type { WebsiteGithubState } from '@/lib/website-github-schema';

type DeliveryMode = 'github' | 'subdomain';

const copy = {
  en: {
    github: 'GitHub / deploy yourself',
    githubHelp:
      'Paid members paste their own repository URL. The GitHub App publishes an isolated branch, then the AI guide explains deployment.',
    intro: 'Choose one delivery path. You can switch paths without changing the validated Canvas.',
    subdomain: 'Platform subdomain (recommended)',
    subdomainHelp:
      'Choose only the address name. AI Workflow Studio hosts the public site; no GitHub, DNS, or external deployment is required.',
    title: 'How should this website go live?',
  },
  'zh-Hant': {
    github: 'GitHub／自行部署',
    githubHelp: '付費會員貼上自己的儲存庫網址；GitHub App 只推送隔離分支，再由 AI 引導部署。',
    intro: '請選擇一種交付方式；切換方式不會改動已驗證的 Canvas 版本。',
    subdomain: '平台子網域（推薦）',
    subdomainHelp: '只需決定網址名稱；平台直接代管，不需要 GitHub、DNS 或其他部署。',
    title: '這個網站要如何正式上線？',
  },
} as const;

export function WebsiteDeliveryPanel({
  canPublishGithub,
  generation,
  githubState,
  initialPublication,
  projectId,
  suggestedSiteSlug,
  versions,
}: Readonly<{
  canPublishGithub: boolean;
  generation: WebsiteSpecClientGeneration;
  githubState: WebsiteGithubState;
  initialPublication: WebsitePublication | undefined;
  projectId: string;
  suggestedSiteSlug: string;
  versions: readonly WebsiteSpecClientGeneration[];
}>) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const [mode, setMode] = useState<DeliveryMode>('subdomain');

  return (
    <section className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">Phase 39</p>
      <h3 className="mt-2 text-xl font-semibold text-slate-950">{text.title}</h3>
      <p className="mt-2 text-xs leading-6 text-slate-600">{text.intro}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(
          [
            ['subdomain', text.subdomain, text.subdomainHelp],
            ['github', text.github, text.githubHelp],
          ] as const
        ).map(([value, label, help]) => (
          <button
            aria-pressed={mode === value}
            className={`rounded-2xl border p-4 text-left transition ${
              mode === value
                ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-900 hover:border-indigo-300'
            }`}
            key={value}
            onClick={() => setMode(value)}
            type="button"
          >
            <span className="block text-sm font-semibold">{label}</span>
            <span
              className={`mt-2 block text-xs leading-5 ${
                mode === value ? 'text-indigo-100' : 'text-slate-500'
              }`}
            >
              {help}
            </span>
          </button>
        ))}
      </div>

      {mode === 'subdomain' ? (
        <WebsitePublishPanel
          generation={generation}
          initialPublication={initialPublication}
          projectId={projectId}
          suggestedSiteSlug={suggestedSiteSlug}
        />
      ) : (
        <WebsiteGithubPublishPanel
          canPublish={canPublishGithub}
          initialState={githubState}
          projectId={projectId}
          suggestedSiteSlug={suggestedSiteSlug}
          versions={versions}
        />
      )}
    </section>
  );
}
