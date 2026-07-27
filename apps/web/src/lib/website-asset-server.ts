import 'server-only';

import {
  WebsiteGeneratedAssetSchema,
  type WebsiteGeneratedAsset,
  type WebsiteProject,
} from '@ai-workflow-studio/website-schema';
import { createHash } from 'node:crypto';
import { z } from 'zod';

import type { WorkspaceContext } from '@/lib/auth/context';
import { getEnvironment } from '@/lib/env';
import type { GeneratedWebsiteImage } from '@/lib/website-image-provider';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { WebsiteStudioError } from '@/lib/website-studio-server';

const WEBSITE_ASSET_BUCKET = 'website-assets';
const AssetIdentifierSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
const WebsiteAssetRowSchema = z
  .object({
    alt: z.string().min(1).max(180),
    byte_size: z.number().int().positive().max(8_000_000),
    created_at: z.string().datetime({ offset: true }),
    height: z.number().int().positive().max(4_096),
    mime_type: z.literal('image/png'),
    model: z.string().regex(/^[A-Za-z0-9._:-]{2,120}$/),
    provider: z.enum(['gemini', 'mock', 'openai']),
    role: z.enum(['hero', 'illustration', 'portrait']),
    spec_asset_id: AssetIdentifierSchema,
    storage_path: z.string().min(10).max(300),
    width: z.number().int().positive().max(4_096),
  })
  .strict();

interface MemoryWebsiteAsset {
  readonly asset: WebsiteGeneratedAsset;
  readonly bytes: Uint8Array;
}

const assetGlobal = globalThis as typeof globalThis & {
  __aiWorkflowWebsiteAssets?: Map<string, MemoryWebsiteAsset[]>;
};

function memoryAssets(): Map<string, MemoryWebsiteAsset[]> {
  assetGlobal.__aiWorkflowWebsiteAssets ??= new Map();
  return assetGlobal.__aiWorkflowWebsiteAssets;
}

function assetView(row: z.infer<typeof WebsiteAssetRowSchema>): WebsiteGeneratedAsset {
  return WebsiteGeneratedAssetSchema.parse({
    alt: row.alt,
    byteSize: row.byte_size,
    createdAt: row.created_at,
    height: row.height,
    id: row.spec_asset_id,
    mimeType: row.mime_type,
    model: row.model,
    provider: row.provider,
    role: row.role,
    width: row.width,
  });
}

export function hashWebsiteImagePrompt(prompt: string): string {
  return createHash('sha256').update(prompt, 'utf8').digest('hex');
}

export async function storeWebsiteAsset(
  context: WorkspaceContext,
  project: WebsiteProject,
  input: {
    readonly alt: string;
    readonly image: GeneratedWebsiteImage;
    readonly promptHash: string;
    readonly role: 'hero' | 'illustration' | 'portrait';
    readonly specAssetId: string;
  },
): Promise<WebsiteGeneratedAsset> {
  const specAssetId = AssetIdentifierSchema.parse(input.specAssetId);
  const createdAt = new Date().toISOString();
  const asset = WebsiteGeneratedAssetSchema.parse({
    alt: input.alt,
    byteSize: input.image.bytes.byteLength,
    createdAt,
    height: input.image.height,
    id: specAssetId,
    mimeType: input.image.mimeType,
    model: input.image.model,
    provider: input.image.provider,
    role: input.role,
    width: input.image.width,
  });
  if (getEnvironment().mockMode) {
    const assets = memoryAssets().get(project.id) ?? [];
    assets.push({ asset, bytes: input.image.bytes });
    memoryAssets().set(project.id, assets);
    return asset;
  }

  const storagePath = `${context.actor.tenantId}/${project.id}/${specAssetId}.png`;
  const admin = createSupabaseAdminClient();
  const upload = await admin.storage
    .from(WEBSITE_ASSET_BUCKET)
    .upload(storagePath, Buffer.from(input.image.bytes), {
      cacheControl: '31536000',
      contentType: input.image.mimeType,
      upsert: false,
    });
  if (upload.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The generated website image could not be stored.',
    );
  }
  const inserted = await admin
    .from('website_assets')
    .insert({
      alt: asset.alt,
      byte_size: asset.byteSize,
      created_by: context.actor.userId,
      height: asset.height,
      mime_type: asset.mimeType,
      model: asset.model,
      project_id: project.id,
      prompt_hash: input.promptHash,
      provider: asset.provider,
      role: asset.role,
      spec_asset_id: asset.id,
      storage_path: storagePath,
      tenant_id: context.actor.tenantId,
      width: asset.width,
    })
    .select(
      'alt, byte_size, created_at, height, mime_type, model, provider, role, spec_asset_id, storage_path, width',
    )
    .single();
  if (inserted.error !== null) {
    await admin.storage.from(WEBSITE_ASSET_BUCKET).remove([storagePath]);
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The generated website image metadata could not be saved.',
    );
  }
  return assetView(WebsiteAssetRowSchema.parse(inserted.data));
}

