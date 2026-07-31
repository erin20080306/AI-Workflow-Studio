'use client';

import { AIPlannerOutputSchema, type Workflow } from '@ai-workflow-studio/workflow-schema';
import type { AiModelTierSelection } from '@ai-workflow-studio/usage-control';
import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { z } from 'zod';

import {
  ArrowRightIcon,
  CheckIcon,
  DeviceIcon,
  FolderIcon,
  ShieldIcon,
  SparkIcon,
} from '@/components/icons';
import { useLanguage } from '@/components/language-provider';
import { AssistantWorkflowDraftCreateResponseSchema } from '@/lib/assistant-execution-schema';
import type { AssistantExecutionTarget } from '@/lib/assistant-execution-targets';
import type { AiProviderSelection, AiTierOption } from '@/lib/ai-model-selection';
import { selectWorkflowPlanningContext } from '@/lib/workflow-planning-context';

import { WorkflowReview } from './workflow-review';

const copy = {
  en: {
    alias: 'Approved folder access',
    autoSaved: 'AI workflow draft created',
    cloud: 'Secure cloud planner',
    cloudHelp:
      'No Desktop Agent is paired. AI will create the safest cloud-compatible draft and will not invent a device, path, or connection.',
    context: 'Trusted execution context',
    create: 'Create workflow with AI',
    description:
      'A few words are enough. AI fills conservative defaults, validates Workflow JSON, and saves a draft automatically. It never activates or runs the workflow.',
    device: 'Execution target',
    draft: 'Validated workflow draft',
    error:
      'AI could not create a validated workflow right now. Nothing was saved or executed. Please try again.',
    googleRequired: 'Connect Google Workspace before creating this cloud workflow.',
    desktopRequired:
      'Pair an online Desktop Agent and approve a folder before creating this workflow.',
    example: 'Organize orders every day and create a summary.',
    folderCount: (count: number) => `${count} approved folder ${count === 1 ? 'alias' : 'aliases'}`,
    help: 'Start with a short phrase. Add a source, timing, or output only when you want more control.',
    minLength: 'Enter at least 2 meaningful characters.',
    modelUsed: 'Account model',
    noFolders: 'No local folder access',
    openWorkflow: 'Open workflow',
    planner: 'Automatic AI planner',
    provider: 'Model provider',
    planning: 'Planning, validating, and saving…',
    prompt: 'What should be automated?',
    retrySave: 'The plan is valid, but the draft was not saved. Retry saving it below.',
    savedHelp: 'It remains inactive. No file, service, or external data was changed.',
    targetHelp:
      'Only the displayed Agent and folder aliases are shared with the planner. Absolute paths stay on the Desktop Agent.',
    title: 'Describe the work in a few words',
    tier: 'Model level',
    useExample: 'Use example',
  },
  'zh-Hant': {
    alias: '已核准的資料夾權限',
    autoSaved: 'AI 工作流草稿已建立',
    cloud: '安全雲端規劃',
    cloudHelp: '尚未配對桌面 Agent。AI 只會建立雲端可用的安全草稿，不會虛構裝置、路徑或連線。',
    context: '可信任的執行情境',
    create: '由 AI 建立工作流',
    description:
      '只要幾個字即可。AI 會補上保守預設、驗證 Workflow JSON，並自動儲存草稿；不會直接啟用或執行。',
    device: '執行目標',
    draft: '已驗證的工作流草稿',
    error: 'AI 目前無法建立通過驗證的工作流；沒有儲存或執行任何內容，請稍後再試。',
    googleRequired: '請先連線 Google Workspace，才能建立這個雲端工作流。',
    desktopRequired: '請先配對在線 Desktop Agent 並核准資料夾，才能建立這個工作流。',
    example: '每天整理訂單並建立摘要',
    folderCount: (count: number) => `${count} 個已核准資料夾別名`,
    help: '先輸入短句即可；若想更精準，再補上來源、時間或輸出方式。',
    minLength: '請至少輸入 2 個有意義的字元。',
    modelUsed: '帳戶實際模型',
    noFolders: '沒有本機資料夾權限',
    openWorkflow: '開啟工作流',
    planner: 'AI 自動規劃器',
    provider: '模型提供者',
    planning: 'AI 正在規劃、驗證並儲存…',
    prompt: '想自動處理什麼？',
    retrySave: '規劃已通過驗證，但草稿尚未儲存；請在下方重新儲存。',
    savedHelp: '目前仍未啟用，沒有變更任何檔案、服務或外部資料。',
    targetHelp: '規劃器只能看見畫面所列的 Agent 與資料夾別名；實際路徑仍只保存在桌面 Agent。',
    title: '用幾個字描述想自動化的工作',
    tier: '模型等級',
    useExample: '使用範例',
  },
} as const;

