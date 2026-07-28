'use client';

import {
  WebsiteCustomDomainSchema,
  type WebsiteCustomDomain,
} from '@ai-workflow-studio/website-schema';
import { useState } from 'react';
import { z } from 'zod';

import { CheckIcon, ShieldIcon } from '@/components/icons';
import { useLanguage } from '@/components/language-provider';

const DomainResponseSchema = z.object({ domain: WebsiteCustomDomainSchema }).strict();
const ErrorResponseSchema = z
  .object({
    error: z.object({ message: z.string().min(1).max(500) }).passthrough(),
  })
  .passthrough();

const copy = {
  en: {
    active: 'Active',
    claim: 'Claim custom domain',
    claiming: 'Registering with Vercel…',
    disabled: 'Disabled',
    dns: 'DNS records',
    failed: 'Needs attention',
    fallback: 'Safe fallback',
    help: 'Paid workspace owners can attach a customer-owned hostname. Routing activates only after both ownership and DNS configuration pass Vercel verification.',
    hostname: 'Customer hostname',
    hostnamePlaceholder: 'www.customer-domain.com',
    open: 'Open custom domain',
    ownership: 'Ownership verified',
    paid: 'Custom domains require an active paid subscription and owner or admin access.',
    pending_dns: 'Waiting for DNS',
    pending_ownership: 'Waiting for ownership',
    provider:
      'Vercel custom-domain automation is not configured. Add the server-only project ID and access token before accepting claims.',
    routing: 'Routing verified',
    title: 'Customer custom domain',
    verify: 'Check DNS and activate',
    verifying: 'Checking Vercel…',
  },
  'zh-Hant': {
    active: '已啟用',
    claim: '申領客戶網域',
    claiming: '正在向 Vercel 登記…',
    disabled: '已停用',
    dns: 'DNS 設定紀錄',
    failed: '需要處理',
    fallback: '安全備援網址',
    help: '付費工作區的擁有者或管理員可綁定客戶持有的網域；只有網域所有權與 DNS 路由皆通過 Vercel 驗證後才會啟用。',
    hostname: '客戶網域',
    hostnamePlaceholder: 'www.customer-domain.com',
    open: '開啟自訂網域',
    ownership: '所有權已驗證',
    paid: '自訂網域需要有效付費訂閱，且操作者必須是工作區擁有者或管理員。',
    pending_dns: '等待 DNS',
    pending_ownership: '等待所有權驗證',
    provider:
      '尚未設定 Vercel 自訂網域自動化；正式受理前需加入伺服器端 Project ID 與 Access Token。',
    routing: '路由已驗證',
    title: '客戶自訂網域',
    verify: '檢查 DNS 並啟用',
    verifying: '正在向 Vercel 檢查…',
  },
} as const;

