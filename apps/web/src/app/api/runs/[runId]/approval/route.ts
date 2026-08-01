import { z } from 'zod';

import { readRunJson, runApiError } from '@/lib/run-api';
import { resolveRunApproval } from '@/lib/run-server';

const ApprovalInputSchema = z
  .object({
    approvalId: z.string().uuid(),
    decision: z.enum(['approve', 'reject']),
  })
  .strict();

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly runId: string }> },
): Promise<Response> {
  try {
    const input = ApprovalInputSchema.parse(await readRunJson(request));
    return Response.json(
      {
        run: await resolveRunApproval(
          (await context.params).runId,
          input.approvalId,
          input.decision,
        ),
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return runApiError(error);
  }
}

export const runtime = 'nodejs';
export const maxDuration = 800;
