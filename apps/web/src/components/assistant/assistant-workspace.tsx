'use client';

import { AIPlannerOutputSchema, type AIPlannerOutput } from '@ai-workflow-studio/workflow-schema';
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
} from '@ai-workflow-studio/tool-registry';
import type { WorkflowRunView } from '@ai-workflow-studio/run-orchestrator';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
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
  AssistantConversationSummarySchema,
  type AssistantConversationMessage,
  type AssistantConversationMode,
  type AssistantConversationSummary,
} from '@/lib/assistant-conversation-schema';
import {
  AssistantWorkflowDraftCreateResponseSchema,
  AssistantWorkflowRunCreateResponseSchema,
  type AssistantWorkflowDraftSummary,
} from '@/lib/assistant-execution-schema';
import {
  resolveAssistantProvider,
  type AssistantModelId,
  type AssistantModelOption,
} from '@/lib/assistant-models';
import {
  AssistantArtifactSummarySchema,
  AssistantAttachmentSummarySchema,
  AssistantResourcesResponseSchema,
  type AssistantArtifactSummary,
  type AssistantAttachmentSummary,
} from '@/lib/assistant-resource-schema';
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

const ConversationCreateResponseSchema = z
  .object({ conversation: AssistantConversationSummarySchema })
  .strict();
const AttachmentUploadResponseSchema = z
  .object({ attachment: AssistantAttachmentSummarySchema })
  .strict();
const ArtifactCreateResponseSchema = z
  .object({ artifact: AssistantArtifactSummarySchema })
  .strict();

