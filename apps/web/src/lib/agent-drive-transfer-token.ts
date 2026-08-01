import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { AgentProtocolError } from '@ai-workflow-studio/agent-protocol';
import { z } from 'zod';

import { getEnvironment } from './env';

const MOCK_TRANSFER_SECRET = 'mock-agent-drive-transfer-secret-never-use-in-production';
const TransferPayloadSchema = z
  .object({
    e: z.number().int().positive(),
    f: z
      .string()
      .min(8)
      .max(300)
      .regex(/^[A-Za-z0-9_-]+$/),
    j: z.string().uuid(),
    m: z.enum(['google_sheet', 'xlsx']),
    o: z.number().int().nonnegative().optional(),
    s: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export interface AgentDriveTransferScope {
  readonly expiresAt: number;
  readonly fileId: string;
  readonly jobId: string;
  readonly mimeType: 'google_sheet' | 'xlsx';
  readonly nodeIdHash: string;
  readonly size?: number;
}

function transferSecret(): string {
  const secret = process.env.AGENT_TOKEN_PEPPER;
  if (secret !== undefined && Buffer.byteLength(secret, 'utf8') >= 32) return secret;
  if (getEnvironment().mockMode) return MOCK_TRANSFER_SECRET;
  throw new AgentProtocolError(
    'AGENT_SERVER_NOT_CONFIGURED',
    'Agent file transfer is not configured for this server.',
  );
}

function signature(payload: string): string {
  return createHmac('sha256', transferSecret()).update(payload).digest('base64url');
}

export function createAgentDriveTransferToken(scope: AgentDriveTransferScope): string {
  const payload = TransferPayloadSchema.parse({
    e: scope.expiresAt,
    f: scope.fileId,
    j: scope.jobId,
    m: scope.mimeType,
    ...(scope.size === undefined ? {} : { o: scope.size }),
    s: scope.nodeIdHash,
  });
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${signature(encoded)}`;
}

export function verifyAgentDriveTransferToken(
  token: string,
  expected: { readonly fileId: string; readonly jobId: string; readonly nodeIdHash: string },
  now = Date.now(),
): AgentDriveTransferScope {
  if (token.length > 2_000) {
    throw new AgentProtocolError('AGENT_REQUEST_INVALID', 'Drive transfer token is invalid.');
  }
  const [encoded, providedSignature, extra] = token.split('.');
  if (encoded === undefined || providedSignature === undefined || extra !== undefined) {
    throw new AgentProtocolError('AGENT_REQUEST_INVALID', 'Drive transfer token is invalid.');
  }
  const expectedSignature = signature(encoded);
  const provided = Buffer.from(providedSignature, 'utf8');
  const calculated = Buffer.from(expectedSignature, 'utf8');
  if (provided.length !== calculated.length || !timingSafeEqual(provided, calculated)) {
    throw new AgentProtocolError('AGENT_FORBIDDEN', 'Drive transfer token was rejected.');
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw new AgentProtocolError('AGENT_REQUEST_INVALID', 'Drive transfer token is invalid.');
  }
  const parsed = TransferPayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new AgentProtocolError('AGENT_REQUEST_INVALID', 'Drive transfer token is invalid.');
  }
  const payload = parsed.data;
  if (
    payload.e < now ||
    payload.e > now + 15 * 60_000 ||
    payload.f !== expected.fileId ||
    payload.j !== expected.jobId ||
    payload.s !== expected.nodeIdHash
  ) {
    throw new AgentProtocolError('AGENT_FORBIDDEN', 'Drive transfer token scope was rejected.');
  }
  return {
    expiresAt: payload.e,
    fileId: payload.f,
    jobId: payload.j,
    mimeType: payload.m,
    nodeIdHash: payload.s,
    ...(payload.o === undefined ? {} : { size: payload.o }),
  };
}
