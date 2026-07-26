import type { Metadata } from 'next';
import Link from 'next/link';

import { ArrowRightIcon } from '@/components/icons';
import { LocalizedText } from '@/components/language-provider';
import { getEnvironment } from '@/lib/env';

import { registerAction } from '../actions';

export const metadata: Metadata = {
  title: '建立帳戶',
};

const statusMessages: Readonly<Record<string, { readonly en: string; readonly zhHant: string }>> = {
  'invalid-input': {
    en: 'Check every field, the workspace URL, and the password rules.',
    zhHant: '請確認所有欄位、網址代稱與密碼規則。',
  },
  'registration-unavailable': {
    en: 'Registration is temporarily unavailable. Please try again later.',
    zhHant: '目前無法完成註冊，請稍後再試。',
  },
};

export default async function RegisterPage({
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
        <LocalizedText en="Get started" zhHant="開始使用" />
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-slate-950">
        <LocalizedText en="Create your workspace" zhHant="建立你的工作區" />
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        {environment.mockMode ? (
          <LocalizedText
            en="Explore the complete interface in Mock mode without third-party credentials."
            zhHant="先以 Mock 模式探索完整介面，不需要任何第三方憑證。"
          />
        ) : (
          <LocalizedText
            en="Create an account, verify your email, and become the Owner of a new workspace."
            zhHant="建立個人帳戶、驗證電子郵件，並成為新工作區的 Owner。"
          />
        )}
      </p>

      {message !== undefined && (
        <p
          aria-live="polite"
          className="mt-5 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          <LocalizedText en={message.en} zhHant={message.zhHant} />
        </p>
      )}

      <form action={registerAction} className="mt-8 space-y-5">
        <div>
          <label className="text-sm font-medium text-slate-800" htmlFor="display-name">
            <LocalizedText en="Display name" zhHant="顯示名稱" />
          </label>
          <input
            autoComplete="name"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm placeholder:text-slate-400 focus:border-indigo-500"
            id="display-name"
            maxLength={120}
            name="displayName"
            placeholder="陳宛伶 / Erin Chen"
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-800" htmlFor="workspace-name">
            <LocalizedText en="Workspace name" zhHant="工作區名稱" />
          </label>
          <input
            autoComplete="organization"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm placeholder:text-slate-400 focus:border-indigo-500"
            id="workspace-name"
            maxLength={120}
            name="workspaceName"
            placeholder="營運自動化團隊 / Operations team"
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-800" htmlFor="workspace-slug">
            <LocalizedText en="Workspace URL slug" zhHant="工作區網址代稱" />
          </label>
          <input
            autoCapitalize="none"
            autoComplete="off"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-sm text-slate-950 shadow-sm placeholder:text-slate-400 focus:border-indigo-500"
            id="workspace-slug"
            maxLength={63}
            minLength={3}
            name="workspaceSlug"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder="operations-team"
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-800" htmlFor="register-email">
            <LocalizedText en="Email address" zhHant="電子郵件" />
          </label>
          <input
            autoComplete="email"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm placeholder:text-slate-400 focus:border-indigo-500"
            id="register-email"
            maxLength={320}
            name="email"
            placeholder="you@company.com"
            required
            type="email"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-800" htmlFor="register-password">
              <LocalizedText en="Password" zhHant="密碼" />
            </label>
            <input
              autoComplete="new-password"
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm placeholder:text-slate-400 focus:border-indigo-500"
              id="register-password"
              maxLength={128}
              minLength={10}
              name="password"
              placeholder="10+ characters / 至少 10 字元"
              required
              type="password"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-800" htmlFor="confirm-password">
              <LocalizedText en="Confirm password" zhHant="確認密碼" />
            </label>
            <input
              autoComplete="new-password"
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm placeholder:text-slate-400 focus:border-indigo-500"
              id="confirm-password"
              maxLength={128}
              minLength={10}
              name="confirmPassword"
              placeholder="Enter again / 再次輸入"
              required
              type="password"
            />
          </div>
        </div>
        <p className="text-xs leading-5 text-slate-500">
          <LocalizedText
            en="Use uppercase and lowercase letters plus a number. The platform never stores plaintext passwords."
            zhHant="密碼需包含大寫、小寫英文字母與數字。平台不會儲存明文密碼。"
          />
        </p>
        <label className="flex items-start gap-3 text-xs leading-5 text-slate-600">
          <input
            className="mt-1 size-4 rounded border-slate-300 text-indigo-600"
            name="terms"
            required
            type="checkbox"
            value="accepted"
          />
          <LocalizedText
            en="I agree to the Terms and Privacy Policy and understand that destructive workflows still require explicit approval."
            zhHant="我同意服務條款與隱私原則，並了解具破壞性的工作流仍需明確核准。"
          />
        </label>
        <button
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          type="submit"
        >
          {environment.mockMode ? (
            <LocalizedText en="Create Mock workspace" zhHant="建立 Mock 工作區" />
          ) : (
            <LocalizedText en="Create and verify account" zhHant="建立並驗證帳戶" />
          )}
          <ArrowRightIcon className="size-4" />
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        <LocalizedText en="Already have an account? " zhHant="已經有帳戶？" />
        <Link className="font-semibold text-indigo-700 hover:text-indigo-900" href="/login">
          <LocalizedText en="Back to sign in" zhHant="返回登入" />
        </Link>
      </p>
    </div>
  );
}
