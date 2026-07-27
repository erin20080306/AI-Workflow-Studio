import 'server-only';

import type {
  ActiveJobInput,
  AgentStore,
  AtomicClaimInput,
  DeviceRecord,
  DeviceTokenRecord,
  HeartbeatRecord,
  PairCompletionInput,
  PairingRecord,
} from '@ai-workflow-studio/agent-protocol';
import {
  AgentJobSchema,
  StepResultSchema,
  type AgentJob,
  type StepResult,
} from '@ai-workflow-studio/workflow-schema';
import { z } from 'zod';

import { createSupabaseAdminClient } from '@/lib/supabase/server';

const ByteaHexSchema = z.string().regex(/^(?:\\x)?[a-f0-9]{64}$/);
const TimestampSchema = z.string().datetime({ offset: true });
const PairingRowSchema = z.object({
  code_hash: ByteaHexSchema,
  consumed_at: TimestampSchema.nullable(),
  created_at: TimestampSchema,
  created_by: z.string().uuid(),
  device_name: z.string().min(1).max(120),
  expires_at: TimestampSchema,
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
});
const DeviceRowSchema = z.object({
  agent_version: z.string().max(80).nullable(),
  id: z.string().uuid(),
  last_seen_at: TimestampSchema.nullable(),
  name: z.string().min(1).max(120),
  paired_at: TimestampSchema.nullable(),
  paired_by: z.string().uuid(),
  revoked_at: TimestampSchema.nullable(),
  status: z.enum(['offline', 'online', 'pairing', 'revoked']),
  tenant_id: z.string().uuid(),
});
const DeviceTokenRowSchema = z.object({
  device_id: z.string().uuid(),
  expires_at: TimestampSchema.nullable(),
  id: z.string().uuid(),
  last_used_at: TimestampSchema.nullable(),
  revoked_at: TimestampSchema.nullable(),
  tenant_id: z.string().uuid(),
  token_hash: ByteaHexSchema,
  token_hint: z.string().min(4).max(16),
});
const AgentJobRowSchema = z.object({
  attempt: z.number().int().min(0),
  available_at: TimestampSchema,
  device_id: z.string().uuid(),
  id: z.string().uuid(),
  idempotency_key: z.string().min(8).max(200),
  leased_until: TimestampSchema.nullable(),
  max_attempts: z.number().int().min(1).max(20),
  payload: z.unknown(),
  status: z.enum(['pending', 'claimed', 'running', 'succeeded', 'failed', 'cancelled', 'expired']),
  tenant_id: z.string().uuid(),
  workflow_run_id: z.string().uuid(),
});
const FolderAliasHeartbeatSchema = z
  .array(
    z
      .object({
        displayName: z.string().trim().min(1).max(120),
        folderAliasId: z.string().uuid(),
        permissions: z
          .object({
            read: z.boolean(),
            watch: z.boolean(),
            write: z.boolean(),
          })
          .strict(),
      })
      .strict(),
  )
  .max(200);

function bytea(hex: string): string {
  return `\\x${hex}`;
}

function unprefixBytea(value: string): string {
  return value.startsWith('\\x') ? value.slice(2) : value;
}

function pairingFromRow(input: unknown): PairingRecord {
  const row = PairingRowSchema.parse(input);
  return {
    codeHash: unprefixBytea(row.code_hash),
    ...(row.consumed_at === null ? {} : { consumedAt: new Date(row.consumed_at) }),
    createdAt: new Date(row.created_at),
    createdBy: row.created_by,
    deviceName: row.device_name,
    expiresAt: new Date(row.expires_at),
    id: row.id,
    tenantId: row.tenant_id,
  };
}

function deviceFromRow(input: unknown): DeviceRecord {
  const row = DeviceRowSchema.parse(input);
  return {
    ...(row.agent_version === null ? {} : { agentVersion: row.agent_version }),
    id: row.id,
    ...(row.last_seen_at === null ? {} : { lastSeenAt: new Date(row.last_seen_at) }),
    name: row.name,
    pairedBy: row.paired_by,
    ...(row.paired_at === null ? {} : { pairedAt: new Date(row.paired_at) }),
    ...(row.revoked_at === null ? {} : { revokedAt: new Date(row.revoked_at) }),
    status: row.status,
    tenantId: row.tenant_id,
  };
}

