import type { Metadata } from 'next';
import Link from 'next/link';

import { ChevronRightIcon } from '@/components/icons';
import {
  ProviderSettingsPanel,
  type ProviderSettingView,
} from '@/components/settings/provider-settings-panel';
import { getEnvironment } from '@/lib/env';

export const metadata: Metadata = {
  title: 'AI 模型與 Provider',
};

export default function AiModelsPage() {
  const environment = getEnvironment();
  const providers: readonly ProviderSettingView[] = [
    {
      configured: true,
      description: '無外部連線、可重現，供開發、教學與 E2E 使用。',
      id: 'mock',
      label: 'Mock Planner',
      model: environment.providerModels.mock,
    },
    {
      configured: environment.providers.openai,
      description: 'Responses API；使用 JSON output mode，最終仍由 Workflow v1 完整驗證。',
      id: 'openai',
      label: 'OpenAI',
      model: environment.providerModels.openai,
    },
    {
      configured: environment.providers.anthropic,
      description: 'Messages API；使用 output_config.format 的 JSON Schema。',
      id: 'anthropic',
      label: 'Anthropic',
      model: environment.providerModels.anthropic,
    },
    {
      configured: environment.providers.gemini,
      description: 'Generate Content API；使用 application/json 與 response schema。',
      id: 'gemini',
      label: 'Google Gemini',
      model: environment.providerModels.gemini,
    },
  ];

  return (
    <div className="mx-auto max-w-[1280px]">
      <nav
        aria-label="Breadcrumb"
        className="mb-5 flex items-center gap-1.5 text-xs text-slate-500"
      >
        <Link className="transition hover:text-indigo-700" href="/dashboard/settings">
          設定
        </Link>
        <ChevronRightIcon className="size-3.5 text-slate-300" />
        <span aria-current="page" className="font-medium text-slate-800">
          AI 模型
        </span>
      </nav>
      <header className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
          Server-side providers
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
          AI 模型與 Provider
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Provider 只負責提出 JSON 草稿。平台會限制修復次數，並在任何儲存或執行前重新驗證完整
          Workflow schema、DAG 與核准風險。
        </p>
      </header>
      <ProviderSettingsPanel providers={providers} />
    </div>
  );
}
