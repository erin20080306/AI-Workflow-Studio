import type { Metadata } from 'next';

import { LocalizedText } from '@/components/language-provider';

import { updatePasswordAction } from '../actions';

export const metadata: Metadata = {
  title: '設定新密碼',
};

export default async function UpdatePasswordPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ status?: string }>;
}>) {
  const status = (await searchParams).status;

  return (
    <div className="w-full">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
        <LocalizedText en="Secure recovery" zhHant="安全復原" />
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-slate-950">
        <LocalizedText en="Set a new password" zhHant="設定新密碼" />
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        <LocalizedText
          en="Use at least 10 characters with uppercase and lowercase letters plus a number."
          zhHant="新密碼至少 10 個字元，且需包含英文大寫、小寫與數字。"
        />
      </p>
      {status !== undefined && (
        <p className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <LocalizedText
            en="The password could not be updated. Check the rules or request another reset link."
            zhHant="無法更新密碼，請檢查規則或重新申請重設連結。"
          />
        </p>
      )}
      <form action={updatePasswordAction} className="mt-8 space-y-5">
        <div>
          <label className="text-sm font-medium text-slate-800" htmlFor="new-password">
            <LocalizedText en="New password" zhHant="新密碼" />
          </label>
          <input
            autoComplete="new-password"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm"
            id="new-password"
            maxLength={128}
            minLength={10}
            name="password"
            required
            type="password"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-800" htmlFor="new-password-confirm">
            <LocalizedText en="Confirm new password" zhHant="確認新密碼" />
          </label>
          <input
            autoComplete="new-password"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm"
            id="new-password-confirm"
            maxLength={128}
            minLength={10}
            name="confirmPassword"
            required
            type="password"
          />
        </div>
        <button
          className="w-full rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-semibold text-white"
          type="submit"
        >
          <LocalizedText en="Update password" zhHant="更新密碼" />
        </button>
      </form>
    </div>
  );
}
