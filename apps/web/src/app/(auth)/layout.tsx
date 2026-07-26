import type { ReactNode } from 'react';

import { Brand } from '@/components/brand';
import { LanguageSwitcher, LocalizedText } from '@/components/language-provider';
import { MockModeBadge } from '@/components/mock-mode-badge';

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[0.92fr_1.08fr]">
      <section className="flex min-h-screen flex-col bg-[#f8f9f6] px-5 py-5 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between">
          <Brand />
          <div className="flex items-center gap-2">
            <MockModeBadge />
            <LanguageSwitcher />
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 items-center py-16">{children}</div>
        <p className="text-xs leading-5 text-slate-500">
          <LocalizedText
            en="By continuing, you agree to keep workflow permissions explicit and review destructive actions before execution."
            zhHant="繼續操作即表示你同意維持明確的工作流權限，並在執行前檢視具破壞性的動作。"
          />
        </p>
      </section>

      <aside className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 size-[32rem] rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="absolute -bottom-48 -left-24 size-[34rem] rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="relative z-10 max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
            <LocalizedText en="Built for accountable automation" zhHant="為可追溯的自動化而生" />
          </p>
          <blockquote className="text-balance mt-6 text-4xl font-medium leading-tight tracking-[-0.035em]">
            <LocalizedText
              en="“The plan is always visible before the work begins.”"
              zhHant="「工作開始之前，完整計畫永遠清楚可見。」"
            />
          </blockquote>
        </div>
        <div className="workflow-grid relative z-10 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              <LocalizedText en="Safety sequence" zhHant="安全執行順序" />
            </p>
            <span className="rounded-full bg-emerald-300/15 px-2.5 py-1 text-xs text-emerald-200">
              <LocalizedText en="Enforced" zhHant="強制套用" />
            </span>
          </div>
          <div className="mt-7 grid grid-cols-3 gap-3 text-center text-xs text-slate-300">
            {[
              { en: 'Validate', zhHant: '驗證' },
              { en: 'Dry run', zhHant: '試跑' },
              { en: 'Approve', zhHant: '核准' },
            ].map((label, index) => (
              <div className="relative" key={label.en}>
                {index < 2 && (
                  <span className="absolute left-[60%] top-4 h-px w-[80%] bg-white/20" />
                )}
                <span className="relative mx-auto grid size-8 place-items-center rounded-full border border-emerald-300/40 bg-slate-900 font-semibold text-emerald-200">
                  {index + 1}
                </span>
                <p className="mt-2">
                  <LocalizedText en={label.en} zhHant={label.zhHant} />
                </p>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </main>
  );
}
