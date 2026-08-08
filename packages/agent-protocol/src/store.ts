import type { AgentJob, StepResult } from '@ai-workflow-studio/workflow-schema';

export type DeviceStatus = 'pairing' | 'online' | 'offline' | 'revoked';
export type TenantRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface WebActor {
  readonly role: TenantRole;
  readonly tenantId: string;
  readonly userId: string;
}

export interface PairingRecord {
  readonly codeHash: string;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly deviceName: string;
  readonly expiresAt: Date;
  readonly id: string;
  readonly tenantId: string;
  consumedAt?: Date;
}

export interface DeviceRecord {
  agentVersion?: string;
  readonly id: string;
  lastSeenAt?: Date;
  readonly name: string;
  readonly pairedBy: string;
  pairedAt?: Date;
  revokedAt?: Date;
  status: DeviceStatus;
  readonly tenantId: string;
}

export interface DeviceTokenRecord {
  readonly deviceId: string;
  readonly expiresAt: Date;
  readonly id: string;
  lastUsedAt?: Date;
  revokedAt?: Date;
  readonly tenantId: string;
  readonly tokenHash: string;
  readonly tokenHint: string;
}

export interface HeartbeatRecord {
  readonly agentVersion: string;
  readonly deviceId: string;
  readonly executorRunning: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly occurredAt: Date;
  readonly tenantId: string;
}

export interface JobRecord {
  readonly job: AgentJob;
  claimTokenHash?: string;
  readonly events: JobEventRecord[];
}

export interface JobEventRecord {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly type: 'cancelled' | 'claimed' | 'completed' | 'failed' | 'lease_renewed' | 'progress';
}

export interface PairCompletionInput {
  readonly agentVersion: string;
  readonly codeHash: string;
  readonly device: DeviceRecord;
  readonly now: Date;
  readonly token: DeviceTokenRecord;
}

export interface AtomicClaimInput {
  readonly claimTokenHash: string;
  readonly deviceId: string;
  readonly jobId: string;
  readonly leaseUntil: Date;
  readonly now: Date;
  readonly tenantId: string;
}

export interface ActiveJobInput {
  readonly claimTokenHash: string;
  readonly deviceId: string;
  readonly jobId: string;
  readonly now: Date;
  readonly tenantId: string;
}

export interface DeviceRevocationInput {
  readonly actorUserId: string;
  readonly deviceId: string;
  readonly now: Date;
  readonly tenantId: string;
}

export interface AgentStore {
  createPairing(record: PairingRecord): Promise<void>;
  findPairingByHash(codeHash: string): Promise<PairingRecord | undefined>;
  completePairing(input: PairCompletionInput): Promise<DeviceRecord | undefined>;
  findDeviceByTokenHash(
    tokenHash: string,
  ): Promise<{ readonly device: DeviceRecord; readonly token: DeviceTokenRecord } | undefined>;
  touchDeviceToken(tokenId: string, usedAt: Date): Promise<void>;
  recordHeartbeat(record: HeartbeatRecord): Promise<DeviceRecord | undefined>;
  listJobs(tenantId: string, deviceId: string, now: Date): Promise<readonly AgentJob[]>;
  atomicClaim(input: AtomicClaimInput): Promise<AgentJob | undefined>;
  renewLease(input: ActiveJobInput & { readonly leaseUntil: Date }): Promise<AgentJob | undefined>;
  recordProgress(
    input: ActiveJobInput & {
      readonly eventId: string;
      readonly step: StepResult;
    },
  ): Promise<{ readonly duplicate: boolean; readonly job: AgentJob } | undefined>;
  finishJob(
    input: ActiveJobInput & {
      readonly eventId: string;
      readonly payload: Readonly<Record<string, unknown>>;
      readonly status: 'failed' | 'succeeded';
    },
  ): Promise<{ readonly duplicate: boolean; readonly job: AgentJob } | undefined>;
  cancelJob(tenantId: string, jobId: string, now: Date): Promise<boolean>;
  revokeDevice(input: DeviceRevocationInput): Promise<boolean>;
}

function cloneJob(job: AgentJob): AgentJob {
  return structuredClone(job);
}

export class InMemoryAgentStore implements AgentStore {
  private readonly devices = new Map<string, DeviceRecord>();
  private readonly heartbeats: HeartbeatRecord[] = [];
  private readonly jobs = new Map<string, JobRecord>();
  private readonly pairings = new Map<string, PairingRecord>();
  private readonly tokens = new Map<string, DeviceTokenRecord>();

  async createPairing(record: PairingRecord): Promise<void> {
    this.pairings.set(record.codeHash, structuredClone(record));
  }

