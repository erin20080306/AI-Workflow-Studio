import 'server-only';

import {
  AgentProtocolError,
  type ClaimedJobCredentials,
  type DeviceRequestCredentials,
} from '@ai-workflow-studio/agent-protocol';

const MAX_AGENT_BODY_BYTES = 32_000;
const MAX_AGENT_CLOUD_STEP_BODY_BYTES = 96_000;

const statusByCode = {
  AGENT_AUTHENTICATION_FAILED: 401,
  AGENT_DEVICE_REVOKED: 403,
  AGENT_FORBIDDEN: 403,
  AGENT_JOB_CONFLICT: 409,
  AGENT_JOB_NOT_FOUND: 404,
  AGENT_LEASE_EXPIRED: 409,
  AGENT_PAIRING_EXPIRED: 410,
  AGENT_PAIRING_INVALID: 400,
  AGENT_REQUEST_INVALID: 400,
  AGENT_SERVER_NOT_CONFIGURED: 503,
  AGENT_TIMESTAMP_INVALID: 401,
} as const;

export function deviceCredentials(request: Request): DeviceRequestCredentials {
  return {
    authorization: request.headers.get('authorization'),
    requestTimestamp: request.headers.get('x-request-timestamp'),
  };
}

export function claimedJobCredentials(request: Request): ClaimedJobCredentials {
  return {
    ...deviceCredentials(request),
    claimToken: request.headers.get('x-job-claim-token'),
  };
}

async function readBoundedAgentJson(request: Request, maximumBytes: number): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new AgentProtocolError('AGENT_REQUEST_INVALID', 'Agent request body is too large.');
  }
  let body: string;
  try {
    body = await request.text();
  } catch {
    throw new AgentProtocolError('AGENT_REQUEST_INVALID', 'Agent request body could not be read.');
  }
  if (new TextEncoder().encode(body).byteLength > maximumBytes) {
    throw new AgentProtocolError('AGENT_REQUEST_INVALID', 'Agent request body is too large.');
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new AgentProtocolError('AGENT_REQUEST_INVALID', 'Agent request body must be valid JSON.');
  }
}

export async function readAgentJson(request: Request): Promise<unknown> {
  return await readBoundedAgentJson(request, MAX_AGENT_BODY_BYTES);
}

export async function readAgentCloudStepJson(request: Request): Promise<unknown> {
  return await readBoundedAgentJson(request, MAX_AGENT_CLOUD_STEP_BODY_BYTES);
}

export function agentApiError(error: unknown): Response {
  if (error instanceof AgentProtocolError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      {
        headers: { 'cache-control': 'no-store' },
        status: statusByCode[error.code],
      },
    );
  }
  return Response.json(
    {
      error: {
        code: 'AGENT_REQUEST_INVALID',
        message: 'Agent request could not be completed.',
      },
    },
    {
      headers: { 'cache-control': 'no-store' },
      status: 500,
    },
  );
}
