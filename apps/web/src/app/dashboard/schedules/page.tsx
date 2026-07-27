import type { Metadata } from 'next';

import { ScheduleWorkspace } from '@/components/schedules/schedule-workspace';
import { requireWorkspaceContext } from '@/lib/auth/context';
import { googleConnectionPageState } from '@/lib/google-connections';
import { schedulePageState } from '@/lib/schedule-server';

export const metadata: Metadata = {
  title: '排程與連接器',
};

export default async function SchedulesPage() {
  const context = await requireWorkspaceContext();
  const [scheduleState, connectionState] = await Promise.all([
    schedulePageState(context),
    googleConnectionPageState(),
  ]);
  return (
    <ScheduleWorkspace
      connectionCount={
        connectionState.connections.filter((connection) => connection.status === 'active').length
      }
      initialSchedules={scheduleState.schedules}
      targets={scheduleState.targets}
    />
  );
}

export const dynamic = 'force-dynamic';
