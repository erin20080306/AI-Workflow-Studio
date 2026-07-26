import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Brand } from '@/components/brand';
import { DashboardNavigation } from '@/components/dashboard-navigation';
import { SparkIcon } from '@/components/icons';
import { MockModeBadge } from '@/components/mock-mode-badge';

export const metadata: Metadata = {
  title: '控制台',
};

export default function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-screen bg-[#f4f6f2] lg:grid lg:grid-cols-[244px_1fr]">
      <aside className="border-b border-slate-200 bg-slate-950 px-4 py-4 text-white lg:fixed lg:inset-y-0 lg:w-[244px] lg:border-b-0 lg:px-5 lg:py-6">
        <div className="flex items-center justify-between lg:block">
          <Brand href="/dashboard" inverse />
          <div className="lg:mt-7">
            <MockModeBadge />
          </div>
        </div>

        <DashboardNavigation />

        <div className="absolute bottom-5 left-5 right-5 hidden rounded-2xl border border-white/10 bg-white/5 p-4 lg:block">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-200">
            <SparkIcon className="size-4" />
            Safe planning
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Every generated workflow stays a draft until you review its permissions.
          </p>
        </div>
      </aside>

      <div className="lg:col-start-2">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/80 bg-[#f4f6f2]/90 px-5 backdrop-blur sm:px-8 lg:px-10">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              Workspace
            </p>
            <p className="text-sm font-semibold text-slate-800">營運自動化團隊</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              aria-label="Notifications"
              className="relative grid size-9 place-items-center rounded-full border border-slate-200 bg-white text-sm text-slate-600 shadow-sm"
              type="button"
            >
              <span aria-hidden="true">●</span>
              <span className="absolute right-1.5 top-1.5 size-2 rounded-full border-2 border-white bg-amber-500" />
            </button>
            <div className="grid size-9 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-800">
              EW
            </div>
          </div>
        </header>
        <main className="px-5 py-7 sm:px-8 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
