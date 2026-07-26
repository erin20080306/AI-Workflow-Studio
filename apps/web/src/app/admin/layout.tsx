import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { logoutAction } from '@/app/(auth)/actions';
import { Brand } from '@/components/brand';
import { LanguageSwitcher, LocalizedText } from '@/components/language-provider';
import { PlatformAdminError, requirePlatformAdmin } from '@/lib/platform-admin';

export const metadata: Metadata = {
  title: '平台管理',
};

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  let administrator;
  try {
    administrator = await requirePlatformAdmin();
  } catch (error) {
    if (error instanceof PlatformAdminError) {
      redirect('/dashboard');
    }
    throw error;
  }

  return (
    <div className="min-h-screen bg-[#f3f5f1]">
      <header className="border-b border-slate-800 bg-slate-950 text-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-5">
            <Brand href="/admin" inverse />
            <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">
              <LocalizedText en="Platform Admin" zhHant="平台管理" />
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <LanguageSwitcher inverse />
            <div className="hidden text-right sm:block">
              <p className="font-semibold text-white">@{administrator.handle}</p>
              <p className="mt-0.5 uppercase tracking-wider text-slate-400">
                {administrator.role.replace('_', ' ')}
              </p>
            </div>
            <Link
              className="rounded-lg border border-white/15 px-3 py-2 font-semibold text-slate-200"
              href="/dashboard"
            >
              <LocalizedText en="Workspace" zhHant="工作區" />
            </Link>
            <form action={logoutAction}>
              <button
                className="rounded-lg bg-white px-3 py-2 font-semibold text-slate-950"
                type="submit"
              >
                <LocalizedText en="Sign out" zhHant="登出" />
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8">{children}</main>
    </div>
  );
}

export const dynamic = 'force-dynamic';
