'use client';

import { AIPlannerOutputSchema, type AIPlannerOutput } from '@ai-workflow-studio/workflow-schema';
import { useMemo, useState, type FormEvent } from 'react';
import { z } from 'zod';

import {
  ArrowRightIcon,
  CheckIcon,
  ChatIcon,
  PlusIcon,
  ShieldIcon,
  SparkIcon,
} from '@/components/icons';
import { useLanguage } from '@/components/language-provider';
import {
  resolveAssistantProvider,
  type AssistantModelId,
  type AssistantModelOption,
} from '@/lib/assistant-models';
import { MOCK_DEVICE_ID, MOCK_FOLDER_ALIAS_ID, NODE_PRESENTATION } from '@/lib/mock-workflows';

const PlannerResponseSchema = z
  .object({
    model: z.string().min(1),
    output: AIPlannerOutputSchema,
    provider: z.enum(['anthropic', 'gemini', 'mock', 'openai']),
  })
  .passthrough();

interface ConversationMessage {
  readonly body: string;
  readonly id: number;
  readonly model?: string;
  readonly role: 'assistant' | 'user';
  readonly title?: string;
}

const copy = {
  en: {
    ask: 'Ask',
    askLater: 'Phase 18',
    assistant: 'AI Workspace',
    attachment: 'Attachments · Phase 19',
    configured: 'Ready',
    currentConversation: 'Current conversation',
    draftOnly: 'Draft only',
    emptyBody:
      'Describe the source, transformation rules, output, and timing. The selected model will only propose validated Workflow JSON.',
    emptyTitle: 'What should we automate?',
    error:
      'A validated plan could not be created. Nothing was saved or executed. Review the request or provider configuration and try again.',
    historyLater: 'Durable conversation history arrives in Phase 18.',
    unavailable: 'Not available',
    localSession: 'This conversation is local to this page',
    model: 'Model',
    newConversation: 'New conversation',
    noProvider:
      'AI planning is not available right now. Please contact the platform administrator.',
    plan: 'Plan',
    planCreated: 'Validated plan created',
    planEmpty: 'The workflow steps will appear here after the model response passes validation.',
    planHeading: 'Execution plan',
    planning: 'Planning safely…',
    placeholder:
      'Example: Every weekday, consolidate Excel orders, remove duplicates, and prepare a report for review.',
    promptHelp: 'Use at least 12 characters. No workflow will run from this screen.',
    promptShort: 'Please describe the request in at least 12 characters.',
    providerRoute: 'Safe route',
    run: 'Run',
    runLater: 'Phase 20',
    safetyBody:
      'The provider can only propose JSON. Schema, DAG, permission, and risk checks run before this page displays a plan.',
    safetyTitle: 'Planning cannot execute tools',
    send: 'Create plan',
    stage: 'Phase 17',
    steps: 'steps',
    title: 'Plan automation in natural language',
    waiting: 'Waiting for a request',
    welcomeBody:
      'Plan mode is ready. Choose Auto, OpenAI, Claude, Gemini, or the development Mock model. Ask and Run will be enabled in later gated phases.',
    welcomeTitle: 'Start with a safe plan',
  },
  'zh-Hant': {
    ask: '詢問',
    askLater: 'Phase 18',
    assistant: 'AI 工作台',
    attachment: '附件 · Phase 19',
    configured: '已就緒',
    currentConversation: '目前對話',
    draftOnly: '僅產生草稿',
    emptyBody: '描述資料來源、處理規則、輸出與時間；所選模型只會提出經驗證的 Workflow JSON。',
    emptyTitle: '想自動化什麼工作？',
    error: '目前無法建立通過驗證的計畫。沒有儲存或執行任何內容，請檢查需求或 Provider 設定後重試。',
    historyLater: '持久化對話紀錄將於 Phase 18 加入。',
    unavailable: '目前未開放',
    localSession: '此對話目前只保留在本頁',
    model: '模型',
    newConversation: '新增對話',
    noProvider: 'AI 規劃目前尚未開放，請聯絡平台管理者。',
    plan: '規劃',
    planCreated: '已建立通過驗證的計畫',
    planEmpty: '模型回應通過驗證後，工作流步驟會顯示在這裡。',
    planHeading: '執行計畫',
    planning: '安全規劃中…',
    placeholder: '例如：每個工作日整合 Excel 訂單、移除重複資料，再產生一份供我檢查的報表。',
    promptHelp: '至少輸入 12 個字；此畫面不會直接執行工作流。',
    promptShort: '請至少用 12 個字完整描述需求。',
    providerRoute: '安全路由',
    run: '執行',
    runLater: 'Phase 20',
    safetyBody: 'Provider 只能提出 JSON；Schema、DAG、權限與風險檢查通過後，本頁才會顯示計畫。',
    safetyTitle: '規劃模式不能執行工具',
    send: '建立計畫',
    stage: 'Phase 17',
    steps: '個步驟',
    title: '用自然語言規劃自動化',
    waiting: '等待輸入需求',
    welcomeBody:
      '規劃模式已可使用。你可以選 Auto、OpenAI、Claude、Gemini，或開發環境的 Mock 模型；詢問與執行會在後續安全階段開放。',
    welcomeTitle: '先從安全計畫開始',
  },
} as const;

