import { WebsiteSpecGenerationSchema, WebsiteSpecSchema } from '@ai-workflow-studio/website-schema';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { createWebsiteNextAppExport, createWebsiteNextAppSource } from './website-nextjs-export';

const spec = WebsiteSpecSchema.parse({
  assets: [],
  locale: 'zh-Hant',
  name: '選物電商',
  navigation: {
    brandLabel: '選物電商',
    items: [
      { label: '首頁', pageSlug: 'home' },
      { label: '全部商品', pageSlug: 'menu' },
    ],
  },
  pages: [
    {
      metaDescription: '一個可自架的線上商店，資料存在自己的 Supabase。',
      sections: [
        {
          body: '探索本季精選商品，加入購物袋即可線上結帳。',
          eyebrow: '當季新品',
          id: 'home-hero',
          layout: 'split',
          primaryAction: {
            label: '立即選購',
            target: { kind: 'section', sectionId: 'home-products' },
          },
          title: '選物電商',
          type: 'hero',
        },
        {
          columns: '2',
          id: 'home-products',
          items: [
            {
              currency: 'NT$',
              name: '經典棉上衣',
              price: 1280,
              priceLabel: 'NT$1,280',
              sku: 'AN-101',
              stock: 12,
            },
            {
              currency: 'NT$',
              name: '皮革肩背包',
              price: 2680,
              priceLabel: 'NT$2,680',
              sku: 'AN-204',
              stock: 0,
            },
          ],
          title: '選購當季商品',
          type: 'product-grid',
        },
      ],
      slug: 'home',
      title: '首頁',
    },
    {
      metaDescription: '呈現完整商品目錄與各項商品說明的頁面。',
      sections: [
        {
          body: '這裡呈現完整商品目錄與說明。',
          id: 'menu-content',
          layout: 'text',
          title: '全部商品',
          type: 'content',
        },
      ],
      slug: 'menu',
      title: '全部商品',
    },
  ],
  schemaVersion: 1,
  theme: {
    appearance: 'light',
    density: 'balanced',
    palette: 'graphite-amber',
    radius: 'rounded',
    typography: 'editorial',
  },
});

const generation = WebsiteSpecGenerationSchema.parse({
  attempts: 1,
  changeSummary: 'Created a self-hosted store export fixture.',
  createdAt: '2026-08-11T12:00:00.000Z',
  model: 'safe-website-builder-v1',
  provider: 'mock',
  source: 'generated',
  spec,
  version: 3,
  versionName: 'Store release',
});

const input = {
  assets: [],
  generation,
  project: { id: '10000000-0000-4000-8000-000000000801', name: '選物電商', slug: 'curated-store' },
} as const;

function files() {
  return unzipSync(createWebsiteNextAppExport(input).bytes);
}