  async findPairingByHash(codeHash: string): Promise<PairingRecord | undefined> {
    const pairing = this.pairings.get(codeHash);
    return pairing === undefined ? undefined : structuredClone(pairing);
  }

  async completePairing(input: PairCompletionInput): Promise<DeviceRecord | undefined> {
    const pairing = this.pairings.get(input.codeHash);
    if (
      pairing === undefined ||
      pairing.consumedAt !== undefined ||
      pairing.expiresAt.getTime() <= input.now.getTime() ||
      pairing.tenantId !== input.device.tenantId ||
      pairing.createdBy !== input.device.pairedBy
    ) {
      return undefined;
    }
    pairing.consumedAt = input.now;
    this.devices.set(input.device.id, structuredClone(input.device));
    this.tokens.set(input.token.id, structuredClone(input.token));
    return structuredClone(input.device);
  }

  async findDeviceByTokenHash(
    tokenHash: string,
  ): Promise<{ readonly device: DeviceRecord; readonly token: DeviceTokenRecord } | undefined> {
    const token = [...this.tokens.values()].find((candidate) => candidate.tokenHash === tokenHash);
    if (token === undefined) {
      return undefined;
    }
    const device = this.devices.get(token.deviceId);
    return device === undefined
      ? undefined
      : { device: structuredClone(device), token: structuredClone(token) };
  }

  async touchDeviceToken(tokenId: string, usedAt: Date): Promise<void> {
    const token = this.tokens.get(tokenId);
    if (token !== undefined) {
      token.lastUsedAt = usedAt;
    }
  }

  async recordHeartbeat(record: HeartbeatRecord): Promise<DeviceRecord | undefined> {
    const device = this.devices.get(record.deviceId);
    if (
      device === undefined ||
      device.tenantId !== record.tenantId ||
      device.status === 'revoked'
    ) {
      return undefined;
    }
    device.agentVersion = record.agentVersion;
    device.lastSeenAt = record.occurredAt;
    device.status = 'online';
    this.heartbeats.push(structuredClone(record));
    return structuredClone(device);
  }

  async listJobs(tenantId: string, deviceId: string, now: Date): Promise<readonly AgentJob[]> {
    return [...this.jobs.values()]
      .map((record) => record.job)
      .filter(
        (job) =>
          job.tenantId === tenantId &&
          job.deviceId === deviceId &&
          job.attempt < job.maxAttempts &&
          new Date(job.availableAt).getTime() <= now.getTime() &&
          (job.status === 'pending' ||
            ((job.status === 'claimed' || job.status === 'running') &&
              new Date(job.leaseExpiresAt ?? 0).getTime() <= now.getTime())),
      )
      .sort((left, right) => left.availableAt.localeCompare(right.availableAt))
      .slice(0, 100)
      .map(cloneJob);
  }

  async atomicClaim(input: AtomicClaimInput): Promise<AgentJob | undefined> {
    const record = this.jobs.get(input.jobId);
    if (
      record === undefined ||
      record.job.tenantId !== input.tenantId ||
      record.job.deviceId !== input.deviceId ||
      new Date(record.job.availableAt).getTime() > input.now.getTime() ||
      record.job.attempt >= record.job.maxAttempts
    ) {
      return undefined;
    }
    const activeLease =
      (record.job.status === 'claimed' || record.job.status === 'running') &&
      new Date(record.job.leaseExpiresAt ?? 0).getTime() > input.now.getTime();
    if (activeLease || !['pending', 'claimed', 'running'].includes(record.job.status)) {
      return undefined;
    }
    record.claimTokenHash = input.claimTokenHash;
    record.job.attempt += 1;
    record.job.leaseExpiresAt = input.leaseUntil.toISOString();
    record.job.status = 'claimed';
    record.events.push({
      eventId: `claim-${record.job.attempt}`,
      occurredAt: input.now,
      payload: { attempt: record.job.attempt },
      type: 'claimed',
    });
    return cloneJob(record.job);
  }

  async renewLease(
    input: ActiveJobInput & { readonly leaseUntil: Date },
  ): Promise<AgentJob | undefined> {
    const record = this.getActiveJob(input);
    if (record === undefined) {
      return undefined;
    }
    record.job.leaseExpiresAt = input.leaseUntil.toISOString();
    record.job.status = 'running';
    record.events.push({
      eventId: `lease-${input.now.toISOString()}`,
      occurredAt: input.now,
      payload: { leasedUntil: input.leaseUntil.toISOString() },
      type: 'lease_renewed',
    });
    return cloneJob(record.job);
  }

