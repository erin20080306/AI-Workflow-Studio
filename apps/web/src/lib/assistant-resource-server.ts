import 'server-only';

import {
  MAX_ARTIFACT_BYTES,
  MAX_ATTACHMENT_BYTES,
  PreparedSourceSchema,
  type PreparedSource,
  validateToolInvocation,
  validateToolResult,
} from '@ai-workflow-studio/tool-registry';
import { z } from 'zod';

import {
  AssistantArtifactSummarySchema,
  AssistantAttachmentSummarySchema,
  AssistantResourcesResponseSchema,
  type AssistantArtifactSummary,
  type AssistantAttachmentSummary,
} from '@/lib/assistant-resource-schema';
import { getAssistantConversation } from '@/lib/assistant-conversation-server';
import type { WorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { consumeMeteredAllowance } from '@/lib/usage-control-server';

const AttachmentRowSchema = z.object({
  byte_size: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
  content: z.string().min(1),
  conversation_id: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
  filename: z.string().min(1).max(180),
  id: z.string().uuid(),
  mime_type: z.enum(['application/json', 'text/csv', 'text/markdown', 'text/plain']),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  tenant_id: z.string().uuid(),
  uploaded_by: z.string().uuid(),
});

const ArtifactRowSchema = z.object({
  byte_size: z.number().int().min(1).max(MAX_ARTIFACT_BYTES),
  content: z.string().min(1),
  conversation_id: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
  filename: z.string().min(1).max(180),
  id: z.string().uuid(),
  message_id: z.string().uuid(),
  mime_type: z.literal('text/markdown'),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  tenant_id: z.string().uuid(),
  title: z.string().min(1).max(120),
});

type AttachmentRow = z.infer<typeof AttachmentRowSchema>;
type ArtifactRow = z.infer<typeof ArtifactRowSchema>;

interface MemoryResources {
  readonly artifacts: Map<string, ArtifactRow & { sourceAttachmentIds: readonly string[] }>;
  readonly attachments: Map<string, AttachmentRow>;
  readonly messageSources: Map<string, readonly PreparedSource[]>;
  readonly toolResults: unknown[];
}

const resourcesGlobal = globalThis as typeof globalThis & {
  __aiWorkflowAssistantResources?: MemoryResources;
};

function memoryResources(): MemoryResources {
  resourcesGlobal.__aiWorkflowAssistantResources ??= {
    artifacts: new Map(),
    attachments: new Map(),
    messageSources: new Map(),
    toolResults: [],
  };
  return resourcesGlobal.__aiWorkflowAssistantResources;
}

export function deleteMemoryAssistantResources(tenantId: string, conversationId: string): void {
  const state = memoryResources();
  for (const [id, row] of state.attachments) {
    if (row.tenant_id === tenantId && row.conversation_id === conversationId) {
      state.attachments.delete(id);
    }
  }
  for (const [id, row] of state.artifacts) {
    if (row.tenant_id === tenantId && row.conversation_id === conversationId) {
      state.artifacts.delete(id);
      state.messageSources.delete(row.message_id);
    }
  }
}

export type AssistantResourceErrorCode =
  | 'ASSISTANT_RESOURCE_FAILED'
  | 'ASSISTANT_RESOURCE_INVALID'
  | 'ASSISTANT_RESOURCE_LIMIT_EXCEEDED'
  | 'ASSISTANT_RESOURCE_NOT_FOUND';

export class AssistantResourceError extends Error {
  readonly code: AssistantResourceErrorCode;

  constructor(code: AssistantResourceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = 'AssistantResourceError';
  }
}

function sliceCharacters(value: string, max: number): string {
  return [...value].slice(0, max).join('');
}

function sliceUtf8(value: string, maxBytes: number): string {
  if (new TextEncoder().encode(value).byteLength <= maxBytes) {
    return value;
  }
  const characters = [...value];
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (new TextEncoder().encode(characters.slice(0, middle).join('')).byteLength <= maxBytes) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return characters.slice(0, low).join('');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function safeFilename(value: string): string {
  const withoutControlCharacters = [...value.normalize('NFKC')]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127 ? '_' : character;
    })
    .join('');
  return sliceCharacters(withoutControlCharacters.replaceAll(/[/\\]/g, '_').trim(), 180);
}