export async function removeWebsiteAsset(
  context: WorkspaceContext,
  projectId: string,
  assetId: string,
): Promise<void> {
  const parsedId = AssetIdentifierSchema.parse(assetId);
  if (getEnvironment().mockMode) {
    const remaining = (memoryAssets().get(projectId) ?? []).filter(
      (item) => item.asset.id !== parsedId,
    );
    memoryAssets().set(projectId, remaining);
    return;
  }
  const admin = createSupabaseAdminClient();
  const row = await admin
    .from('website_assets')
    .select('storage_path')
    .eq('tenant_id', context.actor.tenantId)
    .eq('project_id', projectId)
    .eq('spec_asset_id', parsedId)
    .maybeSingle();
  const parsed = z
    .object({ storage_path: z.string().min(10).max(300) })
    .nullable()
    .safeParse(row.data);
  if (row.error !== null || !parsed.success || parsed.data === null) return;
  await admin.storage.from(WEBSITE_ASSET_BUCKET).remove([parsed.data.storage_path]);
  await admin
    .from('website_assets')
    .delete()
    .eq('tenant_id', context.actor.tenantId)
    .eq('project_id', projectId)
    .eq('spec_asset_id', parsedId);
}

export async function getWebsiteAssetPreviewUrls(
  context: WorkspaceContext,
  projectId: string,
  assetIdsValue: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const assetIds = z
    .array(AssetIdentifierSchema)
    .max(30)
    .parse([...new Set(assetIdsValue)]);
  if (assetIds.length === 0) return new Map();
  if (getEnvironment().mockMode) {
    return new Map(
      (memoryAssets().get(projectId) ?? [])
        .filter((item) => assetIds.includes(item.asset.id))
        .map((item) => [
          item.asset.id,
          `data:${item.asset.mimeType};base64,${Buffer.from(item.bytes).toString('base64')}`,
        ]),
    );
  }

  const admin = createSupabaseAdminClient();
  const rows = await admin
    .from('website_assets')
    .select('spec_asset_id, storage_path')
    .eq('tenant_id', context.actor.tenantId)
    .eq('project_id', projectId)
    .in('spec_asset_id', assetIds);
  const parsed = z
    .array(
      z
        .object({
          spec_asset_id: AssetIdentifierSchema,
          storage_path: z.string().min(10).max(300),
        })
        .strict(),
    )
    .safeParse(rows.data);
  if (rows.error !== null || !parsed.success) return new Map();
  const signed = await Promise.all(
    parsed.data.map(async (row) => {
      const result = await admin.storage
        .from(WEBSITE_ASSET_BUCKET)
        .createSignedUrl(row.storage_path, 300);
      const url =
        result.error === null
          ? z.string().url().safeParse(result.data.signedUrl)
          : { success: false as const };
      return url.success ? ([row.spec_asset_id, url.data] as const) : undefined;
    }),
  );
  return new Map(signed.filter((item): item is readonly [string, string] => item !== undefined));
}