describe('self-hosted Next.js store export', () => {
  it('emits a deployable Next.js app with the expected files', () => {
    const names = Object.keys(files()).sort();
    expect(names).toEqual([
      '.env.example',
      '.gitignore',
      'README.md',
      'app/[[...slug]]/route.ts',
      'app/api/checkout/route.ts',
      'app/api/contact/route.ts',
      'integrity.sha256',
      'lib/pages.ts',
      'lib/products.ts',
      'manifest.json',
      'next.config.mjs',
      'package.json',
      'supabase/migrations/0001_store.sql',
      'tsconfig.json',
    ]);
    // Deterministic archive.
    const a = createWebsiteNextAppExport(input);
    const b = createWebsiteNextAppExport(input);
    expect(a.archiveSha256).toBe(b.archiveSha256);
    expect(a.filename).toBe('curated-store-store-v3.zip');
  });

  it('wires the storefront checkout to the app’s own /api/checkout, not the platform', () => {
    const pages = strFromU8(files()['lib/pages.ts'] ?? new Uint8Array());
    expect(pages).toContain('action=\\"/api/checkout\\"');
    expect(pages).toContain('data-cart-items-json');
    expect(pages).not.toContain('/api/public-sites/');
    expect(pages).not.toContain('/s/');
    // Clean internal links (home is "/").
    expect(pages).toContain('href=\\"/menu\\"');
  });

  it('embeds the product catalogue for server-side re-pricing', () => {
    const products = strFromU8(files()['lib/products.ts'] ?? new Uint8Array());
    expect(products).toContain('"sku": "AN-101"');
    expect(products).toContain('"price": 1280');
    expect(products).toContain('"stock": 0'); // sold-out item is carried through
  });

  it('wires the contact form to the app’s own /api/contact and stores messages', () => {
    const all = files();
    const route = strFromU8(all['app/api/contact/route.ts'] ?? new Uint8Array());
    expect(route).toContain("from('messages')");
    expect(route).toContain('SUPABASE_SERVICE_ROLE_KEY');
    const migration = strFromU8(all['supabase/migrations/0001_store.sql'] ?? new Uint8Array());
    expect(migration).toContain('create table if not exists public.messages');
  });

  it('ships a standalone Supabase migration (no platform tables) and env template', () => {
    const migration = strFromU8(files()['supabase/migrations/0001_store.sql'] ?? new Uint8Array());
    expect(migration).toContain('create table if not exists public.orders');
    expect(migration).toContain('create table if not exists public.inventory');
    expect(migration).toContain('function public.reserve_order_stock');
    expect(migration).not.toContain('tenant_id');
    expect(migration).not.toContain('auth.users');
    expect(migration).not.toContain('is_tenant_member');

    const env = strFromU8(files()['.env.example'] ?? new Uint8Array());
    expect(env).toContain('SUPABASE_URL=');
    expect(env).toContain('SUPABASE_SERVICE_ROLE_KEY=');
  });

  it('includes a customer deployment guide covering Supabase and Vercel', () => {
    const guide = strFromU8(files()['README.md'] ?? new Uint8Array());
    expect(guide).toContain('Supabase');
    expect(guide).toContain('Vercel');
    expect(guide).toContain('0001_store.sql');
    expect(guide).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('has the checkout handler re-price on the server and reserve stock', () => {
    const route = strFromU8(files()['app/api/checkout/route.ts'] ?? new Uint8Array());
    expect(route).toContain("from '@/lib/products'");
    expect(route).toContain('reserve_order_stock');
    expect(route).toContain("from('orders')");
    expect(route).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('produces a source digest that is stable across runs', () => {
    expect(createWebsiteNextAppSource(input).sourceSha256).toBe(
      createWebsiteNextAppSource(input).sourceSha256,
    );
  });

  it('omits member auth files when no page is protected', () => {
    const names = Object.keys(files());
    expect(names).not.toContain('middleware.ts');
    expect(names).not.toContain('app/api/auth/route.ts');
    expect(names).not.toContain('lib/access.ts');
  });

  describe('with member-protected pages (Supabase Auth)', () => {
    const memberInput = {
      ...input,
      access: { protectedSlugs: ['menu'], registrationEnabled: true },
    } as const;
    function memberFiles() {
      return unzipSync(createWebsiteNextAppExport(memberInput).bytes);
    }

    it('adds Supabase Auth files, dependency, and public env vars', () => {
      const all = memberFiles();
      const names = Object.keys(all);
      expect(names).toContain('middleware.ts');
      expect(names).toContain('lib/supabase-server.ts');
      expect(names).toContain('lib/access.ts');
      expect(names).toContain('app/login/route.ts');
      expect(names).toContain('app/api/auth/route.ts');

      const pkg = strFromU8(all['package.json'] ?? new Uint8Array());
      expect(pkg).toContain('@supabase/ssr');
      const env = strFromU8(all['.env.example'] ?? new Uint8Array());
      expect(env).toContain('NEXT_PUBLIC_SUPABASE_URL=');
      expect(env).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY=');
    });

    it('gates the protected page fail-closed via Supabase getUser', () => {
      const all = memberFiles();
      const access = strFromU8(all['lib/access.ts'] ?? new Uint8Array());
      expect(access).toContain('"menu"');
      expect(access).toContain('REGISTRATION_ENABLED = true');

      const pagesRoute = strFromU8(all['app/[[...slug]]/route.ts'] ?? new Uint8Array());
      expect(pagesRoute).toContain('PROTECTED_SLUGS');
      expect(pagesRoute).toContain('auth.getUser');
      expect(pagesRoute).toContain("location: '/login?next='");

      // Uses the customer's Supabase Auth, never hand-rolled password crypto.
      const auth = strFromU8(all['app/api/auth/route.ts'] ?? new Uint8Array());
      expect(auth).toContain('signInWithPassword');
      expect(auth).toContain('signUp');
      expect(auth).not.toContain('scrypt');
      expect(auth).not.toContain('createHash');

      // A "Sign in" account link is added to the storefront nav.
      const pages = strFromU8(all['lib/pages.ts'] ?? new Uint8Array());
      expect(pages).toContain('href=\\"/login\\"');
    });
  });
});
