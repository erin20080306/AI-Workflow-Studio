'use client';

import {
  WebsiteAdminDashboardSchema,
  type WebsiteAdminDashboard as WebsiteAdminDashboardValue,
  type WebsiteDataDashboard,
  type WebsiteOrderStatus,
  type WebsiteSiteAccessDashboard,
  type WebsiteSubmissionStatus,
} from '@ai-workflow-studio/website-schema';

const ORDER_STATUSES: readonly WebsiteOrderStatus[] = [
  'pending',
  'paid',
  'shipped',
  'completed',
  'cancelled',
];

const orderStatusText: Readonly<
  Record<'en' | 'zh-Hant', Readonly<Record<WebsiteOrderStatus, string>>>
> = {
  en: {
    cancelled: 'Cancelled',
    completed: 'Completed',
    paid: 'Paid',
    pending: 'Pending',
    shipped: 'Shipped',
  },
  'zh-Hant': {
    cancelled: '已取消',
    completed: '已完成',
    paid: '已付款',
    pending: '待處理',
    shipped: '已出貨',
  },
};
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { z } from 'zod';

import { useLanguage } from '@/components/language-provider';
import { WebsiteAccessPanel } from '@/components/sites/website-access-panel';
import { WebsiteDataPanel } from '@/components/sites/website-data-panel';

const DashboardResponseSchema = z.object({ dashboard: WebsiteAdminDashboardSchema }).strict();

const copy = {
  en: {
    back: 'Back to Canvas',
    access: 'Users & access',
    content: 'Content',
    contentBody: 'Body',
    contentHelp:
      'Published entries appear on the selected public page. Draft entries remain private.',
    contentKey: 'Stable content key',
    contentTitle: 'Title',
    createContent: 'Create or update content',
    data: 'Data & forms',
    emptyContent: 'No managed content yet.',
    emptyInbox: 'No contact messages yet.',
    error: 'The website backend could not be updated.',
    inbox: 'Inbox',
    intro:
      'Manage durable site content and visitor contact messages without exposing credentials or executable code.',
    keyHint: 'Lowercase letters, numbers, and hyphens.',
    latest: 'Latest activity',
    live: 'Open public site',
    message: 'Message',
    modules: 'Backend modules',
    modulesBody:
      'CMS, contact inbox, storefront orders, site access, reviewed collections, public/protected forms, and safe server actions are live. Uploads and analytics remain separate tested modules.',
    name: 'Name',
    newCount: 'New messages',
    emptyOrders: 'No orders yet.',
    openOrders: 'Open orders',
    orderItems: 'Items',
    orders: 'Orders',
    resetInventory: 'Reset stock counts',
    resetInventoryHint: 'Restores every product’s shown stock to its published level.',
    subtotal: 'Subtotal',
    totalOrders: 'Orders',
    page: 'Target page',
    private: 'Private website admin',
    project: 'Website backend',
    publish: 'Published',
    save: 'Save content',
    saved: 'Website backend updated.',
    settings: 'Settings',
    status: 'Status',
    subject: 'Subject',
    totalContent: 'Content entries',
    totalMessages: 'Messages',
    viewer: 'Viewer access is read-only.',
  },
  'zh-Hant': {
    back: '返回 Canvas',
    access: '會員與權限',
    content: '內容管理',
    contentBody: '內容本文',
    contentHelp: '設為已發布後會顯示在指定的公開頁面；草稿只留在網站後台。',
    contentKey: '穩定內容代稱',
    contentTitle: '內容標題',
    createContent: '建立或更新內容',
    data: '資料與表單',
    emptyContent: '目前沒有後台管理內容。',
    emptyInbox: '目前沒有聯絡訊息。',
    error: '無法更新網站後台，請稍後再試。',
    inbox: '聯絡收件匣',
    intro: '管理網站持久內容與訪客聯絡訊息，不會向瀏覽器公開憑證或可執行程式碼。',
    keyHint: '僅限小寫英文字母、數字與連字號。',
    latest: '最新動態',
    live: '開啟公開網站',
    message: '訊息內容',
    modules: '後台模組',
    modulesBody:
      'CMS、聯絡收件匣、商店訂單、網站會員、經審核資料集合、公開／受保護表單與安全伺服器動作已可使用；檔案與分析會在完成獨立測試後加入。',
    name: '姓名',
    newCount: '未讀訊息',
    emptyOrders: '目前沒有訂單。',
    openOrders: '待處理訂單',
    orderItems: '商品',
    orders: '訂單',
    resetInventory: '重設庫存已售數',
    resetInventoryHint: '將每項商品顯示的庫存還原為發布時的數量。',
    subtotal: '小計',
    totalOrders: '訂單數',
    page: '顯示頁面',
    private: '網站私人後台',
    project: '網站後台',
    publish: '發布內容',
    save: '儲存內容',
    saved: '網站後台已更新。',
    settings: '後台設定',
    status: '狀態',
    subject: '主旨',
    totalContent: '內容筆數',
    totalMessages: '訊息總數',
    viewer: '檢視者權限為唯讀。',
  },
} as const;

