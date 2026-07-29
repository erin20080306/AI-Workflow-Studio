'use client';

import {
  WebsiteSiteAccessDashboardSchema,
  WebsiteSiteMemberStatusSchema,
  WebsiteSiteRoleSchema,
  type WebsiteSiteAccessDashboard,
  type WebsiteSiteRole,
} from '@ai-workflow-studio/website-schema';
import { useState } from 'react';
import { z } from 'zod';

import { useLanguage } from '@/components/language-provider';

const ResponseSchema = z.object({ access: WebsiteSiteAccessDashboardSchema }).strict();

const copy = {
  en: {
    active: 'Active',
    apply: 'Apply safe suggestions',
    confirm: 'I reviewed every page and explicitly approve this registration and access matrix.',
    error: 'Site access could not be updated.',
    intro:
      'Pages remain public unless a required role is selected. AI suggestions never activate protection until you review and save the complete matrix.',
    lastReviewed: 'Last reviewed',
    manager: 'Manager',
    member: 'Member',
    members: 'Site members',
    noMembers: 'No site members yet.',
    openRegistration: 'Allow public registration',
    page: 'Page',
    public: 'Public',
    required: 'Required role',
    save: 'Save reviewed access matrix',
    saved: 'Site access updated.',
    staff: 'Staff',
    status: 'Status',
    suspended: 'Suspended',
    title: 'Registration and protected pages',
  },
  'zh-Hant': {
    active: '啟用',
    apply: '套用安全建議',
    confirm: '我已逐頁檢查，並明確同意此註冊設定與完整存取矩陣。',
    error: '無法更新網站存取權限。',
    intro: '未選擇角色的頁面維持公開。AI 安全建議不會自動開啟保護，必須由你檢查完整矩陣後儲存。',
    lastReviewed: '最後審查',
    manager: '管理者',
    member: '會員',
    members: '網站會員',
    noMembers: '目前沒有網站會員。',
    openRegistration: '開放訪客註冊',
    page: '頁面',
    public: '公開',
    required: '最低角色',
    save: '儲存已審查存取矩陣',
    saved: '網站存取權限已更新。',
    staff: '工作人員',
    status: '狀態',
    suspended: '停權',
    title: '會員註冊與受保護頁面',
  },
} as const;

