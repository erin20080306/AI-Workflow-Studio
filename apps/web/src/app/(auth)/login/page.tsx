import type { Metadata } from 'next';
import Link from 'next/link';

import { ArrowRightIcon } from '@/components/icons';
import { LocalizedText } from '@/components/language-provider';
import { getEnvironment } from '@/lib/env';

import { loginAction } from '../actions';

export const metadata: Metadata = {
  title: '登入',
};

const statusMessages: Readonly<Record<string, { readonly en: string; readonly zhHant: string }>> = {
  'authentication-required': {
    en: 'Please sign in with a verified account.',
    zhHant: '請先登入已驗證的帳戶。',
  },
  'check-email': {
    en: 'Registration received. Verify your email, then sign in.',
    zhHant: '註冊資料已收到，請到信箱完成驗證後登入。',
  },
  'confirmation-failed': {
    en: 'The verification link is invalid or expired. Sign in or request a new link.',
    zhHant: '驗證連結無效或已過期，請重新登入或申請新連結。',
  },
  'invalid-credentials': {
    en: 'The email or password is incorrect.',
    zhHant: '電子郵件或密碼不正確。',
  },
  'invalid-input': {
    en: 'Check the email and password format.',
    zhHant: '請檢查電子郵件與密碼格式。',
  },
  'password-updated': {
    en: 'Password updated. Sign in with your new password.',
    zhHant: '密碼已更新，請使用新密碼登入。',
  },
  'recovery-sent': {
    en: 'If the account exists, a password reset email has been sent.',
    zhHant: '若帳戶存在，系統已寄出密碼重設信。',
  },
};

export default async function LoginPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ status?: string }>;
}>) {
  const environment = getEnvironment();
  const status = (await searchParams).status;
  const message = status === undefined ? undefined : statusMessages[status];

  return (
    <div className="w-full">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
        <LocalizedText en="Welcome back" zhHant="歡迎回來" />
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-slate-950">
        <LocalizedText en="Sign in to your workspace" zhHant="登入工作區" />
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        {environment.mockMode ? (
          <LocalizedText
            en="Safe Mock mode is active. No real account or external service will be contacted."
            zhHant="目前為安全 Mock 模式，不會連線真實帳戶或外部服務。"
          />
        ) : (
          <LocalizedText
            en="Sign in securely with a verified Supabase account."
            zhHant="使用已驗證的 Supabase 帳戶安全登入。"
          />
        )}
      </p>

      {message !== undefined && (
        <p
          aria-live="polite"
          className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900"
        >
          <LocalizedText en={message.en} zhHant={message.zhHant} />
        </p>
      )}

      <form action={loginAction} className="mt-8 space-y-5">
        <div>
          <label className="text-sm font-medium text-slate-800" htmlFor="email">
            <LocalizedText en="Email address" zhHant="電子郵件" />
          </label>
          <input
            autoComplete="email"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500"
            id="email"
            maxLength={320}
            name="email"
            placeholder="you@company.com"
            required
            type="email"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-800" htmlFor="password">
              <LocalizedText en="Password" zhHant="密碼" />
            </label>
            <Link
              className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
              href="/forgot-password"
            >
              <LocalizedText en="Forgot password?" zhHant="忘記密碼？" />
            </Link>
          </div>
          <input
            autoComplete="current-password"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500"
            id="password"
            maxLength={128}
            minLength={environment.mockMode ? 1 : 10}
            name="password"
            placeholder="輸入密碼"
            required
            type="password"
          />
        </div>
        <button
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          type="submit"
        >
          {environment.mockMode ? (
            <LocalizedText en="Enter Mock dashboard" zhHant="進入 Mock 控制台" />
          ) : (
            <LocalizedText en="Sign in securely" zhHant="安全登入" />
          )}
          <ArrowRightIcon className="size-4" />
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        <LocalizedText en="No account yet? " zhHant="還沒有帳戶？" />
        <Link className="font-semibold text-indigo-700 hover:text-indigo-900" href="/register">
          <LocalizedText en="Create a workspace" zhHant="建立工作區" />
        </Link>
      </p>
    </div>
  );
}
