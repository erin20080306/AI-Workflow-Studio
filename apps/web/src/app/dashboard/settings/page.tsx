import type { Metadata } from 'next';
import Link from 'next/link';

import { ArrowRightIcon, SettingsIcon, ShieldIcon, SparkIcon } from '@/components/icons';

export const metadata: Metadata = {
  title: '設定',
};

const settings = [
  {
    description: '選擇工作流規劃 Provider、檢查可用狀態與用量。',
    href: '/dashboard/settings/ai-models',
    icon: SparkIcon,
    label: 'AI 模型與 Provider',
  },
  {
    description: '檢查租戶角色、核准規則與安全界線。',
    href: '/dashboard/settings',
    icon: ShieldIcon,
    label: '安全與權限',
  },
  {
    description: '工作區名稱、時區、語言與通知偏好。',
    href: '/dashboard/settings',
    icon: SettingsIcon,
    label: '工作區偏好',
  },
] as const;

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-[1120px]">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
        Workspace configuration
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
        設定
      </h1>
      <p className="mt-2 text-sm text-slate-600">管理 Provider、安全界線與工作區偏好。</p>

      <section className="mt-7 grid gap-4 md:grid-cols-3">
        {settings.map(({ description, href, icon: Icon, label }, index) => (
          <Link
            className={`group rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
              index === 0 ? 'border-indigo-200' : 'border-slate-200'
            }`}
            href={href}
            key={label}
          >
            <span
              className={`grid size-11 place-items-center rounded-xl ${
                index === 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
              }`}
            >
              <Icon className="size-5" />
            </span>
            <h2 className="mt-5 text-base font-semibold text-slate-950">{label}</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
            <span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-indigo-700">
              {index === 0 ? '管理 Provider' : 'Phase 13 完成'}
              <ArrowRightIcon className="size-4 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
