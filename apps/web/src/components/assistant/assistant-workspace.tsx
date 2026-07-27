'use client';

import { AIPlannerOutputSchema, type AIPlannerOutput } from '@ai-workflow-studio/workflow-schema';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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
  AssistantChatStreamEventSchema,
  AssistantConversationListResponseSchema,
  AssistantConversationResponseSchema,
  AssistantConversationMessageSchema,
  type AssistantConversationMessage,
  type AssistantConversationMode,
  type AssistantConversationSummary,
} from '@/lib/assistant-conversation-schema';
import {
  resolveAssistantProvider,
  type AssistantModelId,
  type AssistantModelOption,
} from '@/lib/assistant-models';
import { MOCK_DEVICE_ID, MOCK_FOLDER_ALIAS_ID, NODE_PRESENTATION } from '@/lib/mock-workflows';

const PlannerResponseSchema = z
  .object({
    assistantMessage: AssistantConversationMessageSchema,
    conversationId: z.string().uuid(),
    model: z.string().min(1),
    output: AIPlannerOutputSchema,
    provider: z.enum(['anthropic', 'gemini', 'mock', 'openai']),
    userMessage: AssistantConversationMessageSchema,
  })
  .passthrough();

const copy = {
  en: {
    ask: 'Ask',
    askBody:
      'Ask mode streams an explanation and saves the conversation. It cannot call tools or perform actions.',
    assistant: 'AI Workspace',
    attachment: 'Attachments · Phase 19',
    cancelled: 'Generation stopped. The partial response was kept for audit.',
    configured: 'Ready',
    conversations: 'Conversations',
    draftOnly: 'Read-only AI',
    emptyAsk: 'Ask a question, refine an idea, or explore a safe automation approach.',
    emptyPlan:
      'Describe the source, transformation rules, output, and timing. The model can only propose validated Workflow JSON.',
    emptyTitle: 'What would you like to work on?',
    error: 'The assistant response could not be completed. Nothing was executed.',
    historyReady: 'Messages are saved to this workspace and isolated by Tenant.',
    loadingHistory: 'Loading conversations…',
    model: 'Model',
    newConversation: 'New conversation',
    noProvider: 'AI is unavailable. Please contact the platform administrator.',
    noSaved: 'No saved conversations yet',
    plan: 'Plan',
    planCreated: 'Validated plan created',
    planEmpty: 'A validated Workflow plan will appear here in Plan mode.',
    planHeading: 'Plan review',
    placeholderAsk:
      'Ask how to design a safe workflow, compare approaches, or clarify requirements…',
    placeholderPlan:
      'Example: Every weekday, consolidate Excel orders, remove duplicates, and prepare a report for review.',
    promptHelpAsk: 'Ask mode saves the conversation but never runs tools.',
    promptHelpPlan: 'Use at least 12 characters. The plan remains a draft.',
    promptShortAsk: 'Please enter at least 2 characters.',
    promptShortPlan: 'Please describe the plan in at least 12 characters.',
    run: 'Run',
    runLater: 'Phase 20',
    safetyBody:
      'Provider keys remain server-only. Context is bounded, usage is recorded, and no tool contract is available in this phase.',
    safetyTitle: 'Streaming without tool authority',
    sendAsk: 'Send',
    sendPlan: 'Create plan',
    stage: 'Phase 18',
    steps: 'steps',
    stop: 'Stop generating',
    streaming: 'Generating…',
    title: 'Discuss, refine, and plan with AI',
    unavailable: 'Not available',
    waiting: 'New conversation',
  },
  'zh-Hant': {
    ask: '詢問',
    askBody: '詢問模式會串流說明並保存對話，但不能呼叫工具或執行任何動作。',
    assistant: 'AI 工作台',
    attachment: '附件 · Phase 19',
    cancelled: '已停止產生；部分回應會保留以供稽核。',
    configured: '已就緒',
    conversations: '對話紀錄',
    draftOnly: '唯讀 AI',
    emptyAsk: '提出問題、釐清想法，或一起探索安全的自動化做法。',
    emptyPlan: '描述資料來源、處理規則、輸出與時間；模型只能提出經驗證的 Workflow JSON。',
    emptyTitle: '今天想一起處理什麼？',
    error: '助理回應未能完成；沒有執行任何動作。',
    historyReady: '訊息會保存於此工作區，並依 Tenant 隔離。',
    loadingHistory: '載入對話中…',
    model: '模型',
    newConversation: '新增對話',
    noProvider: 'AI 目前尚未開放，請聯絡平台管理者。',
    noSaved: '目前沒有已保存的對話',
    plan: '規劃',
    planCreated: '已建立通過驗證的計畫',
    planEmpty: '切換到規劃模式後，通過驗證的 Workflow 計畫會顯示在這裡。',
    planHeading: '計畫檢視',
    placeholderAsk: '詢問如何設計安全工作流、比較做法，或協助釐清需求⋯',
    placeholderPlan: '例如：每個工作日整合 Excel 訂單、移除重複資料，再產生一份供我檢查的報表。',
    promptHelpAsk: '詢問模式會保存對話，但絕不執行工具。',
    promptHelpPlan: '至少輸入 12 個字；產生的計畫仍是草稿。',
    promptShortAsk: '請至少輸入 2 個字。',
    promptShortPlan: '請至少用 12 個字完整描述規劃需求。',
    run: '執行',
    runLater: 'Phase 20',
    safetyBody: 'Provider 金鑰只在伺服器；對話內容有上限、用量會記錄，本階段沒有任何工具權限。',
    safetyTitle: '可串流，但沒有工具權限',
    sendAsk: '送出',
    sendPlan: '建立計畫',
    stage: 'Phase 18',
    steps: '個步驟',
    stop: '停止產生',
    streaming: '產生中⋯',
    title: '與 AI 對話、釐清並規劃工作',
    unavailable: '目前未開放',
    waiting: '新增對話',
  },
} as const;