type Tab = 'access' | 'content' | 'data' | 'inbox' | 'orders' | 'settings';

export function WebsiteAdminDashboard({
  canManage,
  canManageAccess,
  initialAccess,
  initialData,
  initialDashboard,
  pages,
  projectId,
  projectName,
  publicUrl,
}: Readonly<{
  canManage: boolean;
  canManageAccess: boolean;
  initialAccess: WebsiteSiteAccessDashboard;
  initialData: WebsiteDataDashboard;
  initialDashboard: WebsiteAdminDashboardValue;
  pages: readonly { readonly slug: string; readonly title: string }[];
  projectId: string;
  projectName: string;
  publicUrl?: string;
}>) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [tab, setTab] = useState<Tab>('content');
  const [contentKey, setContentKey] = useState('news');
  const [pageSlug, setPageSlug] = useState(pages[0]?.slug ?? 'home');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string>();
  const newMessages = useMemo(
    () => dashboard.submissions.filter((submission) => submission.status === 'new').length,
    [dashboard.submissions],
  );
  const openOrders = useMemo(
    () =>
      dashboard.orders.filter(
        (order) => order.status !== 'completed' && order.status !== 'cancelled',
      ).length,
    [dashboard.orders],
  );

  async function mutate(input: Readonly<Record<string, unknown>>): Promise<boolean> {
    setSaving(true);
    setNotice(undefined);
    try {
      const response = await fetch(`/api/websites/${projectId}/admin`, {
        body: JSON.stringify(input),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      });
      const parsed = DashboardResponseSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) throw new Error('Invalid website admin response.');
      setDashboard(parsed.data.dashboard);
      setNotice(text.saved);
      return true;
    } catch {
      setNotice(text.error);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveContent(): Promise<void> {
    const saved = await mutate({
      action: 'upsert-content',
      body,
      contentKey,
      pageSlug,
      status: published ? 'published' : 'draft',
      title,
    });
    if (saved) {
      setTitle('');
      setBody('');
    }
  }

  async function updateSubmission(
    submissionId: string,
    status: WebsiteSubmissionStatus,
  ): Promise<void> {
    await mutate({ action: 'update-submission', status, submissionId });
  }

  async function updateOrder(orderId: string, status: WebsiteOrderStatus): Promise<void> {
    await mutate({ action: 'update-order-status', orderId, status });
  }

  const tabLabels: Readonly<Record<Tab, string>> = {
    access: text.access,
    content: text.content,
    data: text.data,
    inbox: `${text.inbox}${newMessages > 0 ? ` (${newMessages})` : ''}`,
    orders: `${text.orders}${openOrders > 0 ? ` (${openOrders})` : ''}`,
    settings: text.settings,
  };

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="text-xs font-semibold text-slate-500 hover:text-indigo-700"
          href={`/dashboard/sites/${projectId}`}
        >
          ← {text.back}
        </Link>
        {publicUrl === undefined ? null : (
          <a
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800"
            href={publicUrl}
            rel="noreferrer"
            target="_blank"
          >
            {text.live} ↗
          </a>
        )}
      </div>

      <section className="mt-5 overflow-hidden rounded-[32px] bg-slate-950 p-6 text-white sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
          {text.private}
        </p>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              {projectName} · {text.project}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">{text.intro}</p>
          </div>
          {!canManage ? (
            <span className="rounded-full bg-amber-300/15 px-3 py-1.5 text-xs font-semibold text-amber-200">
              {text.viewer}
            </span>
          ) : null}
        </div>
        <dl className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [text.totalContent, dashboard.contentEntries.length],
            [text.totalMessages, dashboard.submissions.length],
            [text.totalOrders, dashboard.orders.length],
            [text.openOrders, openOrders],
          ].map(([label, value]) => (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4" key={label}>
              <dt className="text-xs text-slate-400">{label}</dt>
              <dd className="mt-2 text-3xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        {(Object.keys(tabLabels) as readonly Tab[]).map((value) => (
          <button
            className={`rounded-full px-4 py-2.5 text-sm font-semibold ${
              tab === value
                ? 'bg-indigo-600 text-white'
                : 'border border-slate-300 bg-white text-slate-700'
            }`}
            key={value}
            onClick={() => setTab(value)}
            type="button"
          >
            {tabLabels[value]}
          </button>
        ))}
      </div>

      {notice === undefined ? null : (
        <p
          aria-live="polite"
          className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-900"
        >
          {notice}
        </p>
      )}

      {tab === 'content' ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-xl font-semibold text-slate-950">{text.createContent}</h2>
            <p className="mt-2 text-xs leading-6 text-slate-500">{text.contentHelp}</p>
            <div className="mt-5 space-y-4">
              <label className="block text-xs font-semibold text-slate-700">
                {text.contentKey}
                <input
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 font-mono text-sm"
                  disabled={!canManage}
                  maxLength={80}
                  onChange={(event) =>
                    setContentKey(
                      event.target.value
                        .toLowerCase()
                        .replaceAll(/[^a-z0-9-]/g, '')
                        .replaceAll(/^-+/g, ''),
                    )
                  }
                  value={contentKey}
                />
                <span className="mt-1 block font-normal text-slate-400">{text.keyHint}</span>
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                {text.page}
                <select
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                  disabled={!canManage}
                  onChange={(event) => setPageSlug(event.target.value)}
                  value={pageSlug}
                >
                  {pages.map((page) => (
                    <option key={page.slug} value={page.slug}>
                      {page.title} · /{page.slug}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                {text.contentTitle}
                <input
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"
                  disabled={!canManage}
                  maxLength={120}
                  onChange={(event) => setTitle(event.target.value)}
                  value={title}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                {text.contentBody}
                <textarea
                  className="mt-1.5 min-h-44 w-full resize-y rounded-xl border border-slate-300 px-3 py-3 text-sm leading-6"
                  disabled={!canManage}
                  maxLength={8_000}
                  onChange={(event) => setBody(event.target.value)}
                  value={body}
                />
              </label>
              <label className="flex items-center gap-3 text-sm font-semibold text-slate-800">
                <input
                  checked={published}
                  disabled={!canManage}
                  onChange={(event) => setPublished(event.target.checked)}
                  type="checkbox"
                />
                {text.publish}
              </label>
              <button
                className="w-full rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
                disabled={
                  !canManage ||
                  saving ||
                  contentKey.length < 2 ||
                  title.trim().length < 1 ||
                  body.trim().length < 1 ||
                  pages.length === 0
                }
                onClick={() => void saveContent()}
                type="button"
              >
                {text.save}
              </button>
            </div>
          </section>
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-xl font-semibold text-slate-950">{text.latest}</h2>
            <div className="mt-5 space-y-3">
              {dashboard.contentEntries.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
                  {text.emptyContent}
                </p>
              ) : (
                dashboard.contentEntries.map((entry) => (
                  <article className="rounded-2xl border border-slate-200 p-4" key={entry.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-slate-950">{entry.title}</h3>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${entry.status === 'published' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}
                      >
                        {entry.status}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-3 whitespace-pre-line text-xs leading-6 text-slate-600">
                      {entry.body}
                    </p>
                    <p className="mt-3 font-mono text-[10px] text-slate-400">
                      /{entry.pageSlug} · {entry.contentKey}
                    </p>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}

      {tab === 'inbox' ? (
        <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-xl font-semibold text-slate-950">{text.inbox}</h2>
          <div className="mt-5 space-y-4">
            {dashboard.submissions.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
                {text.emptyInbox}
              </p>
            ) : (
              dashboard.submissions.map((submission) => (
                <article className="rounded-2xl border border-slate-200 p-5" key={submission.id}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-slate-950">
                        {submission.subject || text.message}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {submission.name} · {submission.email}
                      </p>
                    </div>
                    <label className="text-xs font-semibold text-slate-500">
                      {text.status}
                      <select
                        className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
                        disabled={!canManage || saving}
                        onChange={(event) =>
                          void updateSubmission(
                            submission.id,
                            event.target.value as WebsiteSubmissionStatus,
                          )
                        }
                        value={submission.status}
                      >
                        <option value="new">new</option>
                        <option value="read">read</option>
                        <option value="archived">archived</option>
                      </select>
                    </label>
                  </div>
                  <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-700">
                    {submission.message}
                  </p>
                  <p className="mt-3 text-[10px] text-slate-400">
                    /{submission.pageSlug} · {new Date(submission.createdAt).toLocaleString()}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}

      {tab === 'orders' ? (
        <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-950">{text.orders}</h2>
            <div className="text-right">
              <button
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                disabled={!canManage || saving}
                onClick={() => void mutate({ action: 'reset-inventory' })}
                type="button"
              >
                {text.resetInventory}
              </button>
              <p className="mt-1 max-w-xs text-[10px] leading-4 text-slate-400">
                {text.resetInventoryHint}
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-4">
            {dashboard.orders.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
                {text.emptyOrders}
              </p>
            ) : (
              dashboard.orders.map((order) => (
                <article className="rounded-2xl border border-slate-200 p-5" key={order.id}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-slate-950">
                        {order.buyerName} · {order.currency}
                        {order.subtotal.toLocaleString()}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">{order.buyerEmail}</p>
                    </div>
                    <label className="text-xs font-semibold text-slate-500">
                      {text.status}
                      <select
                        className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
                        disabled={!canManage || saving}
                        onChange={(event) =>
                          void updateOrder(order.id, event.target.value as WebsiteOrderStatus)
                        }
                        value={order.status}
                      >
                        {ORDER_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {orderStatusText[locale][status]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <ul className="mt-4 space-y-1 text-sm text-slate-700">
                    {order.items.map((item, index) => (
                      <li className="flex justify-between gap-4" key={`${order.id}-${index}`}>
                        <span>
                          {item.name}
                          {item.sku === undefined ? '' : ` · ${item.sku}`} × {item.quantity}
                        </span>
                        <span className="tabular-nums text-slate-500">
                          {item.currency}
                          {item.lineTotal.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[10px] text-slate-400">
                    {text.orderItems}: {order.itemCount} · /{order.pageSlug} ·{' '}
                    {new Date(order.createdAt).toLocaleString()}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}

      {tab === 'access' ? (
        <WebsiteAccessPanel
          canManage={canManageAccess}
          initialAccess={initialAccess}
          projectId={projectId}
        />
      ) : null}

      {tab === 'data' ? (
        <WebsiteDataPanel
          canManage={canManage}
          initialDashboard={initialData}
          pages={pages}
          projectId={projectId}
        />
      ) : null}

      {tab === 'settings' ? (
        <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">
            {text.modules}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">{text.settings}</h2>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600">{text.modulesBody}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              'CMS · active',
              'Contact inbox · active',
              'Storefront orders · active',
              'Members & protected pages · active',
              'Collections, forms & safe actions · active',
              'Files · planned',
              'Analytics · planned',
            ].map((module) => (
              <div
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-800"
                key={module}
              >
                {module}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