const PlannerApiResponseSchema = z
  .object({
    assistantMessage: z.object({ id: z.string().uuid() }).passthrough(),
    conversationId: z.string().uuid(),
    model: z.string().min(2).max(120),
    output: AIPlannerOutputSchema,
    provider: z.enum(['anthropic', 'gemini', 'mock', 'openai']),
  })
  .passthrough();

interface PlanReference {
  readonly conversationId: string;
  readonly messageId: string;
}

interface PlannedModel {
  readonly model: string;
  readonly provider: 'anthropic' | 'gemini' | 'mock' | 'openai';
}

type DraftStatus =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'failed' }
  | { readonly status: 'saved'; readonly workflowId: string };

export function WorkflowComposer({
  executionTargets,
  platformAdmin,
  tierOptions,
}: Readonly<{
  executionTargets: readonly AssistantExecutionTarget[];
  platformAdmin: boolean;
  tierOptions: readonly AiTierOption[];
}>) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const planningContext = useMemo(
    () => selectWorkflowPlanningContext(executionTargets),
    [executionTargets],
  );
  const [prompt, setPrompt] = useState('');
  const [promptError, setPromptError] = useState<
    'desktop_required' | 'google_required' | 'invalid' | 'unavailable'
  >();
  const [provider, setProvider] = useState<AiProviderSelection>('auto');
  const [tier, setTier] = useState<AiModelTierSelection>('auto');
  const [workflow, setWorkflow] = useState<Workflow>();
  const [plannedModel, setPlannedModel] = useState<PlannedModel>();
  const [planReference, setPlanReference] = useState<PlanReference>();
  const [planning, setPlanning] = useState(false);
  const [draft, setDraft] = useState<DraftStatus>({ status: 'idle' });

  async function saveDraft(reference: PlanReference): Promise<void> {
    setDraft({ status: 'saving' });
    try {
      const response = await fetch('/api/ai/workflow-drafts', {
        body: JSON.stringify(reference),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const parsed = AssistantWorkflowDraftCreateResponseSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) {
        throw new Error('Workflow draft creation failed');
      }
      setDraft({ status: 'saved', workflowId: parsed.data.draft.workflowId });
    } catch {
      setDraft({ status: 'failed' });
    }
  }

  async function createPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestPrompt = prompt.trim();
    setDraft({ status: 'idle' });
    setPlanReference(undefined);
    if (requestPrompt.length < 2) {
      setWorkflow(undefined);
      setPlannedModel(undefined);
      setPromptError('invalid');
      return;
    }
    setPromptError(undefined);
    setPlanning(true);
    try {
      const response = await fetch('/api/ai/plan', {
        body: JSON.stringify({
          context: {
            allowedFolderAliasIds: planningContext.allowedFolderAliasIds,
            executionTarget: planningContext.executionTarget,
            googleConnectionIds: [],
            locale,
            timezone: 'Asia/Taipei',
          },
          maxRepairAttempts: 2,
          prompt: requestPrompt,
          provider,
          tier,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const responseBody = (await response.json()) as unknown;
      if (!response.ok) {
        const error = z
          .object({ error: z.object({ code: z.string() }).passthrough() })
          .safeParse(responseBody);
        if (error.success && error.data.error.code === 'AI_GOOGLE_CONNECTION_REQUIRED') {
          setWorkflow(undefined);
          setPlannedModel(undefined);
          setPromptError('google_required');
          return;
        }
        if (error.success && error.data.error.code === 'AI_DESKTOP_REQUIRED') {
          setWorkflow(undefined);
          setPlannedModel(undefined);
          setPromptError('desktop_required');
          return;
        }
      }
      const parsed = PlannerApiResponseSchema.safeParse(responseBody);
      if (!response.ok || !parsed.success) {
        throw new Error('Invalid planning response');
      }
      const reference = {
        conversationId: parsed.data.conversationId,
        messageId: parsed.data.assistantMessage.id,
      };
      setWorkflow(parsed.data.output.workflow);
      setPlannedModel({ model: parsed.data.model, provider: parsed.data.provider });
      setPlanReference(reference);
      await saveDraft(reference);
    } catch {
      setWorkflow(undefined);
      setPlannedModel(undefined);
      setPromptError('unavailable');
    } finally {
      setPlanning(false);
    }
  }

  const selectedTarget = planningContext.selectedTarget;
  const folderCount = selectedTarget?.folderAliases.length ?? 0;

  return (
    <div>
      <form
        className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
        onSubmit={createPreview}
      >
        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_330px]">
          <div>
            <div className="flex items-center gap-2 text-indigo-700">
              <SparkIcon className="size-4" />
              <p className="text-xs font-bold uppercase tracking-[0.16em]">{text.planner}</p>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
              {text.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{text.description}</p>

            <label
              className="mt-7 block text-sm font-semibold text-slate-900"
              htmlFor="workflow-prompt"
            >
              {text.prompt}
            </label>
            <textarea
              aria-describedby={promptError === undefined ? 'prompt-help' : 'prompt-error'}
              className="mt-2 min-h-36 w-full resize-y rounded-2xl border border-slate-300 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-950 shadow-inner transition placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white"
              id="workflow-prompt"
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={text.example}
              value={prompt}
            />
            {promptError === undefined ? (
              <p className="mt-2 text-xs text-slate-500" id="prompt-help">
                {text.help}
              </p>
            ) : (
              <p className="mt-2 text-xs font-medium text-rose-700" id="prompt-error" role="alert">
                {promptError === 'invalid'
                  ? text.minLength
                  : promptError === 'google_required'
                    ? text.googleRequired
                    : promptError === 'desktop_required'
                      ? text.desktopRequired
                      : text.error}
              </p>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700">
                {text.provider}
                <select
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
                  onChange={(event) => setProvider(event.target.value as AiProviderSelection)}
                  value={provider}
                >
                  <option value="auto">Auto</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Claude</option>
                  <option value="gemini">Gemini</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700">
                {text.tier}
                <select
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
                  onChange={(event) => setTier(event.target.value as AiModelTierSelection)}
                  value={tier}
                >
                  <option value="auto">Auto</option>
                  {tierOptions.map((option) => (
                    <option disabled={!option.enabled} key={option.id} value={option.id}>
                      {option.label[locale === 'zh-Hant' ? 'zhHant' : 'en']} ·{' '}
                      {option.models.map((model) => model.model).join(' / ')}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {platformAdmin ? (
              <p className="mt-2 text-xs font-medium text-emerald-700">
                {locale === 'zh-Hant'
                  ? '平台管理者可使用所有已設定且通過 allowlist 的模型等級。'
                  : 'Platform administrators may use every configured allowlisted model level.'}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60"
                disabled={planning}
                type="submit"
              >
                {planning ? text.planning : text.create}
                <ArrowRightIcon className="size-4" />
              </button>
              <button
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                onClick={() => setPrompt(text.example)}
                type="button"
              >
                {text.useExample}
              </button>
            </div>
          </div>

          <aside className="rounded-2xl bg-slate-950 p-5 text-white">
            <div className="flex items-center gap-2 text-emerald-300">
              <ShieldIcon className="size-4" />
              <p className="text-xs font-bold uppercase tracking-[0.14em]">{text.context}</p>
            </div>
            <div className="mt-5 space-y-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-indigo-400/20 text-indigo-200">
                    <DeviceIcon className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs text-slate-400">{text.device}</p>
                    <p className="mt-0.5 text-sm font-semibold">
                      {selectedTarget?.deviceName ?? text.cloud}
                    </p>
                  </div>
                  <CheckIcon className="ml-auto size-4 text-emerald-300" />
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-emerald-400/15 text-emerald-200">
                    <FolderIcon className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs text-slate-400">{text.alias}</p>
                    <p className="mt-0.5 text-sm font-semibold">
                      {folderCount > 0 ? text.folderCount(folderCount) : text.noFolders}
                    </p>
                  </div>
                  {folderCount > 0 && <CheckIcon className="ml-auto size-4 text-emerald-300" />}
                </div>
              </div>
            </div>
            <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-slate-400">
              {selectedTarget === undefined ? text.cloudHelp : text.targetHelp}
            </p>
          </aside>
        </div>
      </form>

      {workflow !== undefined && (
        <section className="mt-7">
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">
              {text.draft}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
              {workflow.name}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{workflow.description}</p>
            {plannedModel !== undefined ? (
              <p className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-[11px] text-indigo-900">
                <span className="font-semibold">{text.modelUsed}</span>
                <code className="break-all font-mono">
                  {plannedModel.provider} · {plannedModel.model}
                </code>
              </p>
            ) : null}
            {draft.status === 'failed' && (
              <p className="mt-3 text-sm font-medium text-amber-800" role="alert">
                {text.retrySave}
              </p>
            )}
          </div>
          <WorkflowReview
            executionContext={{
              folderAliases: selectedTarget?.folderAliases ?? [],
              targetName: selectedTarget?.deviceName ?? text.cloud,
            }}
            {...(draft.status === 'failed' && planReference !== undefined
              ? { onSaveDraft: () => saveDraft(planReference) }
              : {})}
            savingDraft={draft.status === 'saving'}
            workflow={workflow}
          />
        </section>
      )}

      {draft.status === 'saved' && (
        <div
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-sm text-white shadow-2xl"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-500">
            <CheckIcon className="size-4" />
          </span>
          <div>
            <p className="font-semibold">{text.autoSaved}</p>
            <p className="mt-0.5 text-xs text-slate-400">{text.savedHelp}</p>
            <Link
              className="mt-1 inline-flex text-xs font-semibold text-indigo-300 hover:text-indigo-200"
              href={`/dashboard/workflows/${encodeURIComponent(draft.workflowId)}`}
            >
              {text.openWorkflow} →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