const copy = {
  en: {
    ask: 'Ask',
    askBody:
      'Ask mode streams an explanation, saves the conversation, and may read only the sources you explicitly select. It cannot run workflow actions.',
    assistant: 'AI Workspace',
    artifact: 'Create Markdown',
    artifactCreated: 'Markdown artifact created',
    artifacts: 'Artifacts',
    attachment: 'Add source',
    attachmentHelp: '.txt, .md, .csv, or .json · up to 64 KB',
    attachmentLimit: 'Select up to 5 sources for one message.',
    attachmentTooLarge: 'The source must be 64 KB or smaller.',
    cancelled: 'Generation stopped. The partial response was kept for audit.',
    configured: 'Ready',
    conversations: 'Conversations',
    draftOnly: 'Read-only AI',
    emptyAsk: 'Ask a question, refine an idea, or explore a safe automation approach.',
    emptyPlan:
      'Describe the source, transformation rules, output, and timing. The model can only propose validated Workflow JSON.',
    emptyTitle: 'What would you like to work on?',
    error: 'The assistant response could not be completed. Nothing was executed.',
    executionApproval: 'Approval required before Desktop dispatch',
    executionDraft: 'Create reviewed draft',
    executionDraftReady: 'Reviewed Workflow v1 draft',
    executionError: 'The execution request could not be prepared. No new Job was dispatched.',
    executionReviewHelp:
      'Step 1 creates an immutable draft only. Step 2 creates a run; write or destructive risk still requires a separate approval.',
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
    promptHelpAsk: 'Ask mode can read selected sources but never runs workflow actions.',
    promptHelpPlan: 'Use at least 12 characters. The plan remains a draft.',
    promptShortAsk: 'Please enter at least 2 characters.',
    promptShortPlan: 'Please describe the plan in at least 12 characters.',
    requestRun: 'Create run request',
    run: 'Run',
    runOpen: 'Open run details',
    runQueued: 'Desktop Job queued',
    runReview: 'Review execution',
    safetyBody:
      'Ask and Plan stay read-only. Only an explicit run request can enter approval, and only validated nodes are dispatched after every required approval.',
    safetyTitle: 'Review, request, approve',
    sendAsk: 'Send',
    sendPlan: 'Create plan',
    sources: 'Sources',
    stage: 'Phase 20',
    steps: 'steps',
    stop: 'Stop generating',
    streaming: 'Generating…',
    title: 'Discuss, refine, and plan with AI',
    unavailable: 'Not available',
    waiting: 'New conversation',
  },
  'zh-Hant': {
    ask: '詢問',
    askBody: '詢問模式會串流說明並保存對話，只能讀取你明確選取的來源，不能執行工作流動作。',
    artifact: '建立 Markdown',
    artifactCreated: '已建立 Markdown 產出',
    artifacts: '產出檔案',
    assistant: 'AI 工作台',
    attachment: '加入來源',
    attachmentHelp: '.txt、.md、.csv 或 .json，最多 64 KB',
    attachmentLimit: '每則訊息最多選取 5 個來源。',
    attachmentTooLarge: '來源檔案必須小於或等於 64 KB。',
    cancelled: '已停止產生；部分回應會保留以供稽核。',
    configured: '已就緒',
    conversations: '對話紀錄',
    draftOnly: '唯讀 AI',
    emptyAsk: '提出問題、釐清想法，或一起探索安全的自動化做法。',
    emptyPlan: '描述資料來源、處理規則、輸出與時間；模型只能提出經驗證的 Workflow JSON。',
    emptyTitle: '今天想一起處理什麼？',
    error: '助理回應未能完成；沒有執行任何動作。',
    executionApproval: '等待核准後才會派送至 Desktop Agent',
    executionDraft: '建立審閱草稿',
    executionDraftReady: '已審閱的 Workflow v1 草稿',
    executionError: '無法準備執行要求；沒有派送新的 Job。',
    executionReviewHelp:
      '第 1 步只建立不可變更的草稿；第 2 步建立 Run。只要有寫入或破壞性風險，仍需另一次明確核准。',
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
    promptHelpAsk: '詢問模式可讀取已選來源，但絕不執行工作流動作。',
    promptHelpPlan: '至少輸入 12 個字；產生的計畫仍是草稿。',
    promptShortAsk: '請至少輸入 2 個字。',
    promptShortPlan: '請至少用 12 個字完整描述規劃需求。',
    requestRun: '建立執行要求',
    run: '執行',
    runOpen: '開啟執行詳情',
    runQueued: '已排入 Desktop Job',
    runReview: '檢視執行',
    safetyBody:
      '詢問與規劃保持唯讀。只有你明確建立執行要求，並通過所有必要核准後，才會派送已驗證的節點。',
    safetyTitle: '審閱、要求、核准三段式',
    sendAsk: '送出',
    sendPlan: '建立計畫',
    sources: '參考來源',
    stage: 'Phase 20',
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
  const [planMessageId, setPlanMessageId] = useState<string>();
  const [executionDraft, setExecutionDraft] = useState<AssistantWorkflowDraftSummary>();
  const [executionRun, setExecutionRun] = useState<WorkflowRunView>();
  const [executionWorking, setExecutionWorking] = useState(false);
  const [executionStatus, setExecutionStatus] = useState<'error' | 'ready'>();
  const [conversationId, setConversationId] = useState<string>();
  const [conversations, setConversations] = useState<readonly AssistantConversationSummary[]>([]);
  const [messages, setMessages] = useState<readonly AssistantConversationMessage[]>([]);
  const [attachments, setAttachments] = useState<readonly AssistantAttachmentSummary[]>([]);
  const [artifacts, setArtifacts] = useState<readonly AssistantArtifactSummary[]>([]);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<readonly string[]>([]);
  const [resourceStatus, setResourceStatus] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  async function refreshResources(id: string): Promise<void> {
    const response = await fetch(`/api/ai/resources?conversationId=${encodeURIComponent(id)}`, {
      cache: 'no-store',
    });
    const parsed = AssistantResourcesResponseSchema.safeParse(await response.json());
    if (!response.ok || !parsed.success) {
      throw new Error('Invalid assistant resources response');
    }
    setAttachments(parsed.data.attachments);
    setArtifacts(parsed.data.artifacts);
    setSelectedAttachmentIds((current) =>
      current.filter((attachmentId) =>
        parsed.data.attachments.some((attachment) => attachment.id === attachmentId),
      ),
    );
  }

  function resetConversation(): void {
    if (pending) {
      return;
    }
    setConversationId(undefined);
    setMessages([]);
    setAttachments([]);
    setArtifacts([]);
    setSelectedAttachmentIds([]);
    setResourceStatus(undefined);
    setPlan(undefined);
    setPlanMessageId(undefined);
    setExecutionDraft(undefined);
    setExecutionRun(undefined);
    setExecutionStatus(undefined);
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
      const latestPlanMessage = [...parsed.data.conversation.messages]
        .reverse()
        .find((message) => message.plan !== undefined);
      setPlan(latestPlanMessage?.plan);
      setPlanMessageId(latestPlanMessage?.id);
      setExecutionDraft(undefined);
      setExecutionRun(undefined);
      setExecutionStatus(undefined);
      setPromptError(undefined);
      setStreamingBody('');
      streamingBodyRef.current = '';
      await refreshResources(parsed.data.conversation.id);
    } catch {
      setPromptError('unavailable');
    } finally {
      setLoadingHistory(false);
    }
  }

  async function ensureResourceConversation(): Promise<string> {
    if (conversationId !== undefined) {
      return conversationId;
    }
    if (resolvedProvider === undefined) {
      throw new Error('No provider');
    }
    const response = await fetch('/api/ai/conversations', {
      body: JSON.stringify({
        mode,
        provider: resolvedProvider,
        title: locale === 'en' ? 'Source workspace' : '來源工作區',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const parsed = ConversationCreateResponseSchema.safeParse(await response.json());
    if (!response.ok || !parsed.success) {
      throw new Error('Conversation could not be created');
    }
    setConversationId(parsed.data.conversation.id);
    await refreshConversations();
    return parsed.data.conversation.id;
  }

  async function uploadSource(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) {
      return;
    }
    if (file.size < 1 || file.size > MAX_ATTACHMENT_BYTES) {
      setResourceStatus(text.attachmentTooLarge);
      return;
    }
    setUploading(true);
    setResourceStatus(undefined);
    try {
      const id = await ensureResourceConversation();
      const response = await fetch('/api/ai/attachments', {
        body: JSON.stringify({
          content: await file.text(),
          conversationId: id,
          filename: file.name,
          mimeType: file.type,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const parsed = AttachmentUploadResponseSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) {
        throw new Error('Source upload failed');
      }
      await refreshResources(id);
      setSelectedAttachmentIds((current) => [...current, parsed.data.attachment.id].slice(-5));
    } catch {
      setResourceStatus(text.error);
    } finally {
      setUploading(false);
    }
  }

  function toggleAttachment(attachmentId: string): void {
    setResourceStatus(undefined);
    setSelectedAttachmentIds((current) => {
      if (current.includes(attachmentId)) {
        return current.filter((id) => id !== attachmentId);
      }
      if (current.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
        setResourceStatus(text.attachmentLimit);
        return current;
      }
      return [...current, attachmentId];
    });
  }

  async function createArtifact(message: AssistantConversationMessage): Promise<void> {
    if (conversationId === undefined || message.role !== 'assistant') {
      return;
    }
    setResourceStatus(undefined);
    try {
      const response = await fetch('/api/ai/artifacts', {
        body: JSON.stringify({
          conversationId,
          messageId: message.id,
          sourceAttachmentIds: selectedAttachmentIds,
          title: currentTitle,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const parsed = ArtifactCreateResponseSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) {
        throw new Error('Artifact creation failed');
      }
      await refreshResources(conversationId);
      setResourceStatus(text.artifactCreated);
    } catch {
      setResourceStatus(text.error);
    }
  }

  async function prepareExecutionReview(): Promise<void> {
    if (conversationId === undefined || planMessageId === undefined || plan === undefined) {
      return;
    }
    setExecutionWorking(true);
    setExecutionStatus(undefined);
    try {
      const response = await fetch('/api/ai/workflow-drafts', {
        body: JSON.stringify({
          conversationId,
          messageId: planMessageId,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const parsed = AssistantWorkflowDraftCreateResponseSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) {
        throw new Error('Workflow draft creation failed');
      }
      setExecutionDraft(parsed.data.draft);
      setExecutionRun(undefined);
      setExecutionStatus('ready');
    } catch {
      setExecutionStatus('error');
    } finally {
      setExecutionWorking(false);
    }
  }

  async function requestExecutionRun(): Promise<void> {
    if (executionDraft === undefined) {
      return;
    }
    setExecutionWorking(true);
    setExecutionStatus(undefined);
    try {
      const response = await fetch(
        `/api/ai/workflow-drafts/${encodeURIComponent(executionDraft.id)}/runs`,
        { method: 'POST' },
      );
      const parsed = AssistantWorkflowRunCreateResponseSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) {
        throw new Error('Workflow run creation failed');
      }
      setExecutionDraft(parsed.data.draft);
      setExecutionRun(parsed.data.run);
      setExecutionStatus('ready');
    } catch {
      setExecutionStatus('error');
    } finally {
      setExecutionWorking(false);
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
        attachmentIds: selectedAttachmentIds,
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
        attachmentIds: selectedAttachmentIds,
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
    setPlanMessageId(parsed.data.assistantMessage.id);
    setExecutionDraft(undefined);
    setExecutionRun(undefined);
    setExecutionStatus(undefined);
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
      if (conversationId !== undefined) {
        await refreshResources(conversationId);
      }
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
        <aside className="border-slate-200 bg-slate-950 p-4 text-white">
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
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-[10px] text-slate-400">
                        {message.provider} · {message.model} · {message.status}
                      </p>
                      {message.status === 'completed' && (
                        <button
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-indigo-700 transition hover:border-indigo-300"
                          disabled={pending}
                          onClick={() => void createArtifact(message)}
                          type="button"
                        >
                          {text.artifact}
                        </button>
                      )}
                    </div>
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
            {attachments.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {attachments.map((attachment) => {
                  const selected = selectedAttachmentIds.includes(attachment.id);
                  const citationIndex = selectedAttachmentIds.indexOf(attachment.id);
                  return (
                    <button
                      aria-pressed={selected}
                      className={`max-w-full truncate rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
                        selected
                          ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                      }`}
                      disabled={pending}
                      key={attachment.id}
                      onClick={() => toggleAttachment(attachment.id)}
                      title={attachment.filename}
                      type="button"
                    >
                      {selected ? `[S${citationIndex + 1}] ` : ''}
                      {attachment.filename}
                    </button>
                  );
                })}
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
                <div>
                  <input
                    accept=".txt,.md,.markdown,.csv,.json,application/json,text/csv,text/markdown,text/plain"
                    className="sr-only"
                    onChange={(event) => void uploadSource(event)}
                    ref={fileInputRef}
                    type="file"
                  />
                  <button
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:text-slate-300"
                    disabled={pending || uploading || resolvedProvider === undefined}
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    + {uploading ? text.streaming : text.attachment}
                  </button>
                  <p className="mt-1 text-[9px] text-slate-400">{text.attachmentHelp}</p>
                </div>
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
              {resourceStatus !== undefined && (
                <p className="text-[10px] font-semibold text-indigo-700" role="status">
                  {resourceStatus}
                </p>
              )}
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
                  className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${
                    plan === undefined
                      ? 'cursor-not-allowed text-slate-400'
                      : 'bg-slate-950 text-white hover:bg-slate-800'
                  }`}
                  disabled={
                    pending || executionWorking || plan === undefined || planMessageId === undefined
                  }
                  onClick={() => void prepareExecutionReview()}
                  type="button"
                >
                  {text.run} · {text.runReview}
                </button>
              </div>
            </div>
          </form>
        </section>

        <aside className="border-slate-200 bg-slate-50 p-5">
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
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-indigo-950">
                  <ShieldIcon className="size-4" />
                  {executionDraft === undefined ? text.executionDraft : text.executionDraftReady}
                </div>
                <p className="mt-2 text-[10px] leading-5 text-indigo-800">
                  {text.executionReviewHelp}
                </p>
                {executionDraft !== undefined && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[9px] text-indigo-900">
                    <span>Read · {executionDraft.risk.read}</span>
                    <span>Write · {executionDraft.risk.write}</span>
                    <span>External · {executionDraft.risk.external}</span>
                    <span>Destructive · {executionDraft.risk.destructive}</span>
                    <span className="col-span-2 truncate font-mono text-indigo-500">
                      sha256:{executionDraft.definitionHash.slice(0, 16)}
                    </span>
                  </div>
                )}
                {executionRun === undefined ? (
                  <button
                    className="mt-4 w-full rounded-xl bg-indigo-600 px-3 py-2.5 text-[10px] font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                    disabled={executionWorking}
                    onClick={() =>
                      void (executionDraft === undefined
                        ? prepareExecutionReview()
                        : requestExecutionRun())
                    }
                    type="button"
                  >
                    {executionDraft === undefined ? text.executionDraft : text.requestRun}
                  </button>
                ) : (
                  <div className="mt-4 rounded-xl bg-white p-3">
                    <p className="text-[10px] font-semibold text-slate-900">
                      {executionRun.status === 'awaiting_approval'
                        ? text.executionApproval
                        : text.runQueued}
                    </p>
                    <a
                      className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700"
                      href={`/dashboard/runs/${encodeURIComponent(executionRun.id)}`}
                    >
                      {text.runOpen}
                      <ArrowRightIcon className="size-3" />
                    </a>
                  </div>
                )}
                {executionStatus === 'error' && (
                  <p className="mt-3 text-[10px] font-semibold text-rose-700" role="alert">
                    {text.executionError}
                  </p>
                )}
              </div>
              <div className="rounded-2xl bg-slate-950 p-4 text-white">
                <div className="flex items-center gap-2">
                  <ShieldIcon className="size-4 text-emerald-300" />
                  <p className="text-xs font-semibold">{text.safetyTitle}</p>
                </div>
                <p className="mt-2 text-[10px] leading-5 text-slate-400">{text.safetyBody}</p>
              </div>
            </div>
          )}

          <div className="mt-6 border-t border-slate-200 pt-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              {text.sources}
            </p>
            {attachments.length === 0 ? (
              <p className="mt-2 text-[10px] leading-5 text-slate-400">{text.attachmentHelp}</p>
            ) : (
              <div className="mt-3 space-y-2">
                {attachments.map((attachment) => (
                  <a
                    className="block rounded-xl border border-slate-200 bg-white p-3 transition hover:border-indigo-300"
                    href={`/api/ai/attachments/${encodeURIComponent(attachment.id)}`}
                    key={attachment.id}
                  >
                    <p className="truncate text-[10px] font-semibold text-slate-800">
                      {attachment.filename}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-slate-400">
                      {attachment.preview}
                    </p>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-slate-200 pt-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              {text.artifacts}
            </p>
            <div className="mt-3 space-y-2">
              {artifacts.map((artifact) => (
                <a
                  className="block rounded-xl border border-slate-200 bg-white p-3 transition hover:border-indigo-300"
                  href={`/api/ai/artifacts/${encodeURIComponent(artifact.id)}`}
                  key={artifact.id}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[10px] font-semibold text-slate-800">
                      {artifact.title}
                    </p>
                    <span className="shrink-0 text-[9px] text-indigo-600">.md ↓</span>
                  </div>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[9px] leading-4 text-slate-400">
                    {artifact.preview}
                  </p>
                </a>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