  async recordProgress(
    input: ActiveJobInput & {
      readonly eventId: string;
      readonly step: StepResult;
    },
  ): Promise<{ readonly duplicate: boolean; readonly job: AgentJob } | undefined> {
    const record = this.getActiveJob(input);
    if (record === undefined) {
      return undefined;
    }
    const duplicate = record.events.some((event) => event.eventId === input.eventId);
    if (!duplicate) {
      record.job.status = 'running';
      record.events.push({
        eventId: input.eventId,
        occurredAt: input.now,
        payload: { step: structuredClone(input.step) },
        type: 'progress',
      });
    }
    return { duplicate, job: cloneJob(record.job) };
  }

  async finishJob(
    input: ActiveJobInput & {
      readonly eventId: string;
      readonly payload: Readonly<Record<string, unknown>>;
      readonly status: 'failed' | 'succeeded';
    },
  ): Promise<{ readonly duplicate: boolean; readonly job: AgentJob } | undefined> {
    const record = this.jobs.get(input.jobId);
    if (
      record === undefined ||
      record.job.tenantId !== input.tenantId ||
      record.job.deviceId !== input.deviceId
    ) {
      return undefined;
    }
    const duplicate = record.events.some((event) => event.eventId === input.eventId);
    if (duplicate && record.job.status === input.status) {
      return { duplicate: true, job: cloneJob(record.job) };
    }
    if (this.getActiveJob(input) === undefined) {
      return undefined;
    }
    record.job.status = input.status;
    delete record.job.leaseExpiresAt;
    record.events.push({
      eventId: input.eventId,
      occurredAt: input.now,
      payload: structuredClone(input.payload),
      type: input.status === 'succeeded' ? 'completed' : 'failed',
    });
    return { duplicate: false, job: cloneJob(record.job) };
  }

  async cancelJob(tenantId: string, jobId: string, now: Date): Promise<boolean> {
    const record = this.jobs.get(jobId);
    if (
      record === undefined ||
      record.job.tenantId !== tenantId ||
      !['pending', 'claimed', 'running'].includes(record.job.status)
    ) {
      return false;
    }
    record.job.status = 'cancelled';
    delete record.job.leaseExpiresAt;
    record.events.push({
      eventId: `cancel-${now.toISOString()}`,
      occurredAt: now,
      payload: {},
      type: 'cancelled',
    });
    return true;
  }

  async revokeDevice(input: DeviceRevocationInput): Promise<boolean> {
    const device = this.devices.get(input.deviceId);
    if (device === undefined || device.tenantId !== input.tenantId || device.status === 'revoked') {
      return false;
    }
    device.status = 'revoked';
    device.revokedAt = input.now;
    for (const token of this.tokens.values()) {
      if (token.deviceId === input.deviceId && token.tenantId === input.tenantId) {
        token.revokedAt = input.now;
      }
    }
    for (const record of this.jobs.values()) {
      if (
        record.job.deviceId === input.deviceId &&
        record.job.tenantId === input.tenantId &&
        ['pending', 'claimed', 'running'].includes(record.job.status)
      ) {
        record.job.status = 'cancelled';
        delete record.job.leaseExpiresAt;
        record.events.push({
          eventId: `revoke-${input.now.toISOString()}`,
          occurredAt: input.now,
          payload: {},
          type: 'cancelled',
        });
      }
    }
    return true;
  }

  seedJob(job: AgentJob): void {
    if (this.jobs.has(job.id)) {
      return;
    }
    this.jobs.set(job.id, { events: [], job: structuredClone(job) });
  }

  snapshot(): {
    readonly devices: readonly DeviceRecord[];
    readonly heartbeats: readonly HeartbeatRecord[];
    readonly jobs: readonly JobRecord[];
    readonly pairings: readonly PairingRecord[];
    readonly tokens: readonly DeviceTokenRecord[];
  } {
    return structuredClone({
      devices: [...this.devices.values()],
      heartbeats: this.heartbeats,
      jobs: [...this.jobs.values()],
      pairings: [...this.pairings.values()],
      tokens: [...this.tokens.values()],
    });
  }

  private getActiveJob(input: ActiveJobInput): JobRecord | undefined {
    const record = this.jobs.get(input.jobId);
    if (
      record === undefined ||
      record.job.tenantId !== input.tenantId ||
      record.job.deviceId !== input.deviceId ||
      record.claimTokenHash !== input.claimTokenHash ||
      !['claimed', 'running'].includes(record.job.status) ||
      new Date(record.job.leaseExpiresAt ?? 0).getTime() <= input.now.getTime()
    ) {
      return undefined;
    }
    return record;
  }
}
