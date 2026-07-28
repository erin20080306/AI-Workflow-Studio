'use client';

import {
  WebsitePublicationSchema,
  WebsiteSiteSlugAvailabilitySchema,
  type WebsitePublication,
  type WebsiteSpecClientGeneration,
} from '@ai-workflow-studio/website-schema';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import { CheckIcon, ShieldIcon } from '@/components/icons';
import { useLanguage } from '@/components/language-provider';
import {
  normalizeWebsiteSiteSlug,
  WEBSITE_SITE_HOST_SUFFIX,
  websiteSiteUrl,
} from '@/lib/website-site-host';

const PublicationResponseSchema = z.object({ publication: WebsitePublicationSchema }).strict();
type SlugState = 'available' | 'checking' | 'invalid' | 'unavailable';

const copy = {
  en: {
    address: 'Platform subdomain',
    addressHelp:
      'Choose the first part of your public address. No DNS setup or separate domain purchase is needed.',
    available: 'This address is available.',
    cancel: 'Keep as draft',
    checking: 'Checking availability…',
    confirm: 'I reviewed this Canvas and approve publishing this exact version.',
    failed: 'This version could not be published. No public release was changed.',
    invalid: 'Use 3–63 lowercase letters, numbers, or hyphens. System names are reserved.',
    live: 'Live release',
    newer: 'The Canvas has unpublished changes.',
    open: 'Open public website',
    placeholder: 'my-brand',
    publish: 'Review and publish',
    publishing: 'Publishing approved version…',
    release: 'Publish version',
    same: 'The current Canvas matches the live release.',
    title: 'Explicit publishing approval',
    unavailable: 'This address is already in use. Choose another name.',
    warning:
      'Publishing makes this validated version publicly reachable. It does not expose prompts, credentials, private assets, or version history.',
  },
  'zh-Hant': {
    address: '平台子網域名稱',
    addressHelp: '只需輸入公開網址前面的名稱，不需要購買網域，也不需要設定 DNS。',
    available: '此網址名稱可以使用。',
    cancel: '保留草稿',
    checking: '正在檢查名稱…',
    confirm: '我已檢查此 Canvas，並同意公開這個確切版本。',
    failed: '無法發布這個版本；既有公開版本沒有被更動。',
    invalid: '請輸入 3–63 個小寫英文字母、數字或連字號；系統保留名稱不能使用。',
    live: '目前公開版本',
    newer: 'Canvas 有尚未發布的變更。',
    open: '開啟公開網站',
    placeholder: '我的品牌英文名稱',
    publish: '檢查並發布',
    publishing: '正在發布已核准版本…',
    release: '發布版本',
    same: '目前 Canvas 與公開版本一致。',
    title: '明確確認發布',
    unavailable: '此網址名稱已被使用，請換一個名稱。',
    warning: '發布後，這個已驗證版本會公開存取；需求對話、憑證、私密素材與版本紀錄不會公開。',
  },
} as const;

function initialSlugValue(publication: WebsitePublication | undefined, suggested: string): string {
  try {
    return normalizeWebsiteSiteSlug(publication?.slug ?? suggested);
  } catch {
    return 'my-site';
  }
}

export function WebsitePublishPanel({
  generation,
  initialPublication,
  projectId,
  suggestedSiteSlug,
}: Readonly<{
  generation: WebsiteSpecClientGeneration;
  initialPublication: WebsitePublication | undefined;
  projectId: string;
  suggestedSiteSlug: string;
}>) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const [publication, setPublication] = useState(initialPublication);
  const [reviewing, setReviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<string>();
  const [siteSlug, setSiteSlug] = useState(() =>
    initialSlugValue(initialPublication, suggestedSiteSlug),
  );
  const [normalizedSlug, setNormalizedSlug] = useState(() =>
    initialSlugValue(initialPublication, suggestedSiteSlug),
  );
  const [slugState, setSlugState] = useState<SlugState>('checking');
  const sameVersion = publication?.version === generation.version;

  useEffect(() => {
    let normalized: string;
    try {
      normalized = normalizeWebsiteSiteSlug(siteSlug);
      setNormalizedSlug(normalized);
    } catch {
      setSlugState('invalid');
      return;
    }
    setSlugState('checking');
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/websites/${projectId}/subdomain?name=${encodeURIComponent(normalized)}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload: unknown = await response.json();
          if (!response.ok) throw new Error('availability failed');
          return WebsiteSiteSlugAvailabilitySchema.parse(payload);
        })
        .then((availability) => {
          setNormalizedSlug(availability.normalizedSlug);
          setSlugState(availability.available ? 'available' : 'unavailable');
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setSlugState('unavailable');
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [projectId, siteSlug]);

  async function publish(): Promise<void> {
    if (!confirmed || publishing || slugState !== 'available') return;
    setPublishing(true);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/websites/${projectId}/publish`, {
        body: JSON.stringify({
          confirmed: true,
          siteSlug: normalizedSlug,
          version: generation.version,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error('publish failed');
      setPublication(PublicationResponseSchema.parse(payload).publication);
      setSiteSlug(normalizedSlug);
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

      <div className="mt-5 rounded-2xl border border-emerald-200 bg-white p-4">
        <label className="text-xs font-semibold text-slate-700">
          <span className="block text-sm text-slate-950">{text.address}</span>
          <span className="mt-1 block font-normal leading-5 text-slate-500">
            {text.addressHelp}
          </span>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              autoCapitalize="none"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-3 font-mono text-sm outline-none focus:border-emerald-500"
              disabled={publishing}
              maxLength={63}
              onChange={(event) => setSiteSlug(event.target.value)}
              placeholder={text.placeholder}
              spellCheck={false}
              value={siteSlug}
            />
            <span className="shrink-0 font-mono text-[11px] text-slate-500">
              .{WEBSITE_SITE_HOST_SUFFIX}
            </span>
          </div>
        </label>
        <p
          aria-live="polite"
          className={`mt-2 text-xs font-semibold ${
            slugState === 'available'
              ? 'text-emerald-700'
              : slugState === 'checking'
                ? 'text-slate-500'
                : 'text-rose-700'
          }`}
        >
          {slugState === 'available'
            ? text.available
            : slugState === 'checking'
              ? text.checking
              : slugState === 'invalid'
                ? text.invalid
                : text.unavailable}
        </p>
        {slugState === 'available' ? (
          <p className="mt-1 break-all font-mono text-[11px] text-slate-500">
            {websiteSiteUrl(normalizedSlug)}
          </p>
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
              disabled={!confirmed || publishing || slugState !== 'available'}
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
    </section>
  );
}