function expectedMime(
  filename: string,
): 'application/json' | 'text/csv' | 'text/markdown' | 'text/plain' | undefined {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown';
  if (lower.endsWith('.txt')) return 'text/plain';
  return undefined;
}

function attachmentSummary(row: AttachmentRow): AssistantAttachmentSummary {
  return AssistantAttachmentSummarySchema.parse({
    byteSize: row.byte_size,
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    filename: row.filename,
    id: row.id,
    mimeType: row.mime_type,
    preview: sliceCharacters(row.content, 640),
    sha256: row.sha256,
  });
}

function artifactSummary(row: ArtifactRow, sourceCount: number): AssistantArtifactSummary {
  return AssistantArtifactSummarySchema.parse({
    byteSize: row.byte_size,
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    filename: row.filename,
    id: row.id,
    messageId: row.message_id,
    mimeType: row.mime_type,
    preview: sliceCharacters(row.content, 1_200),
    sha256: row.sha256,
    sourceCount,
    title: row.title,
  });
}

async function authorizeConversation(
  context: WorkspaceContext,
  conversationId: string,
): Promise<void> {
  await getAssistantConversation(context, conversationId);
}

function requireMemoryAttachment(
  context: WorkspaceContext,
  conversationId: string,
  attachmentId: string,
): AttachmentRow {
  const row = memoryResources().attachments.get(attachmentId);
  if (
    row === undefined ||
    row.tenant_id !== context.actor.tenantId ||
    row.conversation_id !== conversationId
  ) {
    throw new AssistantResourceError(
      'ASSISTANT_RESOURCE_NOT_FOUND',
      'The assistant source was not found.',
    );
  }
  return row;
}

async function loadAttachments(
  context: WorkspaceContext,
  conversationId: string,
  attachmentIds: readonly string[],
): Promise<readonly AttachmentRow[]> {
  if (getEnvironment().mockMode) {
    return attachmentIds.map((id) => requireMemoryAttachment(context, conversationId, id));
  }
  const result = await createSupabaseAdminClient()
    .from('ai_attachments')
    .select('*')
    .eq('tenant_id', context.actor.tenantId)
    .eq('conversation_id', conversationId)
    .in('id', [...attachmentIds]);
  const rows = z.array(AttachmentRowSchema).safeParse(result.data);
  if (result.error !== null || !rows.success) {
    throw new AssistantResourceError(
      'ASSISTANT_RESOURCE_FAILED',
      'Assistant sources could not be loaded.',
    );
  }
  const byId = new Map(rows.data.map((row) => [row.id, row]));
  if (byId.size !== attachmentIds.length) {
    throw new AssistantResourceError(
      'ASSISTANT_RESOURCE_NOT_FOUND',
      'One or more assistant sources were not found.',
    );
  }
  return attachmentIds.map((id) => {
    const row = byId.get(id);
    if (row === undefined) {
      throw new AssistantResourceError(
        'ASSISTANT_RESOURCE_NOT_FOUND',
        'One or more assistant sources were not found.',
      );
    }
    return row;
  });
}

