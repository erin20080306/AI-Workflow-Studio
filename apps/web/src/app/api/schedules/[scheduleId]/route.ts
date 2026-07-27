import { ScheduleStatusUpdateSchema } from '@ai-workflow-studio/scheduler';

import { requireWorkspaceContext } from '@/lib/auth/context';
import { readScheduleJson, scheduleApiError } from '@/lib/schedule-api';
import { updateScheduleStatus } from '@/lib/schedule-server';

interface ScheduleRouteContext {
  readonly params: Promise<{
    readonly scheduleId: string;
  }>;
}

export async function PATCH(request: Request, { params }: ScheduleRouteContext): Promise<Response> {
  try {
    const { scheduleId } = await params;
    const context = await requireWorkspaceContext();
    const input = ScheduleStatusUpdateSchema.parse(await readScheduleJson(request));
    return Response.json(
      { schedule: await updateScheduleStatus(context, scheduleId, input) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return scheduleApiError(error);
  }
}

export const runtime = 'nodejs';