function modelLabel(
  model: AssistantModelOption,
  locale: 'en' | 'zh-Hant',
  unavailable: string,
): string {
  const suffix = model.configured ? model.model : unavailable;
  return `${model.label} · ${suffix}`;
}

export function AssistantWorkspace({
  mockMode,
  models,
}: Readonly<{
  mockMode: boolean;
  models: readonly AssistantModelOption[];
}>) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const [selectedModel, setSelectedModel] = useState<AssistantModelId>('auto');
  const [prompt, setPrompt] = useState('');
  const [promptError, setPromptError] = useState<'short' | 'unavailable'>();
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<AIPlannerOutput>();
  const [messages, setMessages] = useState<readonly ConversationMessage[]>([]);
  const resolvedProvider = useMemo(
    () => resolveAssistantProvider(selectedModel, models),
    [models, selectedModel],
  );
  const selectedOption = models.find((model) => model.id === selectedModel) ?? models[0];

  function resetConversation(): void {
    setMessages([]);
    setPlan(undefined);
    setPrompt('');
    setPromptError(undefined);
  }

  async function createPlan(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const requestPrompt = prompt.trim();
    if (requestPrompt.length < 12) {
      setPromptError('short');
      return;
    }
    if (resolvedProvider === undefined) {
      setPromptError('unavailable');
      return;
    }

    const userMessage: ConversationMessage = {
      body: requestPrompt,
      id: Date.now(),
      role: 'user',
    };
    setMessages((current) => [...current, userMessage]);
    setPrompt('');
    setPromptError(undefined);
    setPlanning(true);

    try {
      const response = await fetch('/api/ai/plan', {
        body: JSON.stringify({
          context: {
            allowedFolderAliasIds: mockMode ? [MOCK_FOLDER_ALIAS_ID] : [],
            executionTarget: mockMode
              ? { deviceId: MOCK_DEVICE_ID, type: 'desktop' }
              : { type: 'cloud' },
            locale,
            timezone: 'Asia/Taipei',
          },
          maxRepairAttempts: 1,
          prompt: requestPrompt,
          provider: resolvedProvider,
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });
      const parsed = PlannerResponseSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) {
        throw new Error('Invalid planning response');
      }

      setPlan(parsed.data.output);
      setMessages((current) => [
        ...current,
        {
          body: parsed.data.output.explanation,
          id: Date.now() + 1,
          model: `${parsed.data.provider} · ${parsed.data.model}`,
          role: 'assistant',
          title: parsed.data.output.workflow.name,
        },
      ]);
    } catch {
      setPlan(undefined);
      setPromptError('unavailable');
      setMessages((current) => [
        ...current,
        {
          body: text.error,
          id: Date.now() + 1,
          role: 'assistant',
        },
      ]);
    } finally {
      setPlanning(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px]">
      <header className="mb-5">
        <div>
          <div className="flex items-center gap-2 text-indigo-600">
            <SparkIcon className="size-4" />
            <p className="text-xs font-bold uppercase tracking-[0.18em]">
              {text.assistant} · {text.stage}
            </p>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
            {text.title}
          </h1>
        </div>
      </header>

      <div className="assistant-workspace-grid grid min-h-[700px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <aside className="border-b border-slate-200 bg-slate-950 p-4 text-white">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
            onClick={resetConversation}
            type="button"
          >
            <PlusIcon className="size-4" />
            {text.newConversation}
          </button>
          <div className="mt-5">
            <p className="px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              {text.currentConversation}
            </p>
            <button
              aria-current="page"
              className="mt-2 flex w-full items-start gap-3 rounded-xl bg-white/10 px-3 py-3 text-left"
              type="button"
            >
              <ChatIcon className="mt-0.5 size-4 shrink-0 text-indigo-300" />
              <span>
                <span className="block text-xs font-semibold text-white">
                  {plan?.workflow.name ?? text.waiting}
                </span>
                <span className="mt-1 block text-[10px] leading-4 text-slate-400">
                  {text.localSession}
                </span>
              </span>
            </button>
          </div>
          <p className="mt-6 border-t border-white/10 px-2 pt-4 text-[10px] leading-4 text-slate-500">
            {text.historyLater}
          </p>
        </aside>

        <section className="flex min-h-[620px] min-w-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold text-slate-700">{text.draftOnly}</span>
            </div>
            <label className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
              <span className="hidden sm:inline">{text.model}</span>
              <select
                aria-label={text.model}
                className="max-w-[260px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800"
                onChange={(event) => {
                  setSelectedModel(event.target.value as AssistantModelId);
                  setPromptError(undefined);
                }}
                value={selectedModel}
              >
                {models.map((model) => (
                  <option disabled={!model.configured} key={model.id} value={model.id}>
                    {modelLabel(model, locale, text.unavailable)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-8">
            {messages.length === 0 && (
              <div className="mx-auto mt-10 max-w-xl text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
                  <SparkIcon className="size-5" />
                </span>
                <h2 className="mt-4 text-xl font-semibold text-slate-950">{text.emptyTitle}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">{text.emptyBody}</p>
                <div className="mt-6 grid gap-2 text-left sm:grid-cols-2">
                  {models
                    .filter((model) => model.id !== 'auto' && model.id !== 'mock')
                    .map((model) => (
                      <div
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
                        key={model.id}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-900">{model.label}</p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                              model.configured
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-200 text-slate-500'
                            }`}
                          >
                            {model.configured ? text.configured : text.unavailable}
                          </span>
                        </div>
                        <p className="mt-1 font-mono text-[10px] text-slate-500">{model.model}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <article
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                key={message.id}
              >
                {message.role === 'assistant' && (
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
                    <SparkIcon className="size-4" />
                  </span>
                )}
                <div
                  className={`max-w-2xl rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  {message.title !== undefined && (
                    <p className="mb-1 text-sm font-semibold text-slate-950">{message.title}</p>
                  )}
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                  {message.role === 'assistant' && message.model !== undefined && (
                    <p className="mt-2 font-mono text-[10px] text-slate-400">{message.model}</p>
                  )}
                </div>
              </article>
            ))}

            {planning && (
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <span className="size-2 animate-pulse rounded-full bg-indigo-500" />
                {text.planning}
              </div>
            )}
          </div>

          <form className="border-t border-slate-100 p-4 sm:p-5" onSubmit={createPlan}>
            {resolvedProvider === undefined && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                {text.noProvider}
              </div>
            )}
            <div className="rounded-2xl border border-slate-300 bg-white p-3 shadow-sm focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-50">
              <textarea
                aria-describedby="assistant-prompt-help"
                aria-label={text.title}
                className="min-h-24 w-full resize-none border-0 bg-transparent px-1 text-sm leading-6 text-slate-950 outline-none placeholder:text-slate-400"
                onChange={(event) => {
                  setPrompt(event.target.value);
                  setPromptError(undefined);
                }}
                placeholder={text.placeholder}
                value={prompt}
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2">
                  <button
                    className="cursor-not-allowed rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-400"
                    disabled
                    type="button"
                  >
                    + {text.attachment}
                  </button>
                  <span className="hidden text-[10px] text-slate-400 sm:inline">
                    {locale === 'en'
                      ? selectedOption?.description.en
                      : selectedOption?.description.zhHant}
                  </span>
                </div>
                <button
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={planning || resolvedProvider === undefined}
                  type="submit"
                >
                  {planning ? text.planning : text.send}
                  <ArrowRightIcon className="size-3.5" />
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p
                className={`text-[10px] ${
                  promptError === undefined ? 'text-slate-400' : 'font-semibold text-rose-700'
                }`}
                id="assistant-prompt-help"
                role={promptError === undefined ? undefined : 'alert'}
              >
                {promptError === 'short'
                  ? text.promptShort
                  : promptError === 'unavailable'
                    ? text.error
                    : text.promptHelp}
              </p>
              <div aria-label="Assistant mode" className="flex items-center gap-1" role="group">
                <button
                  className="cursor-not-allowed rounded-lg px-2 py-1 text-[10px] font-semibold text-slate-400"
                  disabled
                  type="button"
                >
                  {text.ask} · {text.askLater}
                </button>
                <button
                  aria-pressed="true"
                  className="rounded-lg bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700"
                  type="button"
                >
                  {text.plan}
                </button>
                <button
                  className="cursor-not-allowed rounded-lg px-2 py-1 text-[10px] font-semibold text-slate-400"
                  disabled
                  type="button"
                >
                  {text.run} · {text.runLater}
                </button>
              </div>
            </div>
          </form>
        </section>

        <aside className="border-t border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600">
                {text.planHeading}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-950">
                {plan?.workflow.name ?? text.waiting}
              </h2>
            </div>
            {plan !== undefined && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800">
                {plan.workflow.nodes.length} {text.steps}
              </span>
            )}
          </div>

          {plan === undefined ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center">
              <ChatIcon className="mx-auto size-5 text-slate-300" />
              <p className="mt-3 text-xs leading-5 text-slate-500">{text.planEmpty}</p>
            </div>
          ) : (
            <div className="mt-5 space-y-2">
              {plan.workflow.nodes.map((node, index) => {
                const presentation = NODE_PRESENTATION[node.type];
                return (
                  <div
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
                    key={node.id}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-[10px] font-bold text-indigo-700">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900">
                        {locale === 'en' ? presentation.label.en : presentation.label.zhHant}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[9px] text-slate-400">
                        {node.type}
                      </p>
                    </div>
                    <CheckIcon className="ml-auto size-3.5 shrink-0 text-emerald-600" />
                  </div>
                );
              })}
            </div>
          )}

          <section className="mt-5 rounded-2xl bg-slate-950 p-4 text-white">
            <div className="flex items-center gap-2 text-emerald-300">
              <ShieldIcon className="size-4" />
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]">
                {text.safetyTitle}
              </p>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">{text.safetyBody}</p>
          </section>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px]">
            <span className="text-slate-500">{text.providerRoute}</span>
            <span className="font-semibold text-slate-800">
              {resolvedProvider ?? text.unavailable}
            </span>
          </div>

          {plan !== undefined && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
              <div className="flex items-center gap-2 text-emerald-800">
                <CheckIcon className="size-4" />
                <p className="text-xs font-semibold">{text.planCreated}</p>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-emerald-700">
                {text.draftOnly} · {text.safetyTitle}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
