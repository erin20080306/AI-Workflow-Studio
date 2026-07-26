import type { AgentJob } from '@ai-workflow-studio/workflow-schema';
import { z } from 'zod';

import { AgentCrypto } from './crypto';
import { AgentProtocolError } from './errors';
import {
  ClaimJobRequestSchema,
  CompleteJobRequestSchema,
  FailJobRequestSchema,
  HeartbeatRequestSchema,
  LeaseJobRequestSchema,
  PairCompleteRequestSchema,
  PairStartRequestSchema,
  ProgressJobRequestSchema,
} from './schemas';
import type { AgentStore, WebActor } from './store';

const JobIdSchema = z.string().uuid();
const DEVICE_TOKEN_PATTERN = /^dvt_[A-Za-z0-9_-]{40,60}$/;
const CLAIM_TOKEN_PATTERN = /^clm_[A-Za-z0-9_-]{40,60}$/;
const PAIRING_TTL_MS = 10 * 60 * 1_000;
const DEVICE_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1_000;
const MAX_PAST_SKEW_MS = 5 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 30 * 1_000;

export interface DeviceRequestCredentials {
  readonly authorization: string | null;
  readonly requestTimestamp: string | null;
}

export interface ClaimedJobCredentials extends DeviceRequestCredentials {
  readonly claimToken: string | null;
}

interface AuthenticatedDevice {
  readonly deviceId: string;
  readonly tenantId: string;
}

export interface AgentServiceOptions {
  readonly clock?: () => Date;
  readonly crypto: AgentCrypto;
  readonly store: AgentStore;
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new AgentProtocolError('AGENT_REQUEST_INVALID', 'Agent request body is invalid.', {
      details: {
        paths: parsed.error.issues.map((issue) => issue.path.map(String).join('.')),
      },
    });
  }
  return parsed.data;
}

function parseJobId(jobId: string): string {
  const parsed = JobIdSchema.safeParse(jobId);
  if (!parsed.success) {
    throw new AgentProtocolError('AGENT_REQUEST_INVALID', 'Agent job identifier is invalid.');
  }
  return parsed.data;
}

export class AgentService {
  private readonly clock: () => Date;
  private readonly crypto: AgentCrypto;
  private readonly store: AgentStore;

  constructor(options: AgentServiceOptions) {
    this.clock = options.clock ?? (() => new Date());
    this.crypto = options.crypto;
    this.store = options.store;
  }

