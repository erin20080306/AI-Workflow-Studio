import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { logoutAction } from '@/app/(auth)/actions';
import { Brand } from '@/components/brand';
import { DashboardNavigation } from '@/components/dashboard-navigation';
import { SparkIcon } from '@/components/icons';
import { LanguageSwitcher, LocalizedText } from '@/components/language-provider';
import { MockModeBadge } from '@/components/mock-mode-badge';
import { AuthenticationError, requireWorkspaceContext } from '@/lib/auth/context';

export const metadata: Metadata = {
  title: '控制台',
};

function initials(displayName: string): string {
  return [...displayName.trim()].slice(0, 2).join('').toUpperCase();
}

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  let context;
  try {
    context = await requireWorkspaceContext();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      if (error.code === 'AUTH_WORKSPACE_REQUIRED') {
        redirect('/onboarding');
      }
      if (error.code === 'AUTHENTICATION_REQUIRED') {
        redirect('/login?status=authentication-required');
      }
    }
    throw error;
  }

  return (
    <div className="min-h-screen bg-[#f4f6f2] lg:grid lg:grid-cols-[244px_1fr]">
      <aside className="border-b border-slate-200 bg-slate-950 px-4 py-4 text-white lg:fixed lg:inset-y-0 lg:w-[244px] lg:border-b-0 lg:px-5 lg:py-6">
        <div className="flex items-center justify-between lg:block">
          <Brand href="/dashboard" inverse />
          <div className="lg:mt-7">
            <MockModeBadge />
          </div>
        </div>

        <DashboardNavigation platformAdmin={context.platformAdmin} />

        <div className="absolute bottom-5 left-5 right-5 hidden rounded-2xl border border-white/10 bg-white/5 p-4 lg:block">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-200">
            <SparkIcon className="size-4" />
            <LocalizedText en="Safe planning" zhHant="安全規劃" />
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            <LocalizedText
              en="Every generated workflow stays a draft until you review its permissions."
              zhHant="每個產生的工作流在你檢視權限之前，都會維持草稿狀態。"
            />
          </p>
        </div>
      </aside>

      <div className="lg:col-start-2">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/80 bg-[#f4f6f2]/90 px-5 backdrop-blur sm:px-8 lg:px-10">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              <LocalizedText en="Workspace" zhHant="工作區" />
            </p>
            <p className="text-sm font-semibold text-slate-800">{context.tenant.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <span className="hidden rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600 sm:inline-flex">
              {context.subscription.plan}
            </span>
            <button
              aria-label="Notifications / 通知"
              className="relative grid size-9 place-items-center rounded-full border border-slate-200 bg-white text-sm text-slate-600 shadow-sm"
              type="button"
            >
              <span aria-hidden="true">●</span>
              <span className="absolute right-1.5 top-1.5 size-2 rounded-full border-2 border-white bg-amber-500" />
            </button>
            <form action={logoutAction}>
              <button
                aria-label={`登出 ${context.displayName}`}
                className="grid size-9 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-800"
                title="登出"
                type="submit"
              >
                {initials(context.displayName)}
              </button>
            </form>
          </div>
        </header>
        <main className="px-5 py-7 sm:px-8 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}

export const dynamic = 'force-dynamic';
