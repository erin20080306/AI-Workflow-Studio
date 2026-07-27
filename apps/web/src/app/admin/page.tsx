import { PRODUCT_PLANS } from '@ai-workflow-studio/shared/plans';
import Link from 'next/link';

import { SparkIcon } from '@/components/icons';
import { LocalizedText } from '@/components/language-provider';
import {
  getPlatformAdminOverview,
  getPlatformOperationsOverview,
  listPlatformTenants,
  requirePlatformAdmin,
} from '@/lib/platform-admin';

import { changeTenantPlanAction } from './actions';

const statusMessages: Readonly<Record<string, { readonly en: string; readonly zhHant: string }>> = {
  forbidden: {
    en: 'This administrator role cannot change plans.',
    zhHant: '目前管理角色沒有變更方案的權限。',
  },
  'invalid-plan': {
    en: 'The plan change request is invalid.',
    zhHant: '方案變更資料無效。',
  },
  'plan-updated': {
    en: 'The tenant plan was updated and written to the platform audit log.',
    zhHant: 'Tenant 方案已更新並寫入平台稽核紀錄。',
  },
  'update-failed': {
    en: 'The plan could not be updated. No data was changed.',
    zhHant: '無法更新方案，資料未變更。',
  },
};

export default async function AdminPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ status?: string }>;
}>) {
  const [administrator, overview, operations, tenants, params] = await Promise.all([
    requirePlatformAdmin(),
    getPlatformAdminOverview(),
    getPlatformOperationsOverview(),
    listPlatformTenants(),
    searchParams,
  ]);
  const statusMessage = params.status === undefined ? undefined : statusMessages[params.status];
  const canChangePlan = administrator.role !== 'support';
  const overviewCards = [
    { label: { en: 'Accounts', zhHant: '帳戶' }, value: overview.userCount },
    { label: { en: 'Tenants', zhHant: 'Tenant' }, value: overview.tenantCount },
    {
      label: { en: 'Active subscriptions', zhHant: '有效訂閱' },
      value: overview.activeSubscriptions,
    },
  ] as const;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
            <LocalizedText en="Operations control plane" zhHant="營運控制中心" />
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em] text-slate-950">
            <LocalizedText en="Platform administration" zhHant="平台管理總覽" />
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            <LocalizedText
              en="Only account, tenant, subscription, and audit metadata is shown—never passwords, tokens, or spreadsheet content."
              zhHant="只顯示帳戶、Tenant、訂閱與稽核中繼資料；不顯示密碼、Token 或試算表內容。"
            />
          </p>
        </div>
        <Link
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          href="/admin/ai-providers"
        >
          <SparkIcon className="size-4" />
          <LocalizedText en="AI provider status" zhHant="AI Provider 狀態" />
        </Link>
      </div>

      {statusMessage !== undefined && (
        <p
          aria-live="polite"
          className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900"
        >
          <LocalizedText en={statusMessage.en} zhHant={statusMessage.zhHant} />
        </p>
      )}

      <section className="mt-7 grid gap-4 sm:grid-cols-3">
        {overviewCards.map(({ label, value }) => (
          <article
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            key={label.en}
          >
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              <LocalizedText en={label.en} zhHant={label.zhHant} />
            </p>
            <p className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
          </article>
        ))}
      </section>

      <section className="mt-7 rounded-2xl bg-slate-950 p-5 text-white shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
              <LocalizedText en="Monthly operating estimate" zhHant="每月營運估算" />
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              <LocalizedText en="Store revenue and cost guard" zhHant="Store 收益與成本控管" />
            </h2>
          </div>
          <p className="max-w-lg text-xs leading-5 text-slate-400">
            <LocalizedText
              en="Estimates use monthly catalog prices, a 15% Store service-fee assumption, and the internal conservative AI rate card. Tax, refunds, annual SKUs, and final provider invoices may differ."
              zhHant="估算採每月目錄價格、15% Store 服務費假設與內部保守 AI 費率；稅款、退款、年繳 SKU 與最終 Provider 帳單可能不同。"
            />
          </p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            {
              label: { en: 'Gross catalog', zhHant: '目錄總額' },
              value: `NT$${operations.grossMicrosoftCatalogRevenueTwd.toFixed(2)}`,
            },
            {
              label: { en: 'Net after 15%', zhHant: '扣 15% 後' },
              value: `NT$${operations.estimatedMicrosoftNetRevenueTwd.toFixed(2)}`,
            },
            {
              label: { en: 'AI cost estimate', zhHant: 'AI 成本估算' },
              value: `NT$${operations.estimatedAiCostTwd.toFixed(2)}`,
            },
            {
              label: { en: 'Estimated margin', zhHant: '估算毛利' },
              value: `NT$${operations.estimatedMarginTwd.toFixed(2)}`,
            },
            {
              label: { en: 'Usage warnings', zhHant: '用量警示' },
              value: operations.tenantsAtWarning.toString(),
            },
          ].map((card) => (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4" key={card.label.en}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <LocalizedText en={card.label.en} zhHant={card.label.zhHant} />
              </p>
              <p className="mt-3 text-xl font-semibold">{card.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-400">
          <LocalizedText
            en={`${operations.internalOverrideCount} paid-feature internal overrides are excluded from Store revenue.`}
            zhHant={`${operations.internalOverrideCount} 個內部付費功能覆寫不計入 Store 收益。`}
          />
        </p>
      </section>

      <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 className="text-base font-semibold text-slate-950">
            <LocalizedText en="Tenants and plans" zhHant="Tenant 與方案" />
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            <LocalizedText
              en="Manual changes are limited to testing, compensation, or external billing synchronization. Every change is audited."
              zhHant="人工調整只用於內部管理者、測試或補償；一般付費方案只由 Microsoft Store 同步。每次變更都寫入管理稽核。"
            />
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-3 font-semibold">Tenant</th>
                <th className="px-6 py-3 font-semibold">
                  <LocalizedText en="Status" zhHant="狀態" />
                </th>
                <th className="px-6 py-3 font-semibold">
                  <LocalizedText en="Created" zhHant="建立日期" />
                </th>
                <th className="px-6 py-3 font-semibold">
                  <LocalizedText en="Plan" zhHant="方案" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.map((tenant) => (
                <tr key={tenant.id}>
                  <td className="px-6 py-4">
                    <p className="font-semibold text-slate-900">{tenant.name}</p>
                    <p className="mt-1 font-mono text-xs text-slate-400">{tenant.slug}</p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {tenant.billingProvider === 'microsoft_store'
                        ? 'Microsoft Store'
                        : tenant.plan === 'free'
                          ? 'Free'
                          : 'Internal override'}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      {tenant.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium' }).format(
                      new Date(tenant.createdAt),
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <form action={changeTenantPlanAction} className="flex items-center gap-2">
                      <input name="tenantId" type="hidden" value={tenant.id} />
                      <select
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                        defaultValue={tenant.plan}
                        disabled={!canChangePlan}
                        name="plan"
                      >
                        {PRODUCT_PLANS.map((plan) => (
                          <option key={plan.code} value={plan.code}>
                            {plan.name.zhHant} / {plan.name.en}
                          </option>
                        ))}
                      </select>
                      <button
                        className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                        disabled={!canChangePlan}
                        type="submit"
                      >
                        <LocalizedText en="Update" zhHant="更新" />
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td className="px-6 py-10 text-center text-slate-500" colSpan={4}>
                    <LocalizedText en="No tenants yet." zhHant="尚無 Tenant。" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
