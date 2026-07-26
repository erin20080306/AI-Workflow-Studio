import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ArrowRightIcon } from '@/components/icons';

export const metadata: Metadata = {
  title: '建立帳戶',
};

async function enterMockWorkspace() {
  'use server';
  redirect('/dashboard');
}

export default function RegisterPage() {
  return (
    <div className="w-full">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Get started</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-slate-950">
        建立你的工作區
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        先在 Mock 模式探索完整介面，不需要任何第三方憑證。
      </p>

      <form action={enterMockWorkspace} className="mt-8 space-y-5">
        <div>
          <label className="text-sm font-medium text-slate-800" htmlFor="workspace-name">
            工作區名稱
          </label>
          <input
            autoComplete="organization"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm placeholder:text-slate-400 focus:border-indigo-500"
            id="workspace-name"
            name="workspace"
            placeholder="例如：營運自動化團隊"
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-800" htmlFor="register-email">
            電子郵件
          </label>
          <input
            autoComplete="email"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm placeholder:text-slate-400 focus:border-indigo-500"
            id="register-email"
            name="email"
            placeholder="you@company.com"
            required
            type="email"
          />
        </div>
        <button
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          type="submit"
        >
          建立 Mock 工作區
          <ArrowRightIcon className="size-4" />
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        已經有帳戶？{' '}
        <Link className="font-semibold text-indigo-700 hover:text-indigo-900" href="/login">
          返回登入
        </Link>
      </p>
    </div>
  );
}
