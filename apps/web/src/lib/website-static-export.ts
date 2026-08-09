import {
  WebsiteSpecGenerationSchema,
  type WebsiteSpecGeneration,
} from '@ai-workflow-studio/website-schema';
import { createHash } from 'node:crypto';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { z } from 'zod';

import { renderWebsiteStaticDocument, websiteStaticPagePath } from './website-preview-renderer';

export const WEBSITE_STATIC_EXPORT_MAX_FILES = 50;
export const WEBSITE_STATIC_EXPORT_MAX_UNCOMPRESSED_BYTES = 24_000_000;
export const WEBSITE_STATIC_EXPORT_MAX_ARCHIVE_BYTES = 25_000_000;

const FIXED_ZIP_MTIME = new Date('1980-01-01T00:00:00.000Z');
const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const ExportProjectSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(2).max(120),
    slug: z
      .string()
      .min(2)
      .max(96)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict();

export interface WebsiteStaticExportAsset {
  readonly bytes: Uint8Array;
  readonly id: string;
}

export interface WebsiteStaticExport {
  readonly archiveSha256: string;
  readonly bytes: Uint8Array;
  readonly fileCount: number;
  readonly filename: string;
  readonly uncompressedBytes: number;
}

export interface WebsiteStaticSourceFile {
  readonly bytes: Uint8Array;
  readonly path: string;
  readonly sha256: string;
}

export interface WebsiteStaticSource {
  readonly fileCount: number;
  readonly files: readonly WebsiteStaticSourceFile[];
  readonly sourceSha256: string;
  readonly uncompressedBytes: number;
}

interface ExportFile {
  readonly bytes: Uint8Array;
  readonly path: string;
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function textFile(value: string): Uint8Array {
  return strToU8(value);
}

function assertPng(bytes: Uint8Array, assetId: string): void {
  if (
    bytes.byteLength < PNG_SIGNATURE.byteLength ||
    PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)
  ) {
    throw new Error(`Website export asset ${assetId} is not a valid PNG.`);
  }
  if (bytes.byteLength > 8_000_000) {
    throw new Error(`Website export asset ${assetId} exceeds the per-file limit.`);
  }
}

function assertArchivePath(path: string): void {
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new Error('Website export contains an unsafe archive path.');
  }
}

function addFile(files: Map<string, Uint8Array>, file: ExportFile): void {
  assertArchivePath(file.path);
  if (files.has(file.path)) throw new Error('Website export contains a duplicate archive path.');
  files.set(file.path, file.bytes);
}

export function createWebsiteStaticSource(input: {
  readonly assets: readonly WebsiteStaticExportAsset[];
  readonly generation: WebsiteSpecGeneration;
  readonly project: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
}): WebsiteStaticSource {
  const project = ExportProjectSchema.parse(input.project);
  const generation = WebsiteSpecGenerationSchema.parse(input.generation);
  const assetBytes = new Map(input.assets.map((asset) => [asset.id, asset.bytes] as const));
  const referencedAssets = generation.spec.assets.filter((asset) => asset.kind === 'project-asset');
  const files = new Map<string, Uint8Array>();
  const exportAssetUrls = new Map<string, string>();

  for (const asset of referencedAssets) {
    const bytes = assetBytes.get(asset.id);
    if (bytes === undefined) {
      throw new Error(`Website export asset ${asset.id} is unavailable.`);
    }
    assertPng(bytes, asset.id);
    const path = `assets/${asset.id}.png`;
    exportAssetUrls.set(asset.id, path);
    addFile(files, { bytes, path });
  }

  const pageEntries = generation.spec.pages.map((page) => {
    const path = websiteStaticPagePath(generation.spec, page.slug);
    const bytes = textFile(
      `${renderWebsiteStaticDocument(generation.spec, page.slug, exportAssetUrls)}\n`,
    );
    addFile(files, { bytes, path });
    return {
      path,
      sha256: sha256(bytes),
      slug: page.slug,
      title: page.title,
    };
  });

  const assetEntries = referencedAssets.map((asset) => {
    const path = `assets/${asset.id}.png`;
    const bytes = files.get(path);
    if (bytes === undefined) throw new Error('Website export asset assembly failed.');
    return {
      alt: asset.alt,
      byteSize: bytes.byteLength,
      id: asset.id,
      mimeType: 'image/png' as const,
      path,
      role: asset.role,
      sha256: sha256(bytes),
    };
  });

  const readme = textFile(
    [
      'AI Workflow Studio portable website export',
      '',
      `Website: ${project.name}`,
      `Version: ${generation.version} · ${generation.versionName}`,
      'Open index.html in a browser or upload the extracted folder to any static host.',
      'This archive contains static HTML and local PNG assets only. It contains no API keys, prompts, login data, or server code. Storefront pages include one built-in shopping-cart script (client-side only, no network calls).',
      '',
    ].join('\n'),
  );
  addFile(files, { bytes: readme, path: 'README.txt' });

  const manifest = textFile(
    `${JSON.stringify(
      {
        assets: assetEntries,
        entrypoint: 'index.html',
        exportFormat: 'ai-workflow-studio-static-site',
        integrity: 'integrity.sha256',
        pages: pageEntries,
        project: {
          id: project.id,
          name: project.name,
          slug: project.slug,
        },
        schemaVersion: 1,
        version: {
          createdAt: generation.createdAt,
          name: generation.versionName,
          number: generation.version,
          websiteSchemaVersion: generation.spec.schemaVersion,
        },
      },
      null,
      2,
    )}\n`,
  );
  addFile(files, { bytes: manifest, path: 'manifest.json' });

  const integrity = textFile(
    `${[...files.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, bytes]) => `${sha256(bytes)}  ${path}`)
      .join('\n')}\n`,
  );
  addFile(files, { bytes: integrity, path: 'integrity.sha256' });

  if (files.size > WEBSITE_STATIC_EXPORT_MAX_FILES) {
    throw new Error('Website export exceeds the file-count limit.');
  }
  const uncompressedBytes = [...files.values()].reduce(
    (total, fileBytes) => total + fileBytes.byteLength,
    0,
  );
  if (uncompressedBytes > WEBSITE_STATIC_EXPORT_MAX_UNCOMPRESSED_BYTES) {
    throw new Error('Website export exceeds the uncompressed byte limit.');
  }

  const sourceFiles = [...files.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, bytes]) => ({ bytes, path, sha256: sha256(bytes) }));
  return {
    fileCount: sourceFiles.length,
    files: sourceFiles,
    sourceSha256: sha256(integrity),
    uncompressedBytes,
  };
}

export function createWebsiteStaticExport(input: {
  readonly assets: readonly WebsiteStaticExportAsset[];
  readonly generation: WebsiteSpecGeneration;
  readonly project: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
}): WebsiteStaticExport {
  const source = createWebsiteStaticSource(input);
  const zipInput: Zippable = {};
  for (const file of source.files) {
    zipInput[file.path] = [
      file.bytes,
      {
        attrs: 0o644 << 16,
        level: 9,
        mtime: FIXED_ZIP_MTIME,
        os: 3,
      },
    ];
  }
  const bytes = zipSync(zipInput, { level: 9, mtime: FIXED_ZIP_MTIME });
  if (bytes.byteLength > WEBSITE_STATIC_EXPORT_MAX_ARCHIVE_BYTES) {
    throw new Error('Website export exceeds the compressed byte limit.');
  }
  return {
    archiveSha256: sha256(bytes),
    bytes,
    fileCount: source.fileCount,
    filename: `${input.project.slug}-v${input.generation.version}.zip`,
    uncompressedBytes: source.uncompressedBytes,
  };
}