function tokenFromRow(input: unknown): DeviceTokenRecord {
  const row = DeviceTokenRowSchema.parse(input);
  if (row.expires_at === null) {
    throw new Error('A production device token must have an expiry.');
  }
  return {
    deviceId: row.device_id,
    expiresAt: new Date(row.expires_at),
    id: row.id,
    ...(row.last_used_at === null ? {} : { lastUsedAt: new Date(row.last_used_at) }),
    ...(row.revoked_at === null ? {} : { revokedAt: new Date(row.revoked_at) }),
    tenantId: row.tenant_id,
    tokenHash: unprefixBytea(row.token_hash),
    tokenHint: row.token_hint,
  };
}

function jobFromRow(input: unknown): AgentJob {
  const row = AgentJobRowSchema.parse(input);
  const payload = z
    .object({ workflow: AgentJobSchema.shape.workflow })
    .passthrough()
    .parse(row.payload);
  return AgentJobSchema.parse({
    attempt: row.attempt,
    availableAt: row.available_at,
    deviceId: row.device_id,
    id: row.id,
    idempotencyKey: row.idempotency_key,
    ...(row.leased_until === null ? {} : { leaseExpiresAt: row.leased_until }),
    maxAttempts: row.max_attempts,
    status: row.status,
    tenantId: row.tenant_id,
    workflow: payload.workflow,
    workflowRunId: row.workflow_run_id,
  });
}

async function readJob(
  tenantId: string,
  deviceId: string,
  jobId: string,
): Promise<AgentJob | undefined> {
  const result = await createSupabaseAdminClient()
    .from('agent_jobs')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('device_id', deviceId)
    .eq('id', jobId)
    .maybeSingle();
  if (result.error !== null) {
    throw new Error('The Desktop Job could not be read.');
  }
  return result.data === null ? undefined : jobFromRow(result.data);
}

async function eventExists(tenantId: string, jobId: string, eventId: string): Promise<boolean> {
  const result = await createSupabaseAdminClient()
    .from('agent_job_events')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('agent_job_id', jobId)
    .eq('event_key', eventId)
    .maybeSingle();
  if (result.error !== null) {
    throw new Error('The Desktop Job event could not be checked.');
  }
  return result.data !== null;
}

export class SupabaseAgentStore implements AgentStore {
  async createPairing(record: PairingRecord): Promise<void> {
    const result = await createSupabaseAdminClient()
      .from('device_pairing_codes')
      .insert({
        code_hash: bytea(record.codeHash),
        created_at: record.createdAt.toISOString(),
        created_by: record.createdBy,
        device_name: record.deviceName,
        expires_at: record.expiresAt.toISOString(),
        id: record.id,
        tenant_id: record.tenantId,
      });
    if (result.error !== null) {
      throw new Error('The device pairing request could not be saved.');
    }
  }

  async findPairingByHash(codeHash: string): Promise<PairingRecord | undefined> {
    const result = await createSupabaseAdminClient()
      .from('device_pairing_codes')
      .select('*')
      .eq('code_hash', bytea(codeHash))
      .maybeSingle();
    if (result.error !== null) {
      throw new Error('The device pairing request could not be read.');
    }
    return result.data === null ? undefined : pairingFromRow(result.data);
  }

  async completePairing(input: PairCompletionInput): Promise<DeviceRecord | undefined> {
    const admin = createSupabaseAdminClient();
    const result = await admin.rpc('complete_agent_pairing', {
      requested_agent_version: input.agentVersion,
      requested_code_hash: bytea(input.codeHash),
      requested_device_id: input.device.id,
      requested_now: input.now.toISOString(),
      requested_token_expires_at: input.token.expiresAt.toISOString(),
      requested_token_hash: bytea(input.token.tokenHash),
      requested_token_hint: input.token.tokenHint,
      requested_token_id: input.token.id,
    });
    if (result.error !== null) {
      throw new Error('The device pairing request could not be completed.');
    }
    const row = z.array(DeviceRowSchema).parse(result.data)[0];
    return row === undefined ? undefined : deviceFromRow(row);
  }

  async findDeviceByTokenHash(
    tokenHash: string,
  ): Promise<{ readonly device: DeviceRecord; readonly token: DeviceTokenRecord } | undefined> {
    const admin = createSupabaseAdminClient();
    const tokenResult = await admin
      .from('device_tokens')
      .select('*')
      .eq('token_hash', bytea(tokenHash))
      .maybeSingle();
    if (tokenResult.error !== null) {
      throw new Error('Device authentication could not be checked.');
    }
    if (tokenResult.data === null) return undefined;
    const token = tokenFromRow(tokenResult.data);
    const deviceResult = await admin
      .from('devices')
      .select('*')
      .eq('tenant_id', token.tenantId)
      .eq('id', token.deviceId)
      .maybeSingle();
    if (deviceResult.error !== null) {
      throw new Error('Device authentication could not be checked.');
    }
    return deviceResult.data === null
      ? undefined
      : { device: deviceFromRow(deviceResult.data), token };
  }

