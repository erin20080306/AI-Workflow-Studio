'use client';

import {
  type WebsiteCustomDomain,
  WebsitePublicationSchema,
  type WebsitePublication,
  type WebsiteSpecClientGeneration,
} from '@ai-workflow-studio/website-schema';
import { useState } from 'react';
import { z } from 'zod';

import { CheckIcon, ShieldIcon } from '@/components/icons';
import { useLanguage } from '@/components/language-provider';
import { WebsiteCustomDomainPanel } from '@/components/sites/website-custom-domain-panel';
import { websiteSiteUrl } from '@/lib/website-site-host';

const PublicationResponseSchema = z.object({ publication: WebsitePublicationSchema }).strict();

const copy = {
  en: {
    cancel: 'Keep as draft',
    confirm: 'I reviewed this Canvas and approve publishing this exact version.',
    failed: 'This version could not be published. No public release was changed.',
    live: 'Live release',
    newer: 'The Canvas has unpublished changes.',
    open: 'Open public website',
    publish: 'Review and publish',
    publishing: 'Publishing approved version…',
    release: 'Publish version',
    same: 'The current Canvas matches the live release.',
    title: 'Explicit publishing approval',
    warning:
      'Publishing makes this validated version publicly reachable. It does not expose prompts, credentials, private assets, or version history.',
  },
  'zh-Hant': {
    cancel: '保留草稿',
    confirm: '我已檢查此 Canvas，並同意公開這個確切版本。',
    failed: '無法發布這個版本；既有公開版本沒有被更動。',
    live: '目前公開版本',
    newer: 'Canvas 有尚未發布的變更。',
    open: '開啟公開網站',
    publish: '檢查並發布',
    publishing: '正在發布已核准版本…',
    release: '發布版本',
    same: '目前 Canvas 與公開版本一致。',
    title: '明確確認發布',
    warning: '發布後，這個已驗證版本會公開存取；需求對話、憑證、私密素材與版本紀錄不會公開。',
  },
} as const;

export function WebsitePublishPanel({
  canManageCustomDomains,
  generation,
  initialDomains,
  initialPublication,
  projectId,
  providerConfigured,
}: Readonly<{
  canManageCustomDomains: boolean;
  generation: WebsiteSpecClientGeneration;
  initialDomains: readonly WebsiteCustomDomain[];
  initialPublication: WebsitePublication | undefined;
  projectId: string;
  providerConfigured: boolean;
}>) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const [publication, setPublication] = useState(initialPublication);
  const [reviewing, setReviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<string>();
  const sameVersion = publication?.version === generation.version;

  async function publish(): Promise<void> {
    if (!confirmed || publishing) return;
    setPublishing(true);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/websites/${projectId}/publish`, {
        body: JSON.stringify({ confirmed: true, version: generation.version }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error('publish failed');
      setPublication(PublicationResponseSchema.parse(payload).publication);
      setConfirmed(false);
      setReviewing(false);
    } catch {
      setMessage(text.failed);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
            <ShieldIcon className="size-4" />
            Phase 30
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">{text.title}</h3>
          <p className="mt-2 text-xs leading-6 text-slate-600">{text.warning}</p>
          {publication !== undefined ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-semibold text-emerald-800">
                <CheckIcon className="size-4" />
                {text.live} · v{publication.version}
              </span>
              <a
                className="font-semibold text-indigo-700 underline underline-offset-4"
                href={websiteSiteUrl(publication.slug)}
                rel="noreferrer"
                target="_blank"
              >
                {text.open}
              </a>
              <span className="text-slate-500">{sameVersion ? text.same : text.newer}</span>
            </div>
          ) : null}
        </div>
        {!reviewing ? (
          <button
            className="shrink-0 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            onClick={() => setReviewing(true)}
            type="button"
          >
            {text.publish} · v{generation.version}
          </button>
        ) : null}
      </div>

      {reviewing ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-white p-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-slate-700">
            <input
              checked={confirmed}
              className="mt-1 size-4 accent-emerald-600"
              onChange={(event) => setConfirmed(event.target.checked)}
              type="checkbox"
            />
            <span>{text.confirm}</span>
          </label>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              disabled={!confirmed || publishing}
              onClick={() => void publish()}
              type="button"
            >
              {publishing ? text.publishing : `${text.release} v${generation.version}`}
            </button>
            <button
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700"
              disabled={publishing}
              onClick={() => {
                setConfirmed(false);
                setReviewing(false);
              }}
              type="button"
            >
              {text.cancel}
            </button>
          </div>
        </div>
      ) : null}

      {message !== undefined ? (
        <p aria-live="polite" className="mt-3 text-xs font-semibold text-rose-700">
          {message}
        </p>
      ) : null}

      {publication !== undefined ? (
        <WebsiteCustomDomainPanel
          canManage={canManageCustomDomains}
          initialDomains={initialDomains}
          projectId={projectId}
          providerConfigured={providerConfigured}
        />
      ) : null}
    </section>
  );
}