export async function uploadAssistantAttachment(
  context: WorkspaceContext,
  input: {
    readonly content: string;
    readonly conversationId: string;
    readonly filename: string;
    readonly mimeType: string;
  },
): Promise<AssistantAttachmentSummary> {
  await authorizeConversation(context, input.conversationId);
  const filename = safeFilename(input.filename);
  const mimeType = expectedMime(filename);
  if (filename.length === 0 || mimeType === undefined) {
    throw new AssistantResourceError(
      'ASSISTANT_RESOURCE_INVALID',
      'Only .txt, .md, .csv, and .json sources are supported.',
    );
  }
  if (
    input.mimeType.length > 0 &&
    input.mimeType !== 'application/octet-stream' &&
    input.mimeType !== mimeType
  ) {
    throw new AssistantResourceError(
      'ASSISTANT_RESOURCE_INVALID',
      'The source file type does not match its filename.',
    );
  }
  if (input.content.includes('\0')) {
    throw new AssistantResourceError(
      'ASSISTANT_RESOURCE_INVALID',
      'The source contains unsupported characters.',
    );
  }
  const byteSize = new TextEncoder().encode(input.content).byteLength;
  if (byteSize < 1 || byteSize > MAX_ATTACHMENT_BYTES) {
    throw new AssistantResourceError(
      'ASSISTANT_RESOURCE_LIMIT_EXCEEDED',
      'Assistant sources must be 1 MB or smaller.',
    );
  }
  if (mimeType === 'application/json') {
    try {
      JSON.parse(input.content);
    } catch (error) {
      throw new AssistantResourceError(
        'ASSISTANT_RESOURCE_INVALID',
        'The JSON source is invalid.',
        { cause: error },
      );
    }
  }

  const existing = await listAssistantResources(context, input.conversationId);
  if (existing.attachments.length >= 20) {
    throw new AssistantResourceError(
      'ASSISTANT_RESOURCE_LIMIT_EXCEEDED',
      'A conversation can contain at most 20 sources.',
    );
  }
  const contentSha256 = await sha256(input.content);
  await consumeMeteredAllowance(context, 'source_upload', byteSize, {
    conversationId: input.conversationId,
    mimeType,
    sha256: contentSha256,
  });
  const now = new Date().toISOString();
  const row = AttachmentRowSchema.parse({
    byte_size: byteSize,
    content: input.content,
    conversation_id: input.conversationId,
    created_at: now,
    filename,
    id: crypto.randomUUID(),
    mime_type: mimeType,
    sha256: contentSha256,
    tenant_id: context.actor.tenantId,
    uploaded_by: context.actor.userId,
  });
  if (getEnvironment().mockMode) {
    memoryResources().attachments.set(row.id, row);
    return attachmentSummary(row);
  }
  const result = await createSupabaseAdminClient()
    .from('ai_attachments')
    .insert(row)
    .select('*')
    .single();
  const saved = AttachmentRowSchema.safeParse(result.data);
  if (result.error !== null || !saved.success) {
    throw new AssistantResourceError(
      'ASSISTANT_RESOURCE_FAILED',
      'The assistant source could not be saved.',
    );
  }
  return attachmentSummary(saved.data);
}

