import 'server-only';

import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  AssistantImageSummarySchema,
  type AssistantImageSummary,
} from '@/lib/assistant-conversation-schema';
import type { WorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import type { GeneratedWebsiteImage } from '@/lib/website-image-provider';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

const ASSISTANT_IMAGE_BUCKET = 'assistant-images';
const AssistantImageRowSchema = z
  .object({
    alt: z.string().min(1).max(180),
    byte_size: z.number().int().min(33).max(8_000_000),
    conversation_id: z.string().uuid(),
    created_at: z.string().datetime({ offset: true }),
    height: z.number().int().min(1).max(4_096),
    id: z.string().uuid(),
    mime_type: z.literal('image/png'),
    model: z.string().min(2).max(120),
    provider: z.enum(['gemini', 'mock', 'openai']),
    storage_path: z.string().min(10).max(300),
    tenant_id: z.string().uuid(),
    width: z.number().int().min(1).max(4_096),
  })
  .strict();

interface MemoryAssistantImage {
  readonly bytes: Uint8Array;
  readonly row: z.infer<typeof AssistantImageRowSchema>;
}

const imageGlobal = globalThis as typeof globalThis & {
  __aiWorkflowAssistantImages?: Map<string, MemoryAssistantImage>;
};

function memoryImages(): Map<string, MemoryAssistantImage> {
  imageGlobal.__aiWorkflowAssistantImages ??= new Map();
  return imageGlobal.__aiWorkflowAssistantImages;
}

function imageSummary(row: z.infer<typeof AssistantImageRowSchema>): AssistantImageSummary {
  return AssistantImageSummarySchema.parse({
    alt: row.alt,
    byteSize: row.byte_size,
    height: row.height,
    id: row.id,
    mimeType: row.mime_type,
    model: row.model,
    provider: row.provider,
    width: row.width,
  });
}

export function hashAssistantImagePrompt(prompt: string): string {
  return createHash('sha256').update(prompt, 'utf8').digest('hex');
}

export async function storeAssistantImage(
  context: WorkspaceContext,
  input: {
    readonly alt: string;
    readonly conversationId: string;
    readonly image: GeneratedWebsiteImage;
    readonly promptHash: string;
  },
): Promise<AssistantImageSummary> {
  const id = crypto.randomUUID();
  const storagePath = `${context.actor.tenantId}/${input.conversationId}/${id}.png`;
  const row = AssistantImageRowSchema.parse({
    alt: [...input.alt.trim()].slice(0, 180).join(''),
    byte_size: input.image.bytes.byteLength,
    conversation_id: input.conversationId,
    created_at: new Date().toISOString(),
    height: input.image.height,
    id,
    mime_type: input.image.mimeType,
    model: input.image.model,
    provider: input.image.provider,
    storage_path: storagePath,
    tenant_id: context.actor.tenantId,
    width: input.image.width,
  });
  if (getEnvironment().mockMode) {
    memoryImages().set(id, { bytes: input.image.bytes, row });
    return imageSummary(row);
  }

  const admin = createSupabaseAdminClient();
  const upload = await admin.storage
    .from(ASSISTANT_IMAGE_BUCKET)
    .upload(storagePath, Buffer.from(input.image.bytes), {
      cacheControl: '31536000',
      contentType: input.image.mimeType,
      upsert: false,
    });
  if (upload.error !== null) {
    throw new Error('The generated assistant image could not be stored.');
  }
  const inserted = await admin
    .from('ai_image_artifacts')
    .insert({
      alt: row.alt,
      byte_size: row.byte_size,
      conversation_id: row.conversation_id,
      created_by: context.actor.userId,
      height: row.height,
      id: row.id,
      mime_type: row.mime_type,
      model: row.model,
      prompt_hash: input.promptHash,
      provider: row.provider,
      storage_path: row.storage_path,
      tenant_id: row.tenant_id,
      width: row.width,
    })
    .select(
      'alt, byte_size, conversation_id, created_at, height, id, mime_type, model, provider, storage_path, tenant_id, width',
    )
    .single();
  if (inserted.error !== null) {
    await admin.storage.from(ASSISTANT_IMAGE_BUCKET).remove([storagePath]);
    throw new Error('The generated assistant image metadata could not be saved.');
  }
  return imageSummary(AssistantImageRowSchema.parse(inserted.data));
}

export async function removeAssistantImage(
  context: WorkspaceContext,
  imageId: string,
): Promise<void> {
  if (getEnvironment().mockMode) {
    const item = memoryImages().get(imageId);
    if (item?.row.tenant_id === context.actor.tenantId) {
      memoryImages().delete(imageId);
    }
    return;
  }
  const admin = createSupabaseAdminClient();
  const result = await admin
    .from('ai_image_artifacts')
    .select('storage_path')
    .eq('id', imageId)
    .eq('tenant_id', context.actor.tenantId)
    .maybeSingle();
  const parsed = z
    .object({ storage_path: z.string().min(10).max(300) })
    .nullable()
    .safeParse(result.data);
  if (result.error !== null || !parsed.success || parsed.data === null) return;
  await admin.storage.from(ASSISTANT_IMAGE_BUCKET).remove([parsed.data.storage_path]);
  await admin
    .from('ai_image_artifacts')
    .delete()
    .eq('id', imageId)
    .eq('tenant_id', context.actor.tenantId);
}

export async function getAssistantImage(
  context: WorkspaceContext,
  imageId: string,
): Promise<{ readonly bytes: Uint8Array; readonly mimeType: 'image/png' }> {
  if (getEnvironment().mockMode) {
    const item = memoryImages().get(imageId);
    if (item === undefined || item.row.tenant_id !== context.actor.tenantId) {
      throw new Error('The assistant image was not found.');
    }
    return { bytes: item.bytes, mimeType: item.row.mime_type };
  }
  const admin = createSupabaseAdminClient();
  const result = await admin
    .from('ai_image_artifacts')
    .select(
      'alt, byte_size, conversation_id, created_at, height, id, mime_type, model, provider, storage_path, tenant_id, width',
    )
    .eq('id', imageId)
    .eq('tenant_id', context.actor.tenantId)
    .maybeSingle();
  const row = AssistantImageRowSchema.safeParse(result.data);
  if (result.error !== null || !row.success) {
    throw new Error('The assistant image was not found.');
  }
  const download = await admin.storage.from(ASSISTANT_IMAGE_BUCKET).download(row.data.storage_path);
  if (download.error !== null) {
    throw new Error('The assistant image could not be loaded.');
  }
  return {
    bytes: new Uint8Array(await download.data.arrayBuffer()),
    mimeType: row.data.mime_type,
  };
}

export function deleteMemoryAssistantImages(tenantId: string, conversationId: string): void {
  for (const [id, item] of memoryImages()) {
    if (item.row.tenant_id === tenantId && item.row.conversation_id === conversationId) {
      memoryImages().delete(id);
    }
  }
}
