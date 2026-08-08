import { AgentProtocolError } from '@ai-workflow-studio/agent-protocol';
import { z } from 'zod';

const DeviceLimitDatabaseErrorSchema = z.object({
  code: z.literal('23514'),
  message: z.enum([
    'free plan device limit reached',
    'pro plan device limit reached',
    'team plan device limit reached',
    'business plan device limit reached',
  ]),
});

export function mapCompletePairingDatabaseError(error: unknown): AgentProtocolError | undefined {
  if (!DeviceLimitDatabaseErrorSchema.safeParse(error).success) return undefined;
  return new AgentProtocolError(
    'AGENT_DEVICE_LIMIT_REACHED',
    'The workspace has reached its Desktop Agent device limit.',
  );
}
