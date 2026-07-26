import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { LocalizedText } from '@/components/language-provider';
import { AuthenticationError, getWorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';

import { onboardingAction } from '../actions';

export const metadata: Metadata = {
  title: '建立工作區',
};

export default async function OnboardingPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ status?: string }>;
}>) {
  if (getEnvironment().mockMode) {
    redirect('/dashboard');
  }

  try {
    const context = await getWorkspaceContext();
    if (context !== null) {
      redirect('/dashboard');
    }
  } catch (error) {
    if (error instanceof AuthenticationError && error.code === 'AUTHENTICATION_REQUIRED') {
      redirect('/login?status=authentication-required');
    }
    throw error;
  }

  const status = (await searchParams).status;
  return (
    <div className="w-full">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
        <LocalizedText en="Workspace setup" zhHant="工作區設定" />
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-slate-950">
        <LocalizedText en="Create your first workspace" zhHant="建立第一個工作區" />
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        <LocalizedText
          en="You will become the Owner. A Free subscription is created automatically and can be upgraded later."
          zhHant="你會成為 Owner。平台同時建立 Free 訂閱，之後可以再升級。"
        />
      </p>
      {status !== undefined && (
        <p className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <LocalizedText
            en="The workspace name or URL slug is invalid. Check the format."
            zhHant="名稱或網址代稱格式不正確，請重新檢查。"
          />
        </p>
      )}
      <form action={onboardingAction} className="mt-8 space-y-5">
        <div>
          <label className="text-sm font-medium text-slate-800" htmlFor="onboarding-name">
            <LocalizedText en="Workspace name" zhHant="工作區名稱" />
          </label>
          <input
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
            id="onboarding-name"
            maxLength={120}
            name="workspaceName"
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-800" htmlFor="onboarding-slug">
            <LocalizedText en="Workspace URL slug" zhHant="網址代稱" />
          </label>
          <input
            autoCapitalize="none"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-sm"
            id="onboarding-slug"
            maxLength={63}
            minLength={3}
            name="workspaceSlug"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder="operations-team"
            required
          />
        </div>
        <button
          className="w-full rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-semibold text-white"
          type="submit"
        >
          <LocalizedText en="Create Free workspace" zhHant="建立 Free 工作區" />
        </button>
      </form>
    </div>
  );
}
