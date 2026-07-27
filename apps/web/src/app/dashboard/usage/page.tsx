import { getProductPlan, microunitsToTwd } from '@ai-workflow-studio/usage-control';
import type { Metadata } from 'next';

import { AlertIcon, CheckIcon, ShieldIcon, SparkIcon } from '@/components/icons';
import { LocalizedText } from '@/components/language-provider';
import { requireWorkspaceContext } from '@/lib/auth/context';
import { getTenantUsageSnapshot } from '@/lib/usage-control-server';

export const metadata: Metadata = {
  title: '用量額度',
};

function byteLabel(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function percentage(used: number, limit: number): number {
  return limit === 0 ? 0 : Math.min(100, (used / limit) * 100);
}

const levelStyles = {
  blocked: 'border-rose-200 bg-rose-50 text-rose-900',
  critical: 'border-amber-300 bg-amber-50 text-amber-950',
  normal: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
} as const;

export default async function UsagePage() {
  const context = await requireWorkspaceContext();
  const snapshot = await getTenantUsageSnapshot(context);
  const plan = getProductPlan(snapshot.plan);
  const sourcePercent = percentage(snapshot.source.usedBytes, snapshot.source.limitBytes);
  const toolPercent = percentage(snapshot.toolCalls.used, snapshot.toolCalls.limit);
  const levelCopy = {
    blocked: {
      en: 'AI allowance reached. New model calls are paused until the next period.',
      zhHant: 'AI 額度已用完；新的模型呼叫會暫停至下一個週期。',
    },
    critical: {
      en: '95% warning: review usage before the safety ceiling is reached.',
      zhHant: '95% 警示：請在安全上限前檢視用量。',
    },
    normal: {
      en: 'Usage is within the safe monthly allowance.',
      zhHant: '目前用量在每月安全額度內。',
    },
    warning: {
      en: '80% warning: the monthly allowance is running low.',
      zhHant: '80% 警示：每月額度即將不足。',
    },
  } as const;

  return (
    <div className="mx-auto max-w-[1280px]">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
            <LocalizedText en="Cost guardrails" zhHant="成本安全控管" />
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em] text-slate-950">
            <LocalizedText en="Usage and allowance" zhHant="用量與額度" />
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            <LocalizedText
              en="Your plan includes a bounded monthly operating-cost allowance. This is not a token resale balance."
              zhHant="你的方案包含每月有上限的營運成本額度；這不是 Token 儲值餘額。"
            />
          </p>
        </div>
        <span className="w-fit rounded-full bg-slate-950 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white">
          {plan.name.zhHant} / {plan.name.en}
        </span>
      </header>

      <section
        className={`mt-7 flex items-start gap-3 rounded-2xl border px-5 py-4 ${levelStyles[snapshot.ai.level]}`}
      >
        {snapshot.ai.level === 'normal' ? (
          <CheckIcon className="mt-0.5 size-5 shrink-0" />
        ) : (
          <AlertIcon className="mt-0.5 size-5 shrink-0" />
        )}
        <div>
          <p className="text-sm font-semibold">
            <LocalizedText
              en={levelCopy[snapshot.ai.level].en}
              zhHant={levelCopy[snapshot.ai.level].zhHant}
            />
          </p>
          <p className="mt-1 text-xs opacity-75">
            <LocalizedText
              en="Warnings appear at 80% and 95%. Calls fail closed at 100% before contacting a provider."
              zhHant="80% 與 95% 會顯示警示；100% 時會在聯絡 Provider 前停止呼叫。"
            />
          </p>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
              <SparkIcon className="size-5" />
            </span>
            <span className="text-xs font-semibold text-slate-400">
              {snapshot.ai.percentUsed.toFixed(1)}%
            </span>
          </div>
          <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-950">
            NT${microunitsToTwd(snapshot.ai.remainingMicrounits).toFixed(2)}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            <LocalizedText en="Estimated AI allowance remaining" zhHant="AI 成本估算剩餘額度" />
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-500"
              style={{ width: `${Math.min(100, snapshot.ai.percentUsed)}%` }}
            />
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            <LocalizedText en="Reference sources" zhHant="參考來源" />
          </p>
          <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-950">
            {byteLabel(snapshot.source.usedBytes)}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            <LocalizedText
              en={<>of {byteLabel(snapshot.source.limitBytes)} this period</>}
              zhHant={<>本期共 {byteLabel(snapshot.source.limitBytes)}</>}
            />
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-sky-500"
              style={{ width: `${sourcePercent}%` }}
            />
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            <LocalizedText en="Audited tool calls" zhHant="已稽核工具呼叫" />
          </p>
          <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-950">
            {snapshot.toolCalls.used.toLocaleString()}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            <LocalizedText
              en={<>of {snapshot.toolCalls.limit.toLocaleString()} this period</>}
              zhHant={<>本期共 {snapshot.toolCalls.limit.toLocaleString()} 次</>}
            />
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${toolPercent}%` }}
            />
          </div>
        </article>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_380px]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">
            <LocalizedText en="Provider cost estimate" zhHant="Provider 成本估算" />
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            <LocalizedText
              en="Internal conservative estimates may differ from final provider invoices."
              zhHant="這是內部保守估算，可能與 Provider 最終帳單不同。"
            />
          </p>
          <div className="mt-4 divide-y divide-slate-100">
            {snapshot.providerCosts.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                <LocalizedText en="No AI cost recorded this period" zhHant="本期尚無 AI 成本紀錄" />
              </p>
            ) : (
              snapshot.providerCosts.map((provider) => (
                <div className="flex items-center justify-between py-3" key={provider.provider}>
                  <span className="text-sm font-semibold capitalize text-slate-700">
                    {provider.provider}
                  </span>
                  <span className="font-mono text-xs text-slate-500">
                    NT${microunitsToTwd(provider.costMicrounits).toFixed(2)}
                  </span>
                </div>
              ))
            )}
          </div>
        </article>

        <aside className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm">
          <div className="flex items-center gap-2 text-emerald-300">
            <ShieldIcon className="size-4" />
            <h2 className="text-xs font-bold uppercase tracking-[0.14em]">
              <LocalizedText en="Microsoft Store commerce" zhHant="Microsoft Store 收款" />
            </h2>
          </div>
          <p className="mt-4 text-lg font-semibold">
            <LocalizedText en="One paid source" zhHant="單一付費來源" />
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            <LocalizedText
              en="Paid plans are acquired in Microsoft Store. The Windows app sends a short-lived Store ID key to the server for verification; the key is never saved."
              zhHant="付費方案由 Microsoft Store 購買。Windows App 會將短效 Store ID Key 交給伺服器驗證，且系統不會儲存該 Key。"
            />
          </p>
          <p className="mt-5 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs leading-5 text-slate-300">
            <LocalizedText
              en="Verification and provider configuration remain server-side and are visible only to platform administrators."
              zhHant="權益驗證與 Provider 設定都留在伺服器端，僅平台管理者可查看設定狀態。"
            />
          </p>
        </aside>
      </section>
    </div>
  );
}

export const dynamic = 'force-dynamic';
