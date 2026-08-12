import {
  WebsiteSpecGenerationSchema,
  type WebsiteSpec,
  type WebsiteSpecGeneration,
} from '@ai-workflow-studio/website-schema';
import { createHash } from 'node:crypto';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { z } from 'zod';

import { renderWebsiteSelfHostDocument } from './website-preview-renderer';

export const WEBSITE_NEXT_EXPORT_MAX_FILES = 80;
export const WEBSITE_NEXT_EXPORT_MAX_UNCOMPRESSED_BYTES = 24_000_000;
export const WEBSITE_NEXT_EXPORT_MAX_ARCHIVE_BYTES = 25_000_000;

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

export interface WebsiteNextExportAsset {
  readonly bytes: Uint8Array;
  readonly id: string;
}

export interface WebsiteNextSourceFile {
  readonly bytes: Uint8Array;
  readonly path: string;
  readonly sha256: string;
}

export interface WebsiteNextSource {
  readonly fileCount: number;
  readonly files: readonly WebsiteNextSourceFile[];
  readonly sourceSha256: string;
  readonly uncompressedBytes: number;
}

export interface WebsiteNextExport {
  readonly archiveSha256: string;
  readonly bytes: Uint8Array;
  readonly fileCount: number;
  readonly filename: string;
  readonly uncompressedBytes: number;
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

function addFile(files: Map<string, Uint8Array>, path: string, bytes: Uint8Array): void {
  assertArchivePath(path);
  if (files.has(path)) throw new Error('Website export contains a duplicate archive path.');
  files.set(path, bytes);
}

interface StoreProduct {
  readonly currency?: string;
  readonly name: string;
  readonly price?: number;
  readonly priceLabel?: string;
  readonly sku?: string;
  readonly stock?: number;
}

function collectProducts(spec: WebsiteSpec): StoreProduct[] {
  const products: StoreProduct[] = [];
  for (const page of spec.pages) {
    for (const section of page.sections) {
      if (section.type !== 'product-grid') continue;
      for (const item of section.items) {
        products.push({
          ...(item.currency === undefined ? {} : { currency: item.currency }),
          name: item.name,
          ...(item.price === undefined ? {} : { price: item.price }),
          priceLabel: item.priceLabel,
          ...(item.sku === undefined ? {} : { sku: item.sku }),
          ...(item.stock === undefined ? {} : { stock: item.stock }),
        });
      }
    }
  }
  return products;
}

// --- Fixed, platform-authored app files (never AI/user content). ------------
// String.raw keeps regex backslashes intact; none of these contain `${` or backticks.

const PACKAGE_JSON = (name: string, membersEnabled: boolean): string =>
  `${JSON.stringify(
    {
      name: `${name}-store`,
      private: true,
      scripts: {
        build: 'next build',
        dev: 'next dev',
        start: 'next start',
      },
      dependencies: {
        ...(membersEnabled ? { '@supabase/ssr': '^0.5.2' } : {}),
        '@supabase/supabase-js': '^2.47.10',
        next: '^15.1.6',
        react: '^19.0.0',
        'react-dom': '^19.0.0',
      },
      devDependencies: {
        '@types/node': '^22.10.5',
        '@types/react': '^19.0.7',
        typescript: '^5.7.3',
      },
      version: '1.0.0',
    },
    null,
    2,
  )}\n`;

const NEXT_CONFIG = String.raw`/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
`;

const TSCONFIG = `${JSON.stringify(
  {
    compilerOptions: {
      allowJs: true,
      baseUrl: '.',
      esModuleInterop: true,
      jsx: 'preserve',
      lib: ['dom', 'dom.iterable', 'esnext'],
      module: 'esnext',
      moduleResolution: 'bundler',
      noEmit: true,
      paths: { '@/*': ['./*'] },
      resolveJsonModule: true,
      skipLibCheck: true,
      strict: false,
      target: 'es2022',
    },
    exclude: ['node_modules'],
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
  },
  null,
  2,
)}\n`;

const GITIGNORE = String.raw`node_modules
.next
out
.env
.env.local
.env*.local
.DS_Store
`;

const ENV_EXAMPLE = String.raw`# Your own Supabase project (Settings -> API in the Supabase dashboard).
# Never commit real values. Set these as environment variables in Vercel.
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
# A long random secret you choose; required to open /admin.
ADMIN_TOKEN=
`;

const ADMIN_LIB = String.raw`import { createClient } from '@supabase/supabase-js';
import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase environment variables are not configured.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function digest(value: string): Buffer {
  return createHash('sha256').update(String(value)).digest();
}

export function tokenMatches(provided: string): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return false;
  const a = digest(provided);
  const b = digest(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAdmin(): Promise<boolean> {
  const cookie = (await cookies()).get('store_admin');
  return cookie ? tokenMatches(cookie.value) : false;
}

export function esc(value: any): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
`;

const ADMIN_API_ROUTE = String.raw`import { cookies } from 'next/headers';

import { adminClient, isAdmin, tokenMatches } from '@/lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { location: location } });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const form = await request.formData();
    const action = String(form.get('action') || '');
    if (action === 'login') {
      const provided = String(form.get('token') || '');
      if (tokenMatches(provided)) {
        (await cookies()).set('store_admin', provided, {
          httpOnly: true,
          maxAge: 28800,
          path: '/',
          sameSite: 'lax',
          secure: true,
        });
        return redirect('/admin');
      }
      return redirect('/admin?error=login');
    }
    if (!(await isAdmin())) return redirect('/admin?error=auth');
    if (action === 'logout') {
      (await cookies()).delete('store_admin');
      return redirect('/admin');
    }
    if (action === 'order-status') {
      const id = String(form.get('id') || '');
      const status = String(form.get('status') || '');
      if (['pending', 'paid', 'shipped', 'completed', 'cancelled'].indexOf(status) < 0) {
        return redirect('/admin?error=status');
      }
      await adminClient()
        .from('orders')
        .update({ status: status, updated_at: new Date().toISOString() })
        .eq('id', id);
      return redirect('/admin');
    }
    return redirect('/admin');
  } catch (error) {
    return redirect('/admin?error=server');
  }
}
`;

const ADMIN_PAGE_ROUTE = String.raw`import { adminClient, esc, isAdmin } from '@/lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function shell(body: string): Response {
  const doc =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta content="width=device-width,initial-scale=1" name="viewport"><title>Store admin</title>' +
    '<style>body{font-family:system-ui,sans-serif;background:#f1f5f9;color:#0f172a;margin:0;padding:24px}' +
    '.wrap{max-width:960px;margin:0 auto}h1{font-size:22px}h2{font-size:16px}table{width:100%;border-collapse:collapse;' +
    'background:#fff;border-radius:12px;overflow:hidden;margin-top:10px}th,td{padding:10px 12px;border-bottom:1px solid #e2e8f0;' +
    'text-align:left;font-size:13px;vertical-align:top}button,select,input{font:inherit;padding:6px 10px;border:1px solid #cbd5e1;' +
    'border-radius:8px;background:#fff}.btn{background:#4f46e5;color:#fff;border:0;cursor:pointer}.card{background:#fff;' +
    'border-radius:12px;padding:20px;max-width:380px}</style></head><body><div class="wrap">' +
    body +
    '</div></body></html>';
  return new Response(doc, {
    status: 200,
    headers: { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function GET(request: Request): Promise<Response> {
  const error = new URL(request.url).searchParams.get('error');
  if (!(await isAdmin())) {
    const err = error
      ? '<p style="color:#b91c1c;font-size:13px">Access denied. Check your admin token.</p>'
      : '';
    return shell(
      '<h1>Store admin</h1><div class="card">' +
        err +
        '<form method="post" action="/api/admin"><input type="hidden" name="action" value="login">' +
        '<p style="font-size:13px;color:#475569">Enter your ADMIN_TOKEN (set in Vercel env).</p>' +
        '<input name="token" type="password" placeholder="Admin token" required ' +
        'style="width:100%;box-sizing:border-box;margin:6px 0"><button class="btn" type="submit">Sign in</button></form></div>',
    );
  }
  const supabase = adminClient();
  const ordersResult = await supabase
    .from('orders')
    .select('id, buyer_name, buyer_email, items, currency, subtotal, item_count, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  const messagesResult = await supabase
    .from('messages')
    .select('id, name, email, subject, message, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  const orders = ordersResult.data || [];
  const messages = messagesResult.data || [];
  const statuses = ['pending', 'paid', 'shipped', 'completed', 'cancelled'];
  let rows = '';
  for (let i = 0; i < orders.length; i++) {
    const o: any = orders[i];
    const items = Array.isArray(o.items) ? o.items : [];
    let itemHtml = '';
    for (let j = 0; j < items.length; j++) {
      itemHtml += esc(items[j].name) + ' x' + esc(items[j].quantity) + '<br>';
    }
    let options = '';
    for (let k = 0; k < statuses.length; k++) {
      options +=
        '<option value="' + statuses[k] + '"' + (o.status === statuses[k] ? ' selected' : '') + '>' + statuses[k] + '</option>';
    }
    rows +=
      '<tr><td>' +
      esc(o.buyer_name) +
      '<br><span style="color:#64748b">' +
      esc(o.buyer_email) +
      '</span></td><td>' +
      itemHtml +
      '</td><td>' +
      esc(o.currency) +
      esc(Number(o.subtotal).toLocaleString()) +
      '</td><td><form method="post" action="/api/admin" style="display:flex;gap:6px">' +
      '<input type="hidden" name="action" value="order-status"><input type="hidden" name="id" value="' +
      esc(o.id) +
      '"><select name="status">' +
      options +
      '</select><button class="btn" type="submit">Save</button></form></td></tr>';
  }
  const ordersTable = orders.length
    ? '<table><thead><tr><th>Buyer</th><th>Items</th><th>Subtotal</th><th>Status</th></tr></thead><tbody>' +
      rows +
      '</tbody></table>'
    : '<p style="color:#64748b">No orders yet.</p>';
  let msgRows = '';
  for (let m = 0; m < messages.length; m++) {
    const mg: any = messages[m];
    msgRows +=
      '<tr><td>' +
      esc(mg.name) +
      '<br><span style="color:#64748b">' +
      esc(mg.email) +
      '</span></td><td>' +
      esc(mg.subject) +
      '</td><td>' +
      esc(mg.message) +
      '</td></tr>';
  }
  const msgTable = messages.length
    ? '<table><thead><tr><th>From</th><th>Subject</th><th>Message</th></tr></thead><tbody>' +
      msgRows +
      '</tbody></table>'
    : '<p style="color:#64748b">No messages yet.</p>';
  return shell(
    '<div style="display:flex;justify-content:space-between;align-items:center"><h1>Store admin</h1>' +
      '<form method="post" action="/api/admin"><input type="hidden" name="action" value="logout">' +
      '<button type="submit">Sign out</button></form></div><h2>Orders</h2>' +
      ordersTable +
      '<h2 style="margin-top:28px">Messages</h2>' +
      msgTable,
  );
}
`;

// Extra public env vars needed when member login (Supabase Auth) is enabled.
const ENV_EXAMPLE_MEMBERS = String.raw`
# Member login (Supabase Auth). The anon/publishable key is safe to expose.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
`;

const SUPABASE_SERVER_LIB = String.raw`import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase public environment variables are not configured.');
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(list: any[]) {
        try {
          list.forEach((item) => store.set(item.name, item.value, item.options));
        } catch (error) {
          // Server Components cannot set cookies; middleware refreshes the session.
        }
      },
    },
  });
}
`;

const MIDDLEWARE = String.raw`import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function middleware(request: any) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list: any[]) {
        list.forEach((item) => request.cookies.set(item.name, item.value));
        response = NextResponse.next({ request });
        list.forEach((item) => response.cookies.set(item.name, item.value, item.options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|assets/).*)'],
};
`;

const AUTH_ROUTE = String.raw`import { REGISTRATION_ENABLED } from '@/lib/access';
import { createSupabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function back(target: string | null, error: string | null): Response {
  const location = error ? '/login?error=' + encodeURIComponent(error) : target || '/';
  return new Response(null, { status: 303, headers: { location: location } });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const form = await request.formData();
    const action = String(form.get('action') || '');
    const supabase = await createSupabaseServer();
    if (action === 'logout') {
      await supabase.auth.signOut();
      return back('/', null);
    }
    const email = String(form.get('email') || '')
      .trim()
      .toLowerCase();
    const password = String(form.get('password') || '');
    const next = String(form.get('next') || '/');
    if (email.indexOf('@') < 0 || password.length < 6) {
      return back(null, 'invalid');
    }
    if (action === 'signup') {
      if (!REGISTRATION_ENABLED) return back(null, 'closed');
      const result = await supabase.auth.signUp({ email: email, password: password });
      if (result.error) return back(null, 'signup');
      return back(next, null);
    }
    if (action === 'login') {
      const result = await supabase.auth.signInWithPassword({ email: email, password: password });
      if (result.error) return back(null, 'login');
      return back(next, null);
    }
    return back(null, 'invalid');
  } catch (error) {
    return back(null, 'error');
  }
}
`;

const LOGIN_ROUTE = String.raw`import { REGISTRATION_ENABLED } from '@/lib/access';

export const dynamic = 'force-dynamic';

function esc(value: any): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const next = esc(params.get('next') || '/');
  const error = params.get('error');
  const errorHtml = error
    ? '<p style="color:#b91c1c;font-size:14px">Sign-in failed. Please check your details.</p>'
    : '';
  const field =
    '<input style="width:100%;box-sizing:border-box;margin:6px 0;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px" ';
  const button =
    '<button style="width:100%;margin-top:8px;padding:11px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-weight:700;cursor:pointer" type="submit">';
  const loginForm =
    '<h2 style="margin:0 0 8px">Sign in</h2><form method="post" action="/api/auth">' +
    '<input type="hidden" name="action" value="login"><input type="hidden" name="next" value="' +
    next +
    '">' +
    field +
    'name="email" type="email" placeholder="Email" required>' +
    field +
    'name="password" type="password" placeholder="Password" required minlength="6">' +
    button +
    'Sign in</button></form>';
  const signupForm = REGISTRATION_ENABLED
    ? '<hr style="border:none;border-top:1px solid #e2e8f0;margin:22px 0"><h2 style="margin:0 0 8px">Create account</h2><form method="post" action="/api/auth">' +
      '<input type="hidden" name="action" value="signup"><input type="hidden" name="next" value="' +
      next +
      '">' +
      field +
      'name="email" type="email" placeholder="Email" required>' +
      field +
      'name="password" type="password" placeholder="Password (min 6)" required minlength="6">' +
      button +
      'Sign up</button></form>'
    : '';
  const doc =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta content="width=device-width,initial-scale=1" name="viewport"><title>Sign in</title>' +
    '<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:grid;' +
    'min-height:100vh;margin:0;place-items:center;padding:24px}.card{width:min(400px,100%);border:1px solid #dbe3ee;' +
    'border-radius:24px;background:#fff;padding:28px}a{color:#4f46e5}</style></head><body><main class="card">' +
    errorHtml +
    loginForm +
    signupForm +
    '<p style="margin-top:18px;font-size:12px"><a href="/">Back to site</a></p></main></body></html>';
  return new Response(doc, {
    headers: { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' },
  });
}
`;

const PAGES_ROUTE_MEMBERS = String.raw`import { PROTECTED_SLUGS } from '@/lib/access';
import { PAGES, FIRST_SLUG } from '@/lib/pages';
import { createSupabaseServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: any): Promise<Response> {
  const params = context && context.params ? await context.params : {};
  const slug = Array.isArray(params.slug) ? params.slug : [];
  if (slug.length > 1) return new Response('Not found', { status: 404 });
  const key = slug.length === 0 ? FIRST_SLUG : String(slug[0]);
  const html = (PAGES as Record<string, string>)[key];
  if (!html) return new Response('Not found', { status: 404 });
  if ((PROTECTED_SLUGS as string[]).indexOf(key) >= 0) {
    const supabase = await createSupabaseServer();
    const result = await supabase.auth.getUser();
    if (!result.data || !result.data.user) {
      const target = key === FIRST_SLUG ? '/' : '/' + key;
      return new Response(null, {
        status: 302,
        headers: { location: '/login?next=' + encodeURIComponent(target) },
      });
    }
  }
  return new Response(html, {
    headers: { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' },
  });
}
`;

const SUPABASE_MIGRATION = String.raw`-- Storefront database for a self-hosted AI Workflow Studio export.
-- Run this once against YOUR OWN Supabase project (SQL Editor or supabase db push).

create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_name text not null,
  buyer_email text not null,
  items jsonb not null,
  currency text not null default '',
  subtotal numeric not null default 0,
  item_count integer not null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'shipped', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory (
  sku text primary key,
  sold integer not null default 0 check (sold >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text not null default '',
  message text not null,
  page_slug text not null default '',
  status text not null default 'new' check (status in ('new', 'read', 'archived')),
  created_at timestamptz not null default now()
);

-- Only the server (service_role key) writes these tables; RLS with no policies
-- denies the public anon role while service_role bypasses RLS.
alter table public.orders enable row level security;
alter table public.inventory enable row level security;
alter table public.messages enable row level security;

-- Atomically reserve stock for every line of one order, or fail the whole order.
create or replace function public.reserve_order_stock(p_lines jsonb)
returns void
language plpgsql
as $$
declare
  v_line jsonb;
  v_sku text;
  v_qty integer;
  v_limit integer;
begin
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_sku := v_line->>'sku';
    v_qty := (v_line->>'quantity')::integer;
    v_limit := (v_line->>'stock')::integer;
    if v_sku is null or v_qty < 1 or v_limit < 0 or v_qty > v_limit then
      raise exception 'insufficient stock';
    end if;
    insert into public.inventory (sku, sold) values (v_sku, v_qty)
      on conflict (sku) do update
        set sold = public.inventory.sold + v_qty, updated_at = now()
        where public.inventory.sold + v_qty <= v_limit;
    if not found then
      raise exception 'insufficient stock';
    end if;
  end loop;
end;
$$;
`;

const PAGES_ROUTE = String.raw`import { PAGES, FIRST_SLUG } from '@/lib/pages';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: any): Promise<Response> {
  const params = context && context.params ? await context.params : {};
  const slug = Array.isArray(params.slug) ? params.slug : [];
  if (slug.length > 1) return new Response('Not found', { status: 404 });
  const key = slug.length === 0 ? FIRST_SLUG : String(slug[0]);
  const html = (PAGES as Record<string, string>)[key];
  if (!html) return new Response('Not found', { status: 404 });
  return new Response(html, {
    headers: { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' },
  });
}
`;

const CHECKOUT_ROUTE = String.raw`import { createClient } from '@supabase/supabase-js';

import { PRODUCTS } from '@/lib/products';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'text/html; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

function esc(value: any): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function page(title: string, message: string, status: number): Response {
  const doc =
    '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">' +
    '<meta content="width=device-width,initial-scale=1" name="viewport"><title>' +
    esc(title) +
    '</title><style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;' +
    'display:grid;min-height:100vh;margin:0;place-items:center;padding:24px}.card{max-width:560px;' +
    'border:1px solid #dbe3ee;border-radius:24px;background:#fff;padding:32px}a{display:inline-block;' +
    'margin-top:16px;border-radius:999px;background:#4f46e5;color:#fff;font-weight:700;padding:10px 18px;' +
    'text-decoration:none}</style></head><body><main class="card"><h1>' +
    esc(title) +
    '</h1><p>' +
    esc(message) +
    '</p><a href="/">Back to store</a></main></body></html>';
  return new Response(doc, { status: status, headers: HEADERS });
}

function admin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase environment variables are not configured.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function currencySymbol(label: string): string {
  return String(label)
    .replace(/[\d.,\s].*$/u, '')
    .trim()
    .slice(0, 8);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const length = Number(request.headers.get('content-length'));
    if (!Number.isSafeInteger(length) || length < 1 || length > 32000) {
      return page('Order failed', 'The order request is invalid.', 400);
    }
    const form = await request.formData();
    if (String(form.get('website') || '') !== '') {
      return page('Order failed', 'The order request is invalid.', 400);
    }
    const name = String(form.get('name') || '').trim();
    const email = String(form.get('email') || '')
      .trim()
      .toLowerCase();
    if (name.length < 1 || name.length > 120 || email.length < 3 || email.length > 254 || email.indexOf('@') < 0) {
      return page('Order failed', 'Please provide a valid name and email.', 400);
    }
    let raw: any = null;
    try {
      raw = JSON.parse(String(form.get('items') || ''));
    } catch (error) {
      raw = null;
    }
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > 50) {
      return page('Order failed', 'Your bag is empty or the order is invalid.', 400);
    }

    const items: any[] = [];
    const lines: any[] = [];
    for (const entry of raw) {
      const id = String((entry && entry.id) || '').trim();
      const nm = String((entry && entry.name) || '').trim();
      const quantity = Math.floor(Number(entry && entry.quantity));
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
        return page('Order failed', 'A product quantity is invalid.', 400);
      }
      const product =
        PRODUCTS.find((candidate: any) => candidate.sku && candidate.sku === id) ||
        PRODUCTS.find((candidate: any) => candidate.name === nm);
      if (!product) {
        return page('Order failed', 'A product in the order is no longer available.', 400);
      }
      if (typeof product.stock === 'number' && (product.stock === 0 || quantity > product.stock)) {
        return page('Order failed', 'A product in the order does not have enough stock.', 400);
      }
      const unitPrice = typeof product.price === 'number' ? product.price : 0;
      const currency = product.currency || currencySymbol(product.priceLabel || '');
      items.push({
        currency: currency,
        lineTotal: Math.min(unitPrice * quantity, 1000000000000),
        name: product.name,
        quantity: quantity,
        sku: product.sku,
        unitPrice: unitPrice,
      });
      if (product.sku && typeof product.stock === 'number') {
        lines.push({ quantity: quantity, sku: product.sku, stock: product.stock });
      }
    }
    const subtotal = Math.min(
      items.reduce((sum, item) => sum + item.lineTotal, 0),
      1000000000000,
    );
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const currency = items[0] ? items[0].currency : '';

    const supabase = admin();
    if (lines.length > 0) {
      const reserved = await supabase.rpc('reserve_order_stock', { p_lines: lines });
      if (reserved.error) {
        return page('Order failed', 'A product just sold out. Please review your bag.', 400);
      }
    }
    const inserted = await supabase
      .from('orders')
      .insert({
        buyer_email: email,
        buyer_name: name,
        currency: currency,
        item_count: itemCount,
        items: items,
        subtotal: subtotal,
      })
      .select('id')
      .single();
    if (inserted.error) {
      return page('Order failed', 'The order could not be saved. Please try again.', 500);
    }
    return page(
      'Order received',
      'Thank you. We received your order of ' +
        itemCount +
        ' item(s), subtotal ' +
        currency +
        subtotal.toLocaleString() +
        '.',
      201,
    );
  } catch (error) {
    return page('Order failed', 'Something went wrong. Please try again later.', 500);
  }
}
`;

const CONTACT_ROUTE = String.raw`import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'text/html; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

function esc(value: any): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function page(title: string, message: string, status: number): Response {
  const doc =
    '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">' +
    '<meta content="width=device-width,initial-scale=1" name="viewport"><title>' +
    esc(title) +
    '</title><style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;' +
    'display:grid;min-height:100vh;margin:0;place-items:center;padding:24px}.card{max-width:560px;' +
    'border:1px solid #dbe3ee;border-radius:24px;background:#fff;padding:32px}a{display:inline-block;' +
    'margin-top:16px;border-radius:999px;background:#4f46e5;color:#fff;font-weight:700;padding:10px 18px;' +
    'text-decoration:none}</style></head><body><main class="card"><h1>' +
    esc(title) +
    '</h1><p>' +
    esc(message) +
    '</p><a href="/">Back to site</a></main></body></html>';
  return new Response(doc, { status: status, headers: HEADERS });
}

function admin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase environment variables are not configured.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const length = Number(request.headers.get('content-length'));
    if (!Number.isSafeInteger(length) || length < 1 || length > 16000) {
      return page('Message failed', 'The message request is invalid.', 400);
    }
    const form = await request.formData();
    if (String(form.get('website') || '') !== '') {
      return page('Message failed', 'The message request is invalid.', 400);
    }
    const name = String(form.get('name') || '').trim();
    const email = String(form.get('email') || '')
      .trim()
      .toLowerCase();
    const subject = String(form.get('subject') || '').trim().slice(0, 160);
    const message = String(form.get('message') || '').trim();
    const pageSlug = String(form.get('pageSlug') || '').trim().slice(0, 80);
    if (
      name.length < 1 ||
      name.length > 120 ||
      email.length < 3 ||
      email.length > 254 ||
      email.indexOf('@') < 0 ||
      message.length < 10 ||
      message.length > 2000
    ) {
      return page('Message failed', 'Please complete all fields correctly.', 400);
    }
    const inserted = await admin()
      .from('messages')
      .insert({ email: email, message: message, name: name, page_slug: pageSlug, subject: subject });
    if (inserted.error) {
      return page('Message failed', 'The message could not be saved. Please try again.', 500);
    }
    return page('Message sent', 'Thank you. We received your message.', 201);
  } catch (error) {
    return page('Message failed', 'Something went wrong. Please try again later.', 500);
  }
}
`;

function readme(
  projectName: string,
  version: number,
  locale: 'en' | 'zh-Hant',
  membersEnabled: boolean,
): string {
  if (locale === 'zh-Hant') {
    return [
      `# ${projectName} — 自架商店`,
      '',
      `由 AI Workflow Studio 匯出（版本 v${version}）。這是一個可部署的 Next.js 商店，資料存在**你自己的 Supabase**。`,
      '',
      '## 你需要',
      '- GitHub 帳號（放這份程式碼）',
      '- Vercel 帳號（部署網站）',
      '- Supabase 帳號（當資料庫）',
      '',
      '## 部署步驟',
      '',
      '### 1. 建立你自己的 Supabase 專案',
      '到 https://supabase.com 建立一個專案。',
      '',
      '### 2. 建立資料表',
      '在 Supabase 後台 **SQL Editor** 貼上並執行 `supabase/migrations/0001_store.sql`（或用 Supabase CLI：`supabase db push`）。這會建立 orders 與 inventory 兩張表。',
      '',
      '### 3. 取得連線資訊',
      '在 Supabase 後台 **Settings → API** 取得：',
      '- Project URL',
      '- service_role key（機密，切勿外流或提交進 repo）',
      '',
      '### 4. 部署到 Vercel',
      '把這份程式碼推到你的 GitHub，然後在 https://vercel.com 匯入這個 repo。',
      '',
      '### 5. 設定環境變數（Vercel → Settings → Environment Variables）',
      '```',
      'SUPABASE_URL=你的-project-url',
      'SUPABASE_SERVICE_ROLE_KEY=你的-service-role-key',
      'ADMIN_TOKEN=自訂一組夠長的隨機密碼',
      '```',
      '',
      '### 6. 部署',
      '按下 Deploy。完成後你的商店就上線了，客人下單會寫進你自己的 Supabase。',
      '',
      '## 後台訂單管理',
      '到 `你的網址/admin`，輸入你設定的 `ADMIN_TOKEN` 登入，即可查看訂單、更改出貨狀態（待處理／已付款／已出貨／已完成／已取消）與聯絡訊息。',
      '⚠️ `ADMIN_TOKEN` 請設為一組夠長的隨機字串，並只放在 Vercel 環境變數。',
      '',
      '## 直接看資料（可選）',
      '也可在 Supabase 後台 **Table Editor** 查看：**orders**、**inventory**、**messages**。',
      '',
      '## 注意事項',
      '- `SUPABASE_SERVICE_ROLE_KEY` 是最高權限金鑰，只放 Vercel 環境變數，**不要**提交進 GitHub。',
      '- 商品頁顯示的庫存數字是**匯出當下**的值；防超賣是**即時**的（結帳時會即時檢查你 Supabase 的庫存）。要更新頁面上顯示的數字，重新匯出一次即可。',
      membersEnabled
        ? '- 這份匯出含商店、結帳、聯絡表單與會員登入（Supabase Auth）。'
        : '- 這份匯出含商店、結帳與聯絡表單；會員登入未包含在此版本。',
      '',
      ...(membersEnabled
        ? [
            '## 會員登入（Supabase Auth）',
            '受保護頁面需要登入才能瀏覽，使用你 Supabase 內建的 Auth（不是自製登入）。',
            '1. Supabase 後台 **Authentication → Providers → Email** 啟用（可視需求開關 Confirm email）。',
            '2. 在 Vercel 另外加兩個環境變數（anon／publishable key 可公開）：',
            '```',
            'NEXT_PUBLIC_SUPABASE_URL=你的-project-url',
            'NEXT_PUBLIC_SUPABASE_ANON_KEY=你的-anon-key',
            '```',
            '3. 訪客到 `/login` 註冊／登入；已註冊會員在 Supabase **Authentication → Users** 查看。',
            '⚠️ **上線前請自行測試**：註冊、登入、登出，以及未登入時受保護頁是否確實被導到 `/login`。',
            '',
          ]
        : []),
    ].join('\n');
  }
  return [
    `# ${projectName} — self-hosted store`,
    '',
    `Exported from AI Workflow Studio (version v${version}). A deployable Next.js store whose data lives in **your own Supabase**.`,
    '',
    '## You need',
    '- A GitHub account (to hold this code)',
    '- A Vercel account (to host the site)',
    '- A Supabase account (the database)',
    '',
    '## Steps',
    '',
    '### 1. Create your own Supabase project',
    'Create a project at https://supabase.com.',
    '',
    '### 2. Create the tables',
    'In the Supabase dashboard **SQL Editor**, run `supabase/migrations/0001_store.sql` (or `supabase db push` with the Supabase CLI). It creates the `orders` and `inventory` tables.',
    '',
    '### 3. Get your credentials',
    'In **Settings → API** copy the Project URL and the `service_role` key (secret — never commit it).',
    '',
    '### 4. Deploy to Vercel',
    'Push this code to your GitHub, then import the repo at https://vercel.com.',
    '',
    '### 5. Set environment variables (Vercel → Settings → Environment Variables)',
    '```',
    'SUPABASE_URL=your-project-url',
    'SUPABASE_SERVICE_ROLE_KEY=your-service-role-key',
    'ADMIN_TOKEN=a-long-random-secret-you-choose',
    '```',
    '',
    '### 6. Deploy',
    'Press Deploy. Orders are written to your own Supabase.',
    '',
    '## Order admin',
    'Go to `your-url/admin`, sign in with your `ADMIN_TOKEN`, and manage orders (status: pending / paid / shipped / completed / cancelled) and contact messages. Keep `ADMIN_TOKEN` long, random, and only in Vercel env vars.',
    '',
    '## Notes',
    '- The `service_role` key is a full-access secret: keep it only in Vercel env vars, never in GitHub.',
    '- Displayed stock reflects the export time; oversell protection is live at checkout. Re-export to refresh displayed numbers.',
    '',
    ...(membersEnabled
      ? [
          '## Member login (Supabase Auth)',
          'Protected pages require sign-in, using your Supabase built-in Auth (not custom auth).',
          '1. In Supabase, enable **Authentication → Providers → Email**.',
          '2. Add two more env vars in Vercel (the anon/publishable key is safe to expose):',
          '```',
          'NEXT_PUBLIC_SUPABASE_URL=your-project-url',
          'NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key',
          '```',
          '3. Visitors sign up / sign in at `/login`; members appear under Supabase **Authentication → Users**.',
          '⚠️ **Verify before launch**: sign-up, sign-in, sign-out, and that a signed-out visitor is redirected to `/login` on protected pages.',
          '',
        ]
      : []),
  ].join('\n');
}

export interface WebsiteNextExportAccess {
  readonly protectedSlugs: readonly string[];
  readonly registrationEnabled: boolean;
}

export function createWebsiteNextAppSource(input: {
  readonly access?: WebsiteNextExportAccess;
  readonly assets: readonly WebsiteNextExportAsset[];
  readonly generation: WebsiteSpecGeneration;
  readonly project: { readonly id: string; readonly name: string; readonly slug: string };
}): WebsiteNextSource {
  const project = ExportProjectSchema.parse(input.project);
  const generation = WebsiteSpecGenerationSchema.parse(input.generation);
  const spec = generation.spec;
  const assetBytes = new Map(input.assets.map((asset) => [asset.id, asset.bytes] as const));
  const referencedAssets = spec.assets.filter((asset) => asset.kind === 'project-asset');
  const files = new Map<string, Uint8Array>();
  const exportAssetUrls = new Map<string, string>();

  for (const asset of referencedAssets) {
    const bytes = assetBytes.get(asset.id);
    if (bytes === undefined) throw new Error(`Website export asset ${asset.id} is unavailable.`);
    assertPng(bytes, asset.id);
    exportAssetUrls.set(asset.id, `assets/${asset.id}.png`);
    addFile(files, `public/assets/${asset.id}.png`, bytes);
  }

  const firstSlug = spec.pages[0]?.slug ?? 'home';
  const pageSlugs = new Set(spec.pages.map((page) => page.slug));
  const protectedSlugs = [...new Set(input.access?.protectedSlugs ?? [])].filter((slug) =>
    pageSlugs.has(slug),
  );
  const membersEnabled = protectedSlugs.length > 0;
  const registrationEnabled = input.access?.registrationEnabled ?? false;
  const pages: Record<string, string> = {};
  for (const page of spec.pages) {
    pages[page.slug] =
      `${renderWebsiteSelfHostDocument(spec, page.slug, exportAssetUrls, membersEnabled)}\n`;
  }

  addFile(files, 'package.json', textFile(PACKAGE_JSON(project.slug, membersEnabled)));
  addFile(files, 'next.config.mjs', textFile(NEXT_CONFIG));
  addFile(files, 'tsconfig.json', textFile(TSCONFIG));
  addFile(files, '.gitignore', textFile(GITIGNORE));
  addFile(
    files,
    '.env.example',
    textFile(membersEnabled ? ENV_EXAMPLE + ENV_EXAMPLE_MEMBERS : ENV_EXAMPLE),
  );
  addFile(
    files,
    'README.md',
    textFile(readme(project.name, generation.version, spec.locale, membersEnabled)),
  );
  addFile(
    files,
    'lib/products.ts',
    textFile(
      `export interface Product {\n  sku?: string;\n  name: string;\n  price?: number;\n  priceLabel?: string;\n  currency?: string;\n  stock?: number;\n}\n\nexport const PRODUCTS: Product[] = ${JSON.stringify(
        collectProducts(spec),
        null,
        2,
      )};\n`,
    ),
  );
  addFile(
    files,
    'lib/pages.ts',
    textFile(
      `export const FIRST_SLUG = ${JSON.stringify(firstSlug)};\n\nexport const PAGES: Record<string, string> = ${JSON.stringify(
        pages,
        null,
        2,
      )};\n`,
    ),
  );
  addFile(
    files,
    'app/[[...slug]]/route.ts',
    textFile(membersEnabled ? PAGES_ROUTE_MEMBERS : PAGES_ROUTE),
  );
  addFile(files, 'app/api/checkout/route.ts', textFile(CHECKOUT_ROUTE));
  addFile(files, 'app/api/contact/route.ts', textFile(CONTACT_ROUTE));
  addFile(files, 'lib/admin.ts', textFile(ADMIN_LIB));
  addFile(files, 'app/admin/route.ts', textFile(ADMIN_PAGE_ROUTE));
  addFile(files, 'app/api/admin/route.ts', textFile(ADMIN_API_ROUTE));
  addFile(files, 'supabase/migrations/0001_store.sql', textFile(SUPABASE_MIGRATION));

  if (membersEnabled) {
    addFile(files, 'middleware.ts', textFile(MIDDLEWARE));
    addFile(files, 'lib/supabase-server.ts', textFile(SUPABASE_SERVER_LIB));
    addFile(
      files,
      'lib/access.ts',
      textFile(
        `export const PROTECTED_SLUGS: string[] = ${JSON.stringify(
          protectedSlugs,
        )};\n\nexport const REGISTRATION_ENABLED = ${registrationEnabled ? 'true' : 'false'};\n`,
      ),
    );
    addFile(files, 'app/login/route.ts', textFile(LOGIN_ROUTE));
    addFile(files, 'app/api/auth/route.ts', textFile(AUTH_ROUTE));
  }

  const manifest = textFile(
    `${JSON.stringify(
      {
        entrypoint: 'app/[[...slug]]/route.ts',
        exportFormat: 'ai-workflow-studio-nextjs-store',
        membersEnabled,
        pages: spec.pages.map((page) => page.slug),
        project: { id: project.id, name: project.name, slug: project.slug },
        requiresEnv: [
          'SUPABASE_URL',
          'SUPABASE_SERVICE_ROLE_KEY',
          'ADMIN_TOKEN',
          ...(membersEnabled ? ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] : []),
        ],
        schemaVersion: 1,
        version: { name: generation.versionName, number: generation.version },
      },
      null,
      2,
    )}\n`,
  );
  addFile(files, 'manifest.json', manifest);

  const integrity = textFile(
    `${[...files.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, bytes]) => `${sha256(bytes)}  ${path}`)
      .join('\n')}\n`,
  );
  addFile(files, 'integrity.sha256', integrity);

  if (files.size > WEBSITE_NEXT_EXPORT_MAX_FILES) {
    throw new Error('Website export exceeds the file-count limit.');
  }
  const uncompressedBytes = [...files.values()].reduce(
    (total, bytes) => total + bytes.byteLength,
    0,
  );
  if (uncompressedBytes > WEBSITE_NEXT_EXPORT_MAX_UNCOMPRESSED_BYTES) {
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

export function createWebsiteNextAppExport(input: {
  readonly access?: WebsiteNextExportAccess;
  readonly assets: readonly WebsiteNextExportAsset[];
  readonly generation: WebsiteSpecGeneration;
  readonly project: { readonly id: string; readonly name: string; readonly slug: string };
}): WebsiteNextExport {
  const source = createWebsiteNextAppSource(input);
  const zipInput: Zippable = {};
  for (const file of source.files) {
    zipInput[file.path] = [
      file.bytes,
      { attrs: 0o644 << 16, level: 9, mtime: FIXED_ZIP_MTIME, os: 3 },
    ];
  }
  const bytes = zipSync(zipInput, { level: 9, mtime: FIXED_ZIP_MTIME });
  if (bytes.byteLength > WEBSITE_NEXT_EXPORT_MAX_ARCHIVE_BYTES) {
    throw new Error('Website export exceeds the compressed byte limit.');
  }
  return {
    archiveSha256: sha256(bytes),
    bytes,
    fileCount: source.fileCount,
    filename: `${input.project.slug}-store-v${input.generation.version}.zip`,
    uncompressedBytes: source.uncompressedBytes,
  };
}
