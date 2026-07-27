import type { Metadata } from 'next';
import Link from 'next/link';

import { ArrowRightIcon, FlowIcon, SettingsIcon, ShieldIcon } from '@/components/icons';
import { LocalizedText } from '@/components/language-provider';

export const metadata: Metadata = {
  title: '設定',
};

const settings = [
  {
    descriptionEn: 'Manage Google Sheets OAuth, health, spreadsheet lists, and revocation.',
    descriptionZhHant: '管理 Google Sheets OAuth、健康狀態、試算表清單與撤銷。',
    href: '/dashboard/settings/connections',
    icon: FlowIcon,
    labelEn: 'Connected services',
    labelZhHant: '外部服務連線',
  },
  {
    descriptionEn: 'Review tenant roles, approval rules, and security boundaries.',
    descriptionZhHant: '檢查租戶角色、核准規則與安全界線。',
    href: '/dashboard/settings',
    icon: ShieldIcon,
    labelEn: 'Security and permissions',
    labelZhHant: '安全與權限',
  },
  {
    descriptionEn: 'Workspace name, time zone, language, and notification preferences.',
    descriptionZhHant: '工作區名稱、時區、語言與通知偏好。',
    href: '/dashboard/settings',
    icon: SettingsIcon,
    labelEn: 'Workspace preferences',
    labelZhHant: '工作區偏好',
  },
] as const;

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-[1120px]">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
        <LocalizedText en="Workspace configuration" zhHant="工作區設定" />
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
        <LocalizedText en="Settings" zhHant="設定" />
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        <LocalizedText
          en="Manage connected services, security boundaries, and workspace preferences."
          zhHant="管理外部服務、安全界線與工作區偏好。"
        />
      </p>

      <section className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {settings.map(
          ({ descriptionEn, descriptionZhHant, href, icon: Icon, labelEn, labelZhHant }, index) => (
            <Link
              className={`group rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                index === 0 ? 'border-indigo-200' : 'border-slate-200'
              }`}
              href={href}
              key={labelEn}
            >
              <span
                className={`grid size-11 place-items-center rounded-xl ${
                  index === 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <Icon className="size-5" />
              </span>
              <h2 className="mt-5 text-base font-semibold text-slate-950">
                <LocalizedText en={labelEn} zhHant={labelZhHant} />
              </h2>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                <LocalizedText en={descriptionEn} zhHant={descriptionZhHant} />
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-indigo-700">
                {index === 0 ? (
                  <LocalizedText en="Manage connections" zhHant="管理連線" />
                ) : (
                  <LocalizedText en="In progress" zhHant="建置中" />
                )}
                <ArrowRightIcon className="size-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ),
        )}
      </section>
    </div>
  );
}