export async function listAssistantResources(
  context: WorkspaceContext,
  conversationId: string,
): Promise<z.infer<typeof AssistantResourcesResponseSchema>> {
  await authorizeConversation(context, conversationId);
  if (getEnvironment().mockMode) {
    const attachments = [...memoryResources().attachments.values()]
      .filter(
        (row) => row.tenant_id === context.actor.tenantId && row.conversation_id === conversationId,
      )
      .sort((left, right) => left.created_at.localeCompare(right.created_at))
      .slice(0, 20)
      .map(attachmentSummary);
    const artifacts = [...memoryResources().artifacts.values()]
      .filter(
        (row) => row.tenant_id === context.actor.tenantId && row.conversation_id === conversationId,
      )
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .slice(0, 100)
      .map((row) => artifactSummary(row, row.sourceAttachmentIds.length));
    return AssistantResourcesResponseSchema.parse({ artifacts, attachments });
  }

  const admin = createSupabaseAdminClient();
  const [attachmentResult, artifactResult, artifactSourceResult] = await Promise.all([
    admin
      .from('ai_attachments')
      .select('*')
      .eq('tenant_id', context.actor.tenantId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(20),
    admin
      .from('ai_artifacts')
      .select('*')
      .eq('tenant_id', context.actor.tenantId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('ai_artifact_sources')
      .select('artifact_id')
      .eq('tenant_id', context.actor.tenantId)
      .eq('conversation_id', conversationId),
  ]);
  const attachments = z.array(AttachmentRowSchema).safeParse(attachmentResult.data);
  const artifacts = z.array(ArtifactRowSchema).safeParse(artifactResult.data);
  const sourceRows = z
    .array(z.object({ artifact_id: z.string().uuid() }))
    .safeParse(artifactSourceResult.data);
  if (
    attachmentResult.error !== null ||
    artifactResult.error !== null ||
    artifactSourceResult.error !== null ||
    !attachments.success ||
    !artifacts.success ||
    !sourceRows.success
  ) {
    throw new AssistantResourceError(
      'ASSISTANT_RESOURCE_FAILED',
      'Assistant resources could not be listed.',
    );
  }
  const counts = new Map<string, number>();
  for (const row of sourceRows.data) {
    counts.set(row.artifact_id, (counts.get(row.artifact_id) ?? 0) + 1);
  }
  return AssistantResourcesResponseSchema.parse({
    artifacts: artifacts.data.map((row) => artifactSummary(row, counts.get(row.id) ?? 0)),
    attachments: attachments.data.map(attachmentSummary),
  });
}

export async function prepareAssistantSources(
  context: WorkspaceContext,
  input: {
    readonly attachmentIds: readonly string[];
    readonly conversationId: string;
    readonly maxCharacters: number;
    readonly messageId: string;
  },
): Promise<readonly PreparedSource[]> {
  if (input.attachmentIds.length === 0) {
    return [];
  }
  const invocation = validateToolInvocation({
    authority: {
      conversationId: input.conversationId,
      tenantId: context.actor.tenantId,
    },
    input: {
      attachmentIds: input.attachmentIds,
      maxCharacters: input.maxCharacters,
      messageId: input.messageId,
    },
    name: 'source.prepare_context',
    version: 1,
  });
  const conversation = await getAssistantConversation(context, input.conversationId);
  if (!conversation.messages.some((message) => message.id === input.messageId)) {
    throw new AssistantResourceError(
      'ASSISTANT_RESOURCE_NOT_FOUND',
      'The assistant message was not found.',
    );
  }
  const rows = await loadAttachments(context, input.conversationId, input.attachmentIds);
  let remaining = input.maxCharacters;
  const sources = rows.map((row, index) => {
    const sourceBudget = Math.min(
      8_000,
      Math.max(1, Math.floor(remaining / (rows.length - index))),
    );
    const excerpt = sliceCharacters(row.content, sourceBudget);
    remaining -= excerpt.length;
    return PreparedSourceSchema.parse({
      attachmentId: row.id,
      citationLabel: `S${index + 1}`,
      excerpt,
      filename: row.filename,
      mimeType: row.mime_type,
      sha256: row.sha256,
      truncated: excerpt.length < [...row.content].length,
    });
  });
  const result = validateToolResult({
    name: 'source.prepare_context',
    output: {
      characters: sources.reduce((total, source) => total + source.excerpt.length, 0),
      sources,
    },
    status: 'succeeded',
    version: 1,
  });
  if (result.name !== 'source.prepare_context') {
    throw new AssistantResourceError(
      'ASSISTANT_RESOURCE_FAILED',
      'The assistant source result is invalid.',
    );
  }
  await consumeMeteredAllowance(context, 'tool_call', 1, {
    conversationId: input.conversationId,
    toolName: invocation.name,
    toolVersion: invocation.version,
  });
  if (getEnvironment().mockMode) {
    const state = memoryResources();
    state.messageSources.set(input.messageId, sources);
    state.toolResults.push({ invocation, result });
    if (state.toolResults.length > 1_000) {
      state.toolResults.splice(0, state.toolResults.length - 1_000);
    }
    return sources;
  }

  const admin = createSupabaseAdminClient();
  const sourceInsert = await admin.from('ai_message_sources').upsert(
    sources.map((source) => ({
      attachment_id: source.attachmentId,
      citation_label: source.citationLabel,
      conversation_id: input.conversationId,
      message_id: input.messageId,
      tenant_id: context.actor.tenantId,
    })),
    { onConflict: 'message_id,attachment_id' },
  );
  const toolInsert = await admin.from('ai_tool_results').insert({
    conversation_id: input.conversationId,
    created_by: context.actor.userId,
    input_summary: {
      attachmentIds: input.attachmentIds,
      maxCharacters: input.maxCharacters,
    },
    message_id: input.messageId,
    output_summary: {
      characters: result.output.characters,
      sources: result.output.sources.map((source) => ({
        attachmentId: source.attachmentId,
        citationLabel: source.citationLabel,
        sha256: source.sha256,
        truncated: source.truncated,
      })),
    },
    status: 'succeeded',
    tenant_id: context.actor.tenantId,
    tool_name: invocation.name,
    tool_version: invocation.version,
  });
  if (sourceInsert.error !== null || toolInsert.error !== null) {
    throw new AssistantResourceError(
      'ASSISTANT_RESOURCE_FAILED',
      'The assistant source result could not be audited.',
    );
  }
  return sources;
}

export async function createAssistantArtifact(
  context: WorkspaceContext,
  input: {
    readonly conversationId: string;
    readonly messageId: string;
    readonly sourceAttachmentIds: readonly string[];
    readonly title: string;
  },
): Promise<AssistantArtifactSummary> {
  const invocation = validateToolInvocation({
    authority: {
      conversationId: input.conversationId,
      tenantId: context.actor.tenantId,
    },
    input: {
      messageId: input.messageId,
      sourceAttachmentIds: input.sourceAttachmentIds,
      title: input.title,
    },
    name: 'artifact.create_markdown',
    version: 1,
  });
  const conversation = await getAssistantConversation(context, input.conversationId);
  const message = conversation.messages.find(
    (candidate) =>
      candidate.id === input.messageId &&
      candidate.role === 'assistant' &&
      candidate.status === 'completed',
  );
  if (message === undefined) {
    throw new AssistantResourceError(
      'ASSISTANT_RESOURCE_NOT_FOUND',
      'A completed assistant message is required to create an artifact.',
    );
  }
  const attachments = await loadAttachments(
    context,
    input.conversationId,
    input.sourceAttachmentIds,
  );
  const sourceSection =
    attachments.length === 0
      ? ''
      : `\n\n## Sources\n${attachments
          .map((attachment, index) => `- [S${index + 1}] ${attachment.filename}`)
          .join('\n')}`;
  const content = sliceUtf8(
    `# ${input.title}\n\n${message.body}${sourceSection}\n`,
    MAX_ARTIFACT_BYTES,
  );
  const now = new Date().toISOString();
  const artifactId = crypto.randomUUID();
  const row = ArtifactRowSchema.parse({
    byte_size: new TextEncoder().encode(content).byteLength,
    content,
    conversation_id: input.conversationId,
    created_at: now,
    filename: `artifact-${artifactId.slice(0, 8)}.md`,
    id: artifactId,
    message_id: input.messageId,
    mime_type: 'text/markdown',
    sha256: await sha256(content),
    tenant_id: context.actor.tenantId,
    title: input.title.trim(),
  });
  const result = validateToolResult({
    name: 'artifact.create_markdown',
    output: {
      artifactId: row.id,
      byteSize: row.byte_size,
      filename: row.filename,
      sha256: row.sha256,
      sourceCount: attachments.length,
    },
    status: 'succeeded',
    version: 1,
  });
  await consumeMeteredAllowance(context, 'tool_call', 1, {
    conversationId: input.conversationId,
    toolName: invocation.name,
    toolVersion: invocation.version,
  });

  if (getEnvironment().mockMode) {
    const state = memoryResources();
    state.artifacts.set(row.id, {
      ...row,
      sourceAttachmentIds: input.sourceAttachmentIds,
    });
    state.toolResults.push({ invocation, result });
    return artifactSummary(row, attachments.length);
  }

  const admin = createSupabaseAdminClient();
  const artifactInsert = await admin.from('ai_artifacts').insert({
    byte_size: row.byte_size,
    content: row.content,
    conversation_id: row.conversation_id,
    created_by: context.actor.userId,
    filename: row.filename,
    id: row.id,
    message_id: row.message_id,
    mime_type: row.mime_type,
    sha256: row.sha256,
    tenant_id: row.tenant_id,
    title: row.title,
  });
  if (artifactInsert.error !== null) {
    throw new AssistantResourceError(
      'ASSISTANT_RESOURCE_FAILED',
      'The assistant artifact could not be saved.',
    );
  }
  const [sourceInsert, toolInsert] = await Promise.all([
    attachments.length === 0
      ? Promise.resolve({ error: null })
      : admin.from('ai_artifact_sources').insert(
          attachments.map((attachment) => ({
            artifact_id: row.id,
            attachment_id: attachment.id,
            conversation_id: input.conversationId,
            tenant_id: context.actor.tenantId,
          })),
        ),
    admin.from('ai_tool_results').insert({
      conversation_id: input.conversationId,
      created_by: context.actor.userId,
      input_summary: {
        messageId: input.messageId,
        sourceAttachmentIds: input.sourceAttachmentIds,
        title: input.title,
      },
      message_id: input.messageId,
      output_summary: result.output,
      status: 'succeeded',
      tenant_id: context.actor.tenantId,
      tool_name: invocation.name,
      tool_version: invocation.version,
    }),
  ]);
  if (sourceInsert.error !== null || toolInsert.error !== null) {
    await admin
      .from('ai_artifacts')
      .delete()
      .eq('id', row.id)
      .eq('tenant_id', context.actor.tenantId);
    throw new AssistantResourceError(
      'ASSISTANT_RESOURCE_FAILED',
      'The assistant artifact result could not be audited.',
    );
  }
  return artifactSummary(row, attachments.length);
}

export async function getAssistantAttachmentDownload(
  context: WorkspaceContext,
  attachmentId: string,
): Promise<{ readonly content: string; readonly filename: string; readonly mimeType: string }> {
  if (getEnvironment().mockMode) {
    const row = memoryResources().attachments.get(attachmentId);
    if (row === undefined || row.tenant_id !== context.actor.tenantId) {
      throw new AssistantResourceError(
        'ASSISTANT_RESOURCE_NOT_FOUND',
        'The assistant source was not found.',
      );
    }
    await authorizeConversation(context, row.conversation_id);
    return { content: row.content, filename: row.filename, mimeType: row.mime_type };
  }
  const result = await createSupabaseAdminClient()
    .from('ai_attachments')
    .select('*')
    .eq('id', attachmentId)
    .eq('tenant_id', context.actor.tenantId)
    .maybeSingle();
  const row = AttachmentRowSchema.safeParse(result.data);
  if (result.error !== null || !row.success) {
    throw new AssistantResourceError(
      'ASSISTANT_RESOURCE_NOT_FOUND',
      'The assistant source was not found.',
    );
  }
  await authorizeConversation(context, row.data.conversation_id);
  return {
    content: row.data.content,
    filename: row.data.filename,
    mimeType: row.data.mime_type,
  };
}

export async function getAssistantArtifactDownload(
  context: WorkspaceContext,
  artifactId: string,
): Promise<{ readonly content: string; readonly filename: string; readonly mimeType: string }> {
  if (getEnvironment().mockMode) {
    const row = memoryResources().artifacts.get(artifactId);
    if (row === undefined || row.tenant_id !== context.actor.tenantId) {
      throw new AssistantResourceError(
        'ASSISTANT_RESOURCE_NOT_FOUND',
        'The assistant artifact was not found.',
      );
    }
    await authorizeConversation(context, row.conversation_id);
    return { content: row.content, filename: row.filename, mimeType: row.mime_type };
  }
  const result = await createSupabaseAdminClient()
    .from('ai_artifacts')
    .select('*')
    .eq('id', artifactId)
    .eq('tenant_id', context.actor.tenantId)
    .maybeSingle();
  const row = ArtifactRowSchema.safeParse(result.data);
  if (result.error !== null || !row.success) {
    throw new AssistantResourceError(
      'ASSISTANT_RESOURCE_NOT_FOUND',
      'The assistant artifact was not found.',
    );
  }
  await authorizeConversation(context, row.data.conversation_id);
  return {
    content: row.data.content,
    filename: row.data.filename,
    mimeType: row.data.mime_type,
  };
}