export function WebsiteCustomDomainPanel({
  canManage,
  initialDomains,
  projectId,
  providerConfigured,
}: Readonly<{
  canManage: boolean;
  initialDomains: readonly WebsiteCustomDomain[];
  projectId: string;
  providerConfigured: boolean;
}>) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const [domains, setDomains] = useState<readonly WebsiteCustomDomain[]>(initialDomains);
  const [hostname, setHostname] = useState('');
  const [busyId, setBusyId] = useState<string>();
  const [claiming, setClaiming] = useState(false);
  const [message, setMessage] = useState<string>();

  function replaceDomain(domain: WebsiteCustomDomain): void {
    setDomains((current) => [domain, ...current.filter((candidate) => candidate.id !== domain.id)]);
  }

  async function responseDomain(response: Response): Promise<WebsiteCustomDomain> {
    const payload: unknown = await response.json();
    if (!response.ok) {
      const error = ErrorResponseSchema.safeParse(payload);
      throw new Error(error.success ? error.data.error.message : 'Domain request failed.');
    }
    return DomainResponseSchema.parse(payload).domain;
  }

  async function claim(): Promise<void> {
    if (!canManage || !providerConfigured || claiming || hostname.trim().length < 4) return;
    setClaiming(true);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/websites/${projectId}/domains`, {
        body: JSON.stringify({ hostname }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      replaceDomain(await responseDomain(response));
      setHostname('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Domain request failed.');
    } finally {
      setClaiming(false);
    }
  }

  async function verify(domainId: string): Promise<void> {
    if (!canManage || !providerConfigured || busyId !== undefined) return;
    setBusyId(domainId);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/websites/${projectId}/domains/${domainId}/verify`, {
        method: 'POST',
      });
      replaceDomain(await responseDomain(response));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Domain request failed.');
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <section className="mt-6 rounded-3xl border border-sky-200 bg-sky-50 p-5 sm:p-6">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-sky-700">
        <ShieldIcon className="size-4" /> Phase 36
      </p>
      <h3 className="mt-2 text-lg font-semibold text-slate-950">{text.title}</h3>
      <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-600">{text.help}</p>

      {!canManage ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold leading-6 text-amber-900">
          {text.paid}
        </p>
      ) : !providerConfigured ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold leading-6 text-amber-900">
          {text.provider}
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label className="min-w-0 flex-1 text-xs font-semibold text-slate-600">
            <span className="mb-1.5 block">{text.hostname}</span>
            <input
              autoCapitalize="none"
              autoComplete="off"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-sky-500"
              disabled={claiming}
              inputMode="url"
              maxLength={253}
              onChange={(event) => setHostname(event.target.value)}
              placeholder={text.hostnamePlaceholder}
              spellCheck={false}
              value={hostname}
            />
          </label>
          <button
            className="self-end rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
            disabled={claiming || hostname.trim().length < 4}
            onClick={() => void claim()}
            type="button"
          >
            {claiming ? text.claiming : text.claim}
          </button>
        </div>
      )}

      {domains.length > 0 ? (
        <div className="mt-5 space-y-3">
          {domains.map((domain) => (
            <article className="rounded-2xl border border-sky-200 bg-white p-4" key={domain.id}>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <p className="break-all text-sm font-semibold text-slate-950">
                    {domain.hostname}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-sky-700">{text[domain.status]}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] font-semibold">
                  <span
                    className={`rounded-full px-2.5 py-1 ${
                      domain.ownershipVerified
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {domain.ownershipVerified ? '✓ ' : ''}
                    {text.ownership}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 ${
                      domain.routingVerified
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {domain.routingVerified ? '✓ ' : ''}
                    {text.routing}
                  </span>
                </div>
              </div>

              {domain.dnsRecords.length > 0 ? (
                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                  <p className="bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    {text.dns}
                  </p>
                  {domain.dnsRecords.map((record) => (
                    <dl
                      className="grid gap-2 border-t border-slate-200 px-3 py-3 text-[10px] sm:grid-cols-[75px_1fr_1.2fr]"
                      key={`${record.purpose}-${record.type}-${record.name}`}
                    >
                      <div>
                        <dt className="text-slate-400">Type</dt>
                        <dd className="mt-1 font-mono font-semibold text-slate-800">
                          {record.type}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-slate-400">Name</dt>
                        <dd className="mt-1 break-all font-mono text-slate-800">{record.name}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-slate-400">Value</dt>
                        <dd className="mt-1 break-all font-mono text-slate-800">{record.value}</dd>
                      </div>
                    </dl>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                {domain.status === 'active' ? (
                  <a
                    className="inline-flex items-center gap-1.5 font-semibold text-sky-700 underline underline-offset-4"
                    href={domain.publicUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <CheckIcon className="size-4" /> {text.open}
                  </a>
                ) : (
                  <button
                    className="rounded-xl bg-sky-700 px-4 py-2.5 font-semibold text-white disabled:opacity-40"
                    disabled={!canManage || !providerConfigured || busyId !== undefined}
                    onClick={() => void verify(domain.id)}
                    type="button"
                  >
                    {busyId === domain.id ? text.verifying : text.verify}
                  </button>
                )}
                <a
                  className="font-semibold text-slate-600 underline underline-offset-4"
                  href={domain.fallbackUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {text.fallback}
                </a>
              </div>
            </article>
          ))}
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