function modelLabel(model: AssistantModelOption, unavailable: string): string {
  return `${model.label} · ${model.configured ? model.model : unavailable}`;
}

function optimisticMessage(body: string): AssistantConversationMessage {
  return {
    body,
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    role: 'user',
    status: 'completed',
  };
}

function parseSseBlocks(buffer: string): {
  readonly events: readonly unknown[];
  readonly remainder: string;
} {
  const blocks = buffer.split(/\r?\n\r?\n/);
  const remainder = blocks.pop() ?? '';
  const events: unknown[] = [];
  for (const block of blocks) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (data.length > 0) {
      events.push(JSON.parse(data) as unknown);
    }
  }
  return { events, remainder };
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
  const [mode, setMode] = useState<AssistantConversationMode>('ask');
  const [prompt, setPrompt] = useState('');
  const [promptError, setPromptError] = useState<'short' | 'unavailable'>();
  const [pending, setPending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [streamingBody, setStreamingBody] = useState('');
  const [plan, setPlan] = useState<AIPlannerOutput>();
  const [conversationId, setConversationId] = useState<string>();
  const [conversations, setConversations] = useState<readonly AssistantConversationSummary[]>([]);
  const [messages, setMessages] = useState<readonly AssistantConversationMessage[]>([]);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const cancelledRef = useRef(false);
  const streamingBodyRef = useRef('');
  const resolvedProvider = useMemo(
    () => resolveAssistantProvider(selectedModel, models),
    [models, selectedModel],
  );
  const selectedOption = models.find((model) => model.id === selectedModel) ?? models[0];

  async function refreshConversations(): Promise<void> {
    try {
      const response = await fetch('/api/ai/conversations', { cache: 'no-store' });
      const parsed = AssistantConversationListResponseSchema.safeParse(await response.json());
      if (response.ok && parsed.success) {
        setConversations(parsed.data.conversations);
      }
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    void refreshConversations();
  }, []);

  function resetConversation(): void {
    if (pending) {
      return;
    }
    setConversationId(undefined);
    setMessages([]);
    setPlan(undefined);
    setPrompt('');
    setPromptError(undefined);
    setStreamingBody('');
    streamingBodyRef.current = '';
  }

  async function openConversation(id: string): Promise<void> {
    if (pending) {
      return;
    }
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}`, {
        cache: 'no-store',
      });
      const parsed = AssistantConversationResponseSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) {
        throw new Error('Invalid conversation response');
      }
      setConversationId(parsed.data.conversation.id);
      setMessages(parsed.data.conversation.messages);
      setMode(parsed.data.conversation.mode);
      setSelectedModel(parsed.data.conversation.provider);
      setPlan(
        [...parsed.data.conversation.messages]
          .reverse()
          .find((message) => message.plan !== undefined)?.plan,
      );
      setPromptError(undefined);
      setStreamingBody('');
      streamingBodyRef.current = '';
    } catch {
      setPromptError('unavailable');
    } finally {
      setLoadingHistory(false);
    }
  }

  function replaceOptimisticUser(
    optimisticId: string,
    userMessage: AssistantConversationMessage,
  ): void {
    setMessages((current) =>
      current.map((message) => (message.id === optimisticId ? userMessage : message)),
    );
  }

  async function sendAsk(
    requestPrompt: string,
    optimisticUser: AssistantConversationMessage,
  ): Promise<void> {
    if (resolvedProvider === undefined) {
      throw new Error('No provider');
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const response = await fetch('/api/ai/chat', {
      body: JSON.stringify({
        ...(conversationId === undefined ? {} : { conversationId }),
        locale,
        message: requestPrompt,
        provider: resolvedProvider,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal: controller.signal,
    });
    if (!response.ok || response.body === null) {
      throw new Error('Chat request failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let partial = '';
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        buffer += decoder.decode();
      } else {
        buffer += decoder.decode(chunk.value, { stream: true });
      }
      if (chunk.done && buffer.trim().length > 0) {
        buffer += '\n\n';
      }
      const parsedBlocks = parseSseBlocks(buffer);
      buffer = parsedBlocks.remainder;

      for (const raw of parsedBlocks.events) {
        const event = AssistantChatStreamEventSchema.safeParse(raw);
        if (!event.success) {
          throw new Error('Invalid stream event');
        }
        if (event.data.type === 'meta') {
          setConversationId(event.data.conversationId);
          replaceOptimisticUser(optimisticUser.id, event.data.userMessage);
        } else if (event.data.type === 'delta') {
          partial += event.data.text;
          streamingBodyRef.current = partial;
          setStreamingBody(partial);
        } else if (event.data.type === 'done') {
          const assistantMessage = event.data.message;
          streamingBodyRef.current = '';
          setStreamingBody('');
          setMessages((current) => [...current, assistantMessage]);
        } else {
          const partialMessage = event.data.partialMessage;
          streamingBodyRef.current = '';
          setStreamingBody('');
          if (partialMessage !== undefined) {
            setMessages((current) => [...current, partialMessage]);
          }
          setPromptError('unavailable');
        }
      }
      if (chunk.done) {
        break;
      }
    }
  }

  async function sendPlan(
    requestPrompt: string,
    optimisticUser: AssistantConversationMessage,
  ): Promise<void> {
    if (resolvedProvider === undefined) {
      throw new Error('No provider');
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const response = await fetch('/api/ai/plan', {
      body: JSON.stringify({
        ...(conversationId === undefined ? {} : { conversationId }),
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
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal: controller.signal,
    });
    const parsed = PlannerResponseSchema.safeParse(await response.json());
    if (!response.ok || !parsed.success) {
      throw new Error('Invalid planning response');
    }
    setConversationId(parsed.data.conversationId);
    replaceOptimisticUser(optimisticUser.id, parsed.data.userMessage);
    setMessages((current) => [...current, parsed.data.assistantMessage]);
    setPlan(parsed.data.output);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const requestPrompt = prompt.trim();
    const minimum = mode === 'ask' ? 2 : 12;
    if (requestPrompt.length < minimum) {
      setPromptError('short');
      return;
    }
    if (resolvedProvider === undefined) {
      setPromptError('unavailable');
      return;
    }

    const optimisticUser = optimisticMessage(requestPrompt);
    setMessages((current) => [...current, optimisticUser]);
    setPrompt('');
    setPromptError(undefined);
    setPending(true);
    setStreamingBody('');
    streamingBodyRef.current = '';
    cancelledRef.current = false;

    try {
      if (mode === 'ask') {
        await sendAsk(requestPrompt, optimisticUser);
      } else {
        await sendPlan(requestPrompt, optimisticUser);
      }
      await refreshConversations();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        cancelledRef.current = true;
        if (streamingBodyRef.current.trim().length > 0) {
          setMessages((current) => [
            ...current,
            {
              body: streamingBodyRef.current,
              createdAt: new Date().toISOString(),
              id: crypto.randomUUID(),
              model: selectedOption?.model,
              provider: resolvedProvider,
              role: 'assistant',
              status: 'cancelled',
            },
          ]);
        }
      } else {
        setPromptError('unavailable');
      }
    } finally {
      abortRef.current = undefined;
      setStreamingBody('');
      streamingBodyRef.current = '';
      setPending(false);
    }
  }

  function stopGenerating(): void {
    cancelledRef.current = true;
    abortRef.current?.abort();
  }

  const currentTitle =
    conversations.find((conversation) => conversation.id === conversationId)?.title ??
    messages.find((message) => message.role === 'user')?.body ??
    text.waiting;

  return (
    <div className="mx-auto max-w-[1600px]">
      <header className="mb-5">
        <div className="flex items-center gap-2 text-indigo-600">
          <SparkIcon className="size-4" />
          <p className="text-xs font-bold uppercase tracking-[0.18em]">
            {text.assistant} · {text.stage}
          </p>
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
          {text.title}
        </h1>
      </header>

      <div className="assistant-workspace-grid grid min-h-[700px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <aside className="border-b border-slate-200 bg-slate-950 p-4 text-white">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:opacity-50"
            disabled={pending}
            onClick={resetConversation}
            type="button"
          >
            <PlusIcon className="size-4" />
            {text.newConversation}
          </button>
          <div className="mt-5">
            <p className="px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              {text.conversations}
            </p>
            {loadingHistory && conversations.length === 0 ? (
              <p className="px-2 py-4 text-xs text-slate-500">{text.loadingHistory}</p>
            ) : conversations.length === 0 ? (
              <p className="px-2 py-4 text-xs text-slate-500">{text.noSaved}</p>
            ) : (
              <div className="mt-2 space-y-1">
                {conversations.slice(0, 12).map((conversation) => (
                  <button
                    aria-current={conversation.id === conversationId ? 'page' : undefined}
                    className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition ${
                      conversation.id === conversationId ? 'bg-white/12' : 'hover:bg-white/7'
                    }`}
                    disabled={pending}
                    key={conversation.id}
                    onClick={() => void openConversation(conversation.id)}
                    type="button"
                  >
                    <ChatIcon className="mt-0.5 size-4 shrink-0 text-indigo-300" />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-white">
                        {conversation.title}
                      </span>
                      <span className="mt-1 block text-[10px] text-slate-500">
                        {conversation.mode === 'ask' ? text.ask : text.plan} ·{' '}
                        {conversation.provider}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="mt-6 border-t border-white/10 px-2 pt-4 text-[10px] leading-4 text-slate-500">
            {text.historyReady}
          </p>
        </aside>

        <section className="flex min-h-[620px] min-w-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold text-slate-700">{text.draftOnly}</span>
              </div>
              <p className="mt-1 max-w-sm truncate text-[10px] text-slate-400">{currentTitle}</p>
            </div>
            <label className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
              <span className="hidden sm:inline">{text.model}</span>
              <select
                aria-label={text.model}
                className="max-w-[260px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800"
                disabled={pending}
                onChange={(event) => {
                  setSelectedModel(event.target.value as AssistantModelId);
                  setPromptError(undefined);
                }}
                value={selectedModel}
              >
                {models.map((model) => (
                  <option disabled={!model.configured} key={model.id} value={model.id}>
                    {modelLabel(model, text.unavailable)}
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
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {mode === 'ask' ? text.emptyAsk : text.emptyPlan}
                </p>
                <div className="mt-6 grid gap-2 text-left sm:grid-cols-3">
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
                        <p className="mt-1 truncate font-mono text-[10px] text-slate-500">
                          {model.model}
                        </p>
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
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                  {message.role === 'assistant' && (
                    <p className="mt-2 font-mono text-[10px] text-slate-400">
                      {message.provider} · {message.model} · {message.status}
                    </p>
                  )}
                </div>
              </article>
            ))}

            {streamingBody.length > 0 && (
              <article className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
                  <SparkIcon className="size-4" />
                </span>
                <div className="max-w-2xl rounded-2xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-slate-700">
                  <p className="whitespace-pre-wrap text-sm leading-6">{streamingBody}</p>
                  <p className="mt-2 text-[10px] text-indigo-500">{text.streaming}</p>
                </div>
              </article>
            )}
            {pending && streamingBody.length === 0 && (
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <span className="size-2 animate-pulse rounded-full bg-indigo-500" />
                {text.streaming}
              </div>
            )}
          </div>

          <form className="border-t border-slate-100 p-4 sm:p-5" onSubmit={submit}>
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
                disabled={pending}
                onChange={(event) => {
                  setPrompt(event.target.value);
                  setPromptError(undefined);
                }}
                placeholder={mode === 'ask' ? text.placeholderAsk : text.placeholderPlan}
                value={prompt}
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <button
                  className="cursor-not-allowed rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-400"
                  disabled
                  type="button"
                >
                  + {text.attachment}
                </button>
                {pending ? (
                  <button
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                    onClick={stopGenerating}
                    type="button"
                  >
                    <span className="size-2 rounded-sm bg-current" />
                    {text.stop}
                  </button>
                ) : (
                  <button
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    disabled={resolvedProvider === undefined}
                    type="submit"
                  >
                    {mode === 'ask' ? text.sendAsk : text.sendPlan}
                    <ArrowRightIcon className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p
                className={`text-[10px] ${
                  promptError === undefined && !cancelledRef.current
                    ? 'text-slate-400'
                    : 'font-semibold text-rose-700'
                }`}
                id="assistant-prompt-help"
                role={promptError === undefined ? undefined : 'alert'}
              >
                {cancelledRef.current
                  ? text.cancelled
                  : promptError === 'short'
                    ? mode === 'ask'
                      ? text.promptShortAsk
                      : text.promptShortPlan
                    : promptError === 'unavailable'
                      ? text.error
                      : mode === 'ask'
                        ? text.promptHelpAsk
                        : text.promptHelpPlan}
              </p>
              <div aria-label="Assistant mode" className="flex items-center gap-1" role="group">
                <button
                  aria-pressed={mode === 'ask'}
                  className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${
                    mode === 'ask'
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                  disabled={pending}
                  onClick={() => {
                    setMode('ask');
                    setPromptError(undefined);
                  }}
                  type="button"
                >
                  {text.ask}
                </button>
                <button
                  aria-pressed={mode === 'plan'}
                  className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${
                    mode === 'plan'
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                  disabled={pending}
                  onClick={() => {
                    setMode('plan');
                    setPromptError(undefined);
                  }}
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
                {plan?.workflow.name ?? (mode === 'ask' ? text.ask : text.waiting)}
              </h2>
            </div>
            {plan !== undefined && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800">
                {plan.workflow.nodes.length} {text.steps}
              </span>
            )}
          </div>

          {plan === undefined ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-5">
              <ShieldIcon className="size-5 text-indigo-600" />
              <h3 className="mt-3 text-sm font-semibold text-slate-950">
                {mode === 'ask' ? text.safetyTitle : text.planEmpty}
              </h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {mode === 'ask' ? text.askBody : text.safetyBody}
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900">
                  <CheckIcon className="size-4" />
                  {text.planCreated}
                </div>
                <p className="mt-2 text-xs leading-5 text-emerald-800">{plan.explanation}</p>
              </div>
              {plan.workflow.nodes.map((node, index) => {
                const presentation = NODE_PRESENTATION[node.type];
                return (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4" key={node.id}>
                    <div className="flex items-start gap-3">
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-950 text-[10px] font-bold text-white">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-950">
                          {locale === 'en' ? presentation.label.en : presentation.label.zhHant}
                        </p>
                        <p className="mt-1 font-mono text-[9px] text-slate-400">{node.id}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="rounded-2xl bg-slate-950 p-4 text-white">
                <div className="flex items-center gap-2">
                  <ShieldIcon className="size-4 text-emerald-300" />
                  <p className="text-xs font-semibold">{text.safetyTitle}</p>
                </div>
                <p className="mt-2 text-[10px] leading-5 text-slate-400">{text.safetyBody}</p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
