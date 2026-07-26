'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { DashboardIcon, DeviceIcon, FlowIcon, RunsIcon, SettingsIcon } from './icons';

const navigation = [
  { href: '/dashboard', icon: DashboardIcon, label: '總覽' },
  { href: '/dashboard/workflows', icon: FlowIcon, label: '工作流' },
  { href: '/dashboard/runs', icon: RunsIcon, label: '執行紀錄' },
  { href: '/dashboard/devices', icon: DeviceIcon, label: '裝置' },
  { href: '/dashboard/settings', icon: SettingsIcon, label: '設定' },
] as const;

export function DashboardNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Dashboard navigation"
      className="no-scrollbar mt-4 flex gap-1 overflow-x-auto pb-1 lg:mt-8 lg:block lg:space-y-1 lg:overflow-visible"
    >
      {navigation.map(({ href, icon: Icon, label }) => {
        const isActive = href === '/dashboard' ? pathname === href : pathname.startsWith(href);

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