  async touchDeviceToken(tokenId: string, usedAt: Date): Promise<void> {
    const result = await createSupabaseAdminClient()
      .from('device_tokens')
      .update({ last_used_at: usedAt.toISOString() })
      .eq('id', tokenId);
    if (result.error !== null) {
      throw new Error('Device authentication could not be updated.');
    }
  }

  async recordHeartbeat(record: HeartbeatRecord): Promise<DeviceRecord | undefined> {
    const admin = createSupabaseAdminClient();
    const result = await admin.rpc('record_agent_heartbeat', {
      requested_agent_version: record.agentVersion,
      requested_device_id: record.deviceId,
      requested_executor_running: record.executorRunning,
      requested_metadata: record.metadata,
      requested_occurred_at: record.occurredAt.toISOString(),
      requested_tenant_id: record.tenantId,
    });
    if (result.error !== null) {
      throw new Error('The device heartbeat could not be recorded.');
    }
    const row = z.array(DeviceRowSchema).parse(result.data)[0];
    if (row === undefined) return undefined;
    const aliases = FolderAliasHeartbeatSchema.safeParse(record.metadata.folderAliases);
    if (aliases.success) {
      const existingResult = await admin
        .from('folder_aliases')
        .select('id')
        .eq('tenant_id', record.tenantId)
        .eq('device_id', record.deviceId);
      if (existingResult.error !== null) {
        throw new Error('Approved folder aliases could not be synchronized.');
      }
      if (aliases.data.length > 0) {
        for (const alias of aliases.data) {
          const values = {
            device_id: record.deviceId,
            display_name: alias.displayName,
            permission_summary: alias.permissions,
            tenant_id: record.tenantId,
            updated_at: record.occurredAt.toISOString(),
          };
          const update = await admin
            .from('folder_aliases')
            .update(values)
            .eq('tenant_id', record.tenantId)
            .eq('device_id', record.deviceId)
            .eq('id', alias.folderAliasId)
            .select('id');
          if (update.error !== null) {
            throw new Error('Approved folder aliases could not be synchronized.');
          }
          if (z.array(z.object({ id: z.string().uuid() })).parse(update.data).length === 0) {
            const insert = await admin.from('folder_aliases').insert({
              ...values,
              id: alias.folderAliasId,
            });
            if (insert.error !== null) {
              throw new Error('Approved folder aliases could not be synchronized.');
            }
          }
        }
      }
      const received = new Set(aliases.data.map((alias) => alias.folderAliasId));
      const stale = z
        .array(z.object({ id: z.string().uuid() }))
        .parse(existingResult.data)
        .map((candidate) => candidate.id)
        .filter((id) => !received.has(id));
      if (stale.length > 0) {
        const deletion = await admin
          .from('folder_aliases')
          .delete()
          .eq('tenant_id', record.tenantId)
          .eq('device_id', record.deviceId)
          .in('id', stale);
        if (deletion.error !== null) {
          throw new Error('Revoked folder aliases could not be synchronized.');
        }
      }
    }
    return deviceFromRow(row);
  }

