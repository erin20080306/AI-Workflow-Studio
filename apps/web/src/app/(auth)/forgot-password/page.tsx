import type { Metadata } from 'next';
import Link from 'next/link';

import { LocalizedText } from '@/components/language-provider';

import { requestPasswordResetAction } from '../actions';

export const metadata: Metadata = {
  title: '重設密碼',
};

export default async function ForgotPasswordPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ status?: string }>;
}>) {
  const status = (await searchParams).status;

  return (
    <div className="w-full">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
        <LocalizedText en="Account recovery" zhHant="帳戶復原" />
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-slate-950">
        <LocalizedText en="Reset your password" zhHant="重設密碼" />
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        <LocalizedText
          en="Enter your account email. To protect privacy, the platform never reveals whether the address exists."
          zhHant="輸入註冊電子郵件。為保護帳戶隱私，系統不會顯示該地址是否存在。"
        />
      </p>
      {status !== undefined && (
        <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {status === 'mock-mode' ? (
            <LocalizedText
              en="Mock mode does not send email."
              zhHant="Mock 模式不會寄送電子郵件。"
            />
          ) : (
            <LocalizedText
              en="Check the email format and try again."
              zhHant="請檢查電子郵件格式後再試一次。"
            />
          )}
        </p>
      )}
      <form action={requestPasswordResetAction} className="mt-8 space-y-5">
        <div>
          <label className="text-sm font-medium text-slate-800" htmlFor="recovery-email">
            <LocalizedText en="Email address" zhHant="電子郵件" />
          </label>
          <input
            autoComplete="email"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm"
            id="recovery-email"
            maxLength={320}
            name="email"
            required
            type="email"
          />
        </div>
        <button
          className="w-full rounded-xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white"
          type="submit"
        >
          <LocalizedText en="Send reset link" zhHant="寄送重設連結" />
        </button>
      </form>
      <Link className="mt-6 block text-center text-sm font-semibold text-indigo-700" href="/login">
        <LocalizedText en="Back to sign in" zhHant="返回登入" />
      </Link>
    </div>
  );
}
