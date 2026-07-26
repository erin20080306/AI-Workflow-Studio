'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { DashboardIcon, DeviceIcon, FlowIcon, RunsIcon, SettingsIcon, ShieldIcon } from './icons';
import { useLanguage } from './language-provider';

const workspaceNavigation = [
  { en: 'Overview', href: '/dashboard', icon: DashboardIcon, zhHant: '總覽' },
  { en: 'Workflows', href: '/dashboard/workflows', icon: FlowIcon, zhHant: '工作流' },
  { en: 'Runs', href: '/dashboard/runs', icon: RunsIcon, zhHant: '執行紀錄' },
  { en: 'Devices', href: '/dashboard/devices', icon: DeviceIcon, zhHant: '裝置' },
  { en: 'Settings', href: '/dashboard/settings', icon: SettingsIcon, zhHant: '設定' },
] as const;

export function DashboardNavigation({
  platformAdmin,
}: Readonly<{
  platformAdmin: boolean;
}>) {
  const pathname = usePathname();
  const { locale } = useLanguage();
  const navigation = platformAdmin
    ? [
        ...workspaceNavigation,
        { en: 'Platform Admin', href: '/admin', icon: ShieldIcon, zhHant: '平台管理' } as const,
      ]
    : workspaceNavigation;

  return (
    <nav
      aria-label="Dashboard navigation"
      className="no-scrollbar mt-4 flex gap-1 overflow-x-auto pb-1 lg:mt-8 lg:block lg:space-y-1 lg:overflow-visible"
    >
      {navigation.map(({ en, href, icon: Icon, zhHant }) => {
        const isActive = href === '/dashboard' ? pathname === href : pathname.startsWith(href);
        const label = locale === 'en' ? en : zhHant;

        return (
          <Link
            aria-current={isActive ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
              isActive
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-300 hover:bg-white/8 hover:text-white'
            }`}
            href={href}
            key={href}
          >
            <Icon className="size-[18px]" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
