import { WebsiteSpecGenerationSchema, WebsiteSpecSchema } from '@ai-workflow-studio/website-schema';
import { createHash } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createWebsiteStaticExport } from './website-static-export';

const spec = WebsiteSpecSchema.parse({
  assets: [
    {
      alt: 'Portable generated hero',
      id: 'hero-art',
      kind: 'project-asset',
      role: 'hero',
    },
  ],
  locale: 'en',
  name: 'Portable Studio',
  navigation: {
    brandLabel: 'Portable Studio',
    items: [
      { label: 'Home', pageSlug: 'home' },
      { label: 'Services', pageSlug: 'services' },
    ],
  },
  pages: [
    {
      metaDescription: 'A portable static website export for deterministic testing.',
      sections: [
        {
          assetId: 'hero-art',
          body: 'This page is rendered from a validated portable Website Spec.',
          id: 'hero-main',
          layout: 'split',
          primaryAction: {
            label: 'View services',
            target: { kind: 'page', pageSlug: 'services' },
          },
          title: 'Portable website',
          type: 'hero',
        },
      ],
      slug: 'home',
      title: 'Home',
    },
    {
      metaDescription: 'A second static page inside the portable website export.',
      sections: [
        {
          body: 'Every page and image remains local to the extracted folder.',
          id: 'services-content',
          layout: 'text',
          title: 'Services',
          type: 'content',
        },
      ],
      slug: 'services',
      title: 'Services',
    },
  ],
  schemaVersion: 1,
  theme: {
    appearance: 'light',
    density: 'balanced',
    palette: 'indigo-mint',
    radius: 'rounded',
    typography: 'modern-sans',
  },
});

const generation = WebsiteSpecGenerationSchema.parse({
  attempts: 1,
  changeSummary: 'Created a portable website export fixture.',
  createdAt: '2026-07-28T12:00:00.000Z',
  model: 'gemini-3.5-flash-lite',
  provider: 'gemini',
  source: 'generated',
  spec,
  version: 5,
  versionName: 'Portable release',
});

const png = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0);
const input = {
  assets: [{ bytes: png, id: 'hero-art' }],
  generation,
  project: {
    id: '10000000-0000-4000-8000-000000000701',
    name: 'Portable Studio',
    slug: 'portable-studio',
  },
} as const;

const ManifestSchema = z
  .object({
    assets: z.array(
      z.object({
        id: z.string(),
        path: z.string(),
        sha256: z.string().length(64),
      }),
    ),
    entrypoint: z.literal('index.html'),
    exportFormat: z.literal('ai-workflow-studio-static-site'),
    pages: z.array(
      z.object({
        path: z.string(),
        sha256: z.string().length(64),
        slug: z.string(),
      }),
    ),
    schemaVersion: z.literal(1),
    version: z.object({ number: z.literal(5) }),
  })
  .passthrough();

function hash(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('portable website ZIP export', () => {
  it('creates a deterministic bounded archive with no traversal paths', () => {
    const first = createWebsiteStaticExport(input);
    const second = createWebsiteStaticExport(input);
    expect(first.bytes).toEqual(second.bytes);
    expect(first.archiveSha256).toBe(second.archiveSha256);
    expect(first.filename).toBe('portable-studio-v5.zip');

    const files = unzipSync(first.bytes);
    expect(Object.keys(files).sort()).toEqual([
      'README.txt',
      'assets/hero-art.png',
      'index.html',
      'integrity.sha256',
      'manifest.json',
      'page-services.html',
    ]);
    expect(Object.keys(files).every((path) => !path.includes('..') && !path.startsWith('/'))).toBe(
      true,
    );
  });

  it('renders local multi-page navigation and local image references', () => {
    const files = unzipSync(createWebsiteStaticExport(input).bytes);
    const home = strFromU8(files['index.html'] ?? new Uint8Array());
    const services = strFromU8(files['page-services.html'] ?? new Uint8Array());
    expect(home).toContain('href="page-services.html"');
    expect(home).toContain('src="assets/hero-art.png"');
    expect(services).toContain('href="index.html"');
    expect(home).not.toContain('/api/');
    expect(home).not.toContain('/s/');
    expect(home).not.toContain('<script');
  });

  it('includes a machine-readable manifest and verifiable SHA-256 metadata', () => {
    const result = createWebsiteStaticExport(input);
    const files = unzipSync(result.bytes);
    const manifest = ManifestSchema.parse(
      JSON.parse(strFromU8(files['manifest.json'] ?? new Uint8Array())) as unknown,
    );
    expect(manifest.pages.map((page) => page.path)).toEqual(['index.html', 'page-services.html']);
    expect(manifest.assets).toEqual([
      expect.objectContaining({ id: 'hero-art', path: 'assets/hero-art.png' }),
    ]);

    const integrity = strFromU8(files['integrity.sha256'] ?? new Uint8Array());
    for (const [path, bytes] of Object.entries(files)) {
      if (path !== 'integrity.sha256') expect(integrity).toContain(`${hash(bytes)}  ${path}`);
    }
    expect(hash(result.bytes)).toBe(result.archiveSha256);
  });

  it('fails closed when a referenced asset is missing or is not a PNG', () => {
    expect(() => createWebsiteStaticExport({ ...input, assets: [] })).toThrow(
      'hero-art is unavailable',
    );
    expect(() =>
      createWebsiteStaticExport({
        ...input,
        assets: [{ bytes: Uint8Array.of(1, 2, 3), id: 'hero-art' }],
      }),
    ).toThrow('hero-art is not a valid PNG');
  });
});
