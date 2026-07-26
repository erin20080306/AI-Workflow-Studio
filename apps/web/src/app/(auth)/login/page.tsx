import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ArrowRightIcon } from '@/components/icons';

export const metadata: Metadata = {
  title: '登入',
};

async function enterMockDashboard() {
  'use server';
  redirect('/dashboard');
}

export default function LoginPage() {
  return (
    <div className="w-full">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Welcome back</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-slate-950">登入工作區</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Phase 2 使用安全的 Mock 模式。Supabase 身分驗證會在多租戶階段啟用。
      </p>

      <form action={enterMockDashboard} className="mt-8 space-y-5">
        <div>
          <label className="text-sm font-medium text-slate-800" htmlFor="email">
            電子郵件
          </label>
          <input
            autoComplete="email"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500"
            id="email"
            name="email"
            placeholder="you@company.com"
            required
            type="email"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-800" htmlFor="password">
              密碼
            </label>
            <span className="text-xs text-slate-400">Mock mode</span>
          </div>
          <input
            autoComplete="current-password"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500"
            id="password"
            minLength={8}
            name="password"
            placeholder="至少 8 個字元"
            required
            type="password"
          />
        </div>
        <button
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          type="submit"
        >
          進入 Mock 控制台
          <ArrowRightIcon className="size-4" />
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        還沒有帳戶？{' '}
        <Link className="font-semibold text-indigo-700 hover:text-indigo-900" href="/register">
          建立工作區
        </Link>
      </p>
    </div>
  );
}