export function WebsiteAccessPanel({
  canManage,
  initialAccess,
  projectId,
}: Readonly<{
  canManage: boolean;
  initialAccess: WebsiteSiteAccessDashboard;
  projectId: string;
}>) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const [access, setAccess] = useState(initialAccess);
  const [registrationEnabled, setRegistrationEnabled] = useState(initialAccess.registrationEnabled);
  const [rules, setRules] = useState(
    initialAccess.rules.map((rule) => ({
      pageSlug: rule.pageSlug,
      requiredRole: rule.requiredRole,
    })),
  );
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string>();

  async function mutate(input: Readonly<Record<string, unknown>>): Promise<void> {
    setSaving(true);
    setNotice(undefined);
    try {
      const response = await fetch(`/api/websites/${projectId}/access`, {
        body: JSON.stringify(input),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      });
      const parsed = ResponseSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) throw new Error('Invalid site access response.');
      setAccess(parsed.data.access);
      setRegistrationEnabled(parsed.data.access.registrationEnabled);
      setRules(
        parsed.data.access.rules.map((rule) => ({
          pageSlug: rule.pageSlug,
          requiredRole: rule.requiredRole,
        })),
      );
      setConfirmed(false);
      setNotice(text.saved);
    } catch {
      setNotice(text.error);
    } finally {
      setSaving(false);
    }
  }

  function roleLabel(role: WebsiteSiteRole | null): string {
    return role === null ? text.public : text[role];
  }

  return (
    <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">
        Identity · RBAC
      </p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">{text.title}</h2>
      <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600">{text.intro}</p>
      {access.reviewedAt === null ? null : (
        <p className="mt-2 text-xs text-slate-400">
          {text.lastReviewed} · {new Date(access.reviewedAt).toLocaleString()}
        </p>
      )}

      {notice === undefined ? null : (
        <p
          aria-live="polite"
          className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-900"
        >
          {notice}
        </p>
      )}

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-3 text-sm font-semibold text-slate-800">
              <input
                checked={registrationEnabled}
                disabled={!canManage}
                onChange={(event) => {
                  setRegistrationEnabled(event.target.checked);
                  setConfirmed(false);
                }}
                type="checkbox"
              />
              {text.openRegistration}
            </label>
            <button
              className="rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
              disabled={!canManage || access.rules.length === 0}
              onClick={() => {
                setRules(
                  access.rules.map((rule) => ({
                    pageSlug: rule.pageSlug,
                    requiredRole: rule.suggestedRole,
                  })),
                );
                setConfirmed(false);
              }}
              type="button"
            >
              {text.apply}
            </button>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid grid-cols-[minmax(0,1fr)_170px] bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500">
              <span>{text.page}</span>
              <span>{text.required}</span>
            </div>
            {access.rules.map((rule) => {
              const selected =
                rules.find((candidate) => candidate.pageSlug === rule.pageSlug)?.requiredRole ??
                null;
              return (
                <div
                  className="grid grid-cols-[minmax(0,1fr)_170px] items-center border-t border-slate-200 px-4 py-3"
                  key={rule.pageSlug}
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{rule.pageTitle}</p>
                    <p className="font-mono text-[10px] text-slate-400">/{rule.pageSlug}</p>
                  </div>
                  <select
                    aria-label={`${rule.pageTitle} ${text.required}`}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    disabled={!canManage}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRules((current) =>
                        current.map((candidate) =>
                          candidate.pageSlug === rule.pageSlug
                            ? {
                                ...candidate,
                                requiredRole:
                                  value === '' ? null : WebsiteSiteRoleSchema.parse(value),
                              }
                            : candidate,
                        ),
                      );
                      setConfirmed(false);
                    }}
                    value={selected ?? ''}
                  >
                    <option value="">{text.public}</option>
                    <option value="member">{text.member}</option>
                    <option value="staff">{text.staff}</option>
                    <option value="manager">{text.manager}</option>
                  </select>
                  <span className="sr-only">{roleLabel(selected)}</span>
                </div>
              );
            })}
          </div>

          <label className="mt-5 flex items-start gap-3 text-sm font-semibold leading-6 text-slate-800">
            <input
              checked={confirmed}
              disabled={!canManage || access.rules.length === 0}
              onChange={(event) => setConfirmed(event.target.checked)}
              type="checkbox"
            />
            {text.confirm}
          </label>
          <button
            className="mt-4 w-full rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
            disabled={!canManage || !confirmed || saving || access.rules.length === 0}
            onClick={() =>
              void mutate({
                action: 'save-matrix',
                confirmed: true,
                registrationEnabled,
                rules,
              })
            }
            type="button"
          >
            {text.save}
          </button>
        </div>

        <div>
          <h3 className="text-base font-semibold text-slate-950">{text.members}</h3>
          <div className="mt-3 space-y-3">
            {access.members.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">{text.noMembers}</p>
            ) : (
              access.members.map((member) => (
                <article className="rounded-2xl border border-slate-200 p-4" key={member.id}>
                  <p className="font-semibold text-slate-950">{member.displayName}</p>
                  <p className="mt-1 break-all text-xs text-slate-500">{member.email}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <select
                      aria-label={`${member.displayName} role`}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs"
                      disabled={!canManage || saving}
                      onChange={(event) =>
                        void mutate({
                          action: 'update-member',
                          memberId: member.id,
                          role: WebsiteSiteRoleSchema.parse(event.target.value),
                          status: member.status,
                        })
                      }
                      value={member.role}
                    >
                      <option value="member">{text.member}</option>
                      <option value="staff">{text.staff}</option>
                      <option value="manager">{text.manager}</option>
                    </select>
                    <select
                      aria-label={`${member.displayName} ${text.status}`}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs"
                      disabled={!canManage || saving}
                      onChange={(event) =>
                        void mutate({
                          action: 'update-member',
                          memberId: member.id,
                          role: member.role,
                          status: WebsiteSiteMemberStatusSchema.parse(event.target.value),
                        })
                      }
                      value={member.status}
                    >
                      <option value="active">{text.active}</option>
                      <option value="suspended">{text.suspended}</option>
                    </select>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
