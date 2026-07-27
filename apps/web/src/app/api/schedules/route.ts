import { ScheduleCreateInputSchema } from '@ai-workflow-studio/scheduler';

import { requireWorkspaceContext } from '@/lib/auth/context';
import { readScheduleJson, scheduleApiError } from '@/lib/schedule-api';
import { createSchedule, schedulePageState } from '@/lib/schedule-server';

export async function GET(): Promise<Response> {
  try {
    const context = await requireWorkspaceContext();
    return Response.json(await schedulePageState(context), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return scheduleApiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireWorkspaceContext();
    const input = ScheduleCreateInputSchema.parse(await readScheduleJson(request));
    return Response.json(
      { schedule: await createSchedule(context, input) },
      {
        headers: { 'cache-control': 'no-store' },
        status: 201,
      },
    );
  } catch (error) {
    return scheduleApiError(error);
  }
}

export const runtime = 'nodejs';