  async startPairing(actor: WebActor, input: unknown) {
    if (actor.role !== 'owner' && actor.role !== 'admin') {
      throw new AgentProtocolError(
        'AGENT_FORBIDDEN',
        'Only a tenant owner or administrator can pair a device.',
      );
    }
    const request = parseInput(PairStartRequestSchema, input);
    const now = this.clock();
    const pairingCode = this.crypto.createPairingCode();
    const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);
    await this.store.createPairing({
      codeHash: this.crypto.hashPairingCode(pairingCode),
      createdAt: now,
      createdBy: actor.userId,
      deviceName: request.deviceName,
      expiresAt,
      id: this.crypto.randomUuid(),
      tenantId: actor.tenantId,
    });
    return {
      expiresAt: expiresAt.toISOString(),
      pairingCode,
    };
  }

  async completePairing(input: unknown) {
    const request = parseInput(PairCompleteRequestSchema, input);
    const now = this.clock();
    const codeHash = this.crypto.hashPairingCode(request.pairingCode);
    const pairing = await this.store.findPairingByHash(codeHash);
    if (pairing === undefined || pairing.consumedAt !== undefined) {
      throw new AgentProtocolError(
        'AGENT_PAIRING_INVALID',
        'Pairing code is invalid or already used.',
      );
    }
    if (pairing.expiresAt.getTime() <= now.getTime()) {
      throw new AgentProtocolError('AGENT_PAIRING_EXPIRED', 'Pairing code has expired.');
    }

    const deviceId = this.crypto.randomUuid();
    const deviceToken = this.crypto.createDeviceToken();
    const tokenId = this.crypto.randomUuid();
    const device = await this.store.completePairing({
      agentVersion: request.agentVersion,
      codeHash,
      device: {
        agentVersion: request.agentVersion,
        id: deviceId,
        lastSeenAt: now,
        name: pairing.deviceName,
        pairedAt: now,
        pairedBy: pairing.createdBy,
        status: 'online',
        tenantId: pairing.tenantId,
      },
      now,
      token: {
        deviceId,
        expiresAt: new Date(now.getTime() + DEVICE_TOKEN_TTL_MS),
        id: tokenId,
        lastUsedAt: now,
        tenantId: pairing.tenantId,
        tokenHash: this.crypto.hashDeviceToken(deviceToken),
        tokenHint: this.crypto.tokenHint(deviceToken),
      },
    });
    if (device === undefined) {
      throw new AgentProtocolError(
        'AGENT_PAIRING_INVALID',
        'Pairing code is invalid or already used.',
      );
    }
    return {
      device: {
        id: device.id,
        name: device.name,
        status: device.status,
        tenantId: device.tenantId,
      },
      deviceToken,
      expiresAt: new Date(now.getTime() + DEVICE_TOKEN_TTL_MS).toISOString(),
    };
  }

  async heartbeat(credentials: DeviceRequestCredentials, input: unknown) {
    const authenticated = await this.authenticate(credentials);
    const request = parseInput(HeartbeatRequestSchema, input);
    const now = this.clock();
    const device = await this.store.recordHeartbeat({
      agentVersion: request.agentVersion,
      deviceId: authenticated.deviceId,
      executorRunning: request.executorRunning,
      metadata: request.metadata,
      occurredAt: now,
      tenantId: authenticated.tenantId,
    });
    if (device === undefined) {
      throw new AgentProtocolError('AGENT_DEVICE_REVOKED', 'Device is not active.');
    }
    return {
      acceptedAt: now.toISOString(),
      deviceStatus: device.status,
    };
  }

  async listJobs(credentials: DeviceRequestCredentials): Promise<readonly AgentJob[]> {
    const authenticated = await this.authenticate(credentials);
    return this.store.listJobs(authenticated.tenantId, authenticated.deviceId, this.clock());
  }

  async claimJob(credentials: DeviceRequestCredentials, jobIdInput: string, input: unknown) {
    const authenticated = await this.authenticate(credentials);
    const request = parseInput(ClaimJobRequestSchema, input);
    const jobId = parseJobId(jobIdInput);
    const now = this.clock();
    const claimToken = this.crypto.createClaimToken();
    const leaseUntil = new Date(now.getTime() + request.leaseSeconds * 1_000);
    const job = await this.store.atomicClaim({
      claimTokenHash: this.crypto.hashClaimToken(claimToken),
      deviceId: authenticated.deviceId,
      jobId,
      leaseUntil,
      now,
      tenantId: authenticated.tenantId,
    });
    if (job === undefined) {
      throw new AgentProtocolError(
        'AGENT_JOB_CONFLICT',
        'Job is unavailable, already claimed, or outside this device.',
      );
    }
    return { claimToken, job };
  }

  async renewLease(credentials: ClaimedJobCredentials, jobIdInput: string, input: unknown) {
    const authenticated = await this.authenticate(credentials);
    const claimTokenHash = this.parseClaimToken(credentials.claimToken);
    const request = parseInput(LeaseJobRequestSchema, input);
    const now = this.clock();
    const job = await this.store.renewLease({
      claimTokenHash,
      deviceId: authenticated.deviceId,
      jobId: parseJobId(jobIdInput),
      leaseUntil: new Date(now.getTime() + request.leaseSeconds * 1_000),
      now,
      tenantId: authenticated.tenantId,
    });
    if (job === undefined) {
      throw new AgentProtocolError(
        'AGENT_LEASE_EXPIRED',
        'Job lease is expired or the claim token is invalid.',
      );
    }
    return job;
  }

  async recordProgress(credentials: ClaimedJobCredentials, jobIdInput: string, input: unknown) {
    const authenticated = await this.authenticate(credentials);
    const claimTokenHash = this.parseClaimToken(credentials.claimToken);
    const request = parseInput(ProgressJobRequestSchema, input);
    const result = await this.store.recordProgress({
      claimTokenHash,
      deviceId: authenticated.deviceId,
      eventId: request.eventId,
      jobId: parseJobId(jobIdInput),
      now: this.clock(),
      step: request.step,
      tenantId: authenticated.tenantId,
    });
    if (result === undefined) {
      throw new AgentProtocolError(
        'AGENT_LEASE_EXPIRED',
        'Job lease is expired or the claim token is invalid.',
      );
    }
    return result;
  }

  async completeJob(credentials: ClaimedJobCredentials, jobIdInput: string, input: unknown) {
    const authenticated = await this.authenticate(credentials);
    const request = parseInput(CompleteJobRequestSchema, input);
    const result = await this.store.finishJob({
      claimTokenHash: this.parseClaimToken(credentials.claimToken),
      deviceId: authenticated.deviceId,
      eventId: request.eventId,
      jobId: parseJobId(jobIdInput),
      now: this.clock(),
      payload: request.result === undefined ? {} : { result: request.result },
      status: 'succeeded',
      tenantId: authenticated.tenantId,
    });
    if (result === undefined) {
      throw new AgentProtocolError(
        'AGENT_LEASE_EXPIRED',
        'Job lease is expired or the claim token is invalid.',
      );
    }
    return result;
  }

  async failJob(credentials: ClaimedJobCredentials, jobIdInput: string, input: unknown) {
    const authenticated = await this.authenticate(credentials);
    const request = parseInput(FailJobRequestSchema, input);
    const result = await this.store.finishJob({
      claimTokenHash: this.parseClaimToken(credentials.claimToken),
      deviceId: authenticated.deviceId,
      eventId: request.eventId,
      jobId: parseJobId(jobIdInput),
      now: this.clock(),
      payload: { error: request.error },
      status: 'failed',
      tenantId: authenticated.tenantId,
    });
    if (result === undefined) {
      throw new AgentProtocolError(
        'AGENT_LEASE_EXPIRED',
        'Job lease is expired or the claim token is invalid.',
      );
    }
    return result;
  }

  async revokeDevice(actor: WebActor, deviceIdInput: string) {
    if (actor.role !== 'owner' && actor.role !== 'admin') {
      throw new AgentProtocolError(
        'AGENT_FORBIDDEN',
        'Only a tenant owner or administrator can revoke a device.',
      );
    }
    const deviceId = parseJobId(deviceIdInput);
    const revoked = await this.store.revokeDevice(actor.tenantId, deviceId, this.clock());
    if (!revoked) {
      throw new AgentProtocolError('AGENT_JOB_NOT_FOUND', 'Device was not found.');
    }
    return { revoked: true };
  }

  private async authenticate(credentials: DeviceRequestCredentials): Promise<AuthenticatedDevice> {
    const now = this.clock();
    const timestamp = this.parseTimestamp(credentials.requestTimestamp);
    const skew = timestamp.getTime() - now.getTime();
    if (skew > MAX_FUTURE_SKEW_MS || skew < -MAX_PAST_SKEW_MS) {
      throw new AgentProtocolError(
        'AGENT_TIMESTAMP_INVALID',
        'Agent request timestamp is outside the accepted window.',
      );
    }

    const authorization = credentials.authorization ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!DEVICE_TOKEN_PATTERN.test(token)) {
      throw new AgentProtocolError('AGENT_AUTHENTICATION_FAILED', 'Device authentication failed.');
    }
    const authenticated = await this.store.findDeviceByTokenHash(
      this.crypto.hashDeviceToken(token),
    );
    if (authenticated === undefined) {
      throw new AgentProtocolError('AGENT_AUTHENTICATION_FAILED', 'Device authentication failed.');
    }
    if (
      authenticated.token.revokedAt !== undefined ||
      authenticated.token.expiresAt.getTime() <= now.getTime()
    ) {
      throw new AgentProtocolError('AGENT_AUTHENTICATION_FAILED', 'Device authentication failed.');
    }
    if (authenticated.device.status === 'revoked' || authenticated.device.revokedAt !== undefined) {
      throw new AgentProtocolError('AGENT_DEVICE_REVOKED', 'Device is revoked.');
    }
    await this.store.touchDeviceToken(authenticated.token.id, now);
    return {
      deviceId: authenticated.device.id,
      tenantId: authenticated.device.tenantId,
    };
  }

  private parseClaimToken(claimToken: string | null): string {
    if (claimToken === null || !CLAIM_TOKEN_PATTERN.test(claimToken)) {
      throw new AgentProtocolError(
        'AGENT_AUTHENTICATION_FAILED',
        'Job claim authentication failed.',
      );
    }
    return this.crypto.hashClaimToken(claimToken);
  }

  private parseTimestamp(value: string | null): Date {
    if (value === null) {
      throw new AgentProtocolError(
        'AGENT_TIMESTAMP_INVALID',
        'Agent request timestamp is required.',
      );
    }
    const parsed = z.iso.datetime({ offset: true }).safeParse(value);
    if (!parsed.success) {
      throw new AgentProtocolError(
        'AGENT_TIMESTAMP_INVALID',
        'Agent request timestamp is invalid.',
      );
    }
    return new Date(parsed.data);
  }
}