  async listJobs(tenantId: string, deviceId: string, now: Date): Promise<readonly AgentJob[]> {
    const result = await createSupabaseAdminClient()
      .from('agent_jobs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('device_id', deviceId)
      .lt('attempt', 20)
      .lte('available_at', now.toISOString())
      .in('status', ['pending', 'claimed', 'running'])
      .order('available_at')
      .limit(100);
    if (result.error !== null) {
      throw new Error('Desktop Jobs could not be listed.');
    }
    return z
      .array(AgentJobRowSchema)
      .parse(result.data)
      .filter(
        (row) =>
          row.attempt < row.max_attempts &&
          (row.status === 'pending' ||
            (row.leased_until !== null && new Date(row.leased_until).getTime() <= now.getTime())),
      )
      .map(jobFromRow);
  }

  async atomicClaim(input: AtomicClaimInput): Promise<AgentJob | undefined> {
    const leaseSeconds = Math.round((input.leaseUntil.getTime() - input.now.getTime()) / 1_000);
    const result = await createSupabaseAdminClient().rpc('claim_agent_job', {
      requested_claim_token_hash: bytea(input.claimTokenHash),
      requested_device_id: input.deviceId,
      requested_job_id: input.jobId,
      requested_lease_seconds: leaseSeconds,
      requested_tenant_id: input.tenantId,
    });
    if (result.error !== null) {
      throw new Error('The Desktop Job could not be claimed.');
    }
    const row = z.array(AgentJobRowSchema).parse(result.data)[0];
    return row === undefined ? undefined : jobFromRow(row);
  }

  async renewLease(
    input: ActiveJobInput & { readonly leaseUntil: Date },
  ): Promise<AgentJob | undefined> {
    const leaseSeconds = Math.round((input.leaseUntil.getTime() - input.now.getTime()) / 1_000);
    const result = await createSupabaseAdminClient().rpc('renew_agent_job_lease', {
      requested_claim_token_hash: bytea(input.claimTokenHash),
      requested_device_id: input.deviceId,
      requested_job_id: input.jobId,
      requested_lease_seconds: leaseSeconds,
      requested_tenant_id: input.tenantId,
    });
    if (result.error !== null) {
      throw new Error('The Desktop Job lease could not be renewed.');
    }
    const row = z.array(AgentJobRowSchema).parse(result.data)[0];
    return row === undefined ? undefined : jobFromRow(row);
  }

  async recordProgress(
    input: ActiveJobInput & { readonly eventId: string; readonly step: StepResult },
  ): Promise<{ readonly duplicate: boolean; readonly job: AgentJob } | undefined> {
    const step = StepResultSchema.parse(input.step);
    const result = await createSupabaseAdminClient().rpc('record_agent_job_progress', {
      requested_claim_token_hash: bytea(input.claimTokenHash),
      requested_device_id: input.deviceId,
      requested_event_key: input.eventId,
      requested_job_id: input.jobId,
      requested_payload: { step },
      requested_tenant_id: input.tenantId,
    });
    if (result.error !== null) {
      throw new Error('Desktop Job progress could not be recorded.');
    }
    const job = await readJob(input.tenantId, input.deviceId, input.jobId);
    if (job === undefined || !['claimed', 'running'].includes(job.status)) return undefined;
    return { duplicate: result.data !== true, job };
  }

  async finishJob(
    input: ActiveJobInput & {
      readonly eventId: string;
      readonly payload: Readonly<Record<string, unknown>>;
      readonly status: 'failed' | 'succeeded';
    },
  ): Promise<{ readonly duplicate: boolean; readonly job: AgentJob } | undefined> {
    const duplicateBefore = await eventExists(input.tenantId, input.jobId, input.eventId);
    const result = await createSupabaseAdminClient().rpc('finish_agent_job', {
      requested_claim_token_hash: bytea(input.claimTokenHash),
      requested_device_id: input.deviceId,
      requested_event_key: input.eventId,
      requested_job_id: input.jobId,
      requested_payload: input.payload,
      requested_status: input.status,
      requested_tenant_id: input.tenantId,
    });
    if (result.error !== null) {
      throw new Error('The Desktop Job result could not be recorded.');
    }
    const row = z.array(AgentJobRowSchema).parse(result.data)[0];
    return row === undefined ? undefined : { duplicate: duplicateBefore, job: jobFromRow(row) };
  }

  async cancelJob(tenantId: string, jobId: string, now: Date): Promise<boolean> {
    const result = await createSupabaseAdminClient()
      .from('agent_jobs')
      .update({
        completed_at: now.toISOString(),
        leased_until: null,
        status: 'cancelled',
        updated_at: now.toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', jobId)
      .in('status', ['pending', 'claimed', 'running'])
      .select('id');
    if (result.error !== null) {
      throw new Error('The Desktop Job could not be cancelled.');
    }
    return z.array(z.object({ id: z.string().uuid() })).parse(result.data).length === 1;
  }

  async revokeDevice(tenantId: string, deviceId: string, now: Date): Promise<boolean> {
    const result = await createSupabaseAdminClient().rpc('revoke_agent_device', {
      requested_device_id: deviceId,
      requested_now: now.toISOString(),
      requested_tenant_id: tenantId,
    });
    if (result.error !== null) {
      throw new Error('The Desktop Agent could not be revoked.');
    }
    return result.data === true;
  }
}
