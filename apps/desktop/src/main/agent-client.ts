import {
  AgentCloudStepResponseSchema,
  AgentJobListSchema,
  AgentJobSchema,
  JsonValueSchema,
  StepResultSchema,
  type AgentJob,
  type JsonValue,
  type StepResult,
} from '@ai-workflow-studio/agent-protocol';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { PairingSession } from './token-vault';

const PairingResponseSchema = z
  .object({
    device: z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120),
        status: z.string(),
        tenantId: z.string().uuid(),
      })
      .strict(),
    deviceToken: z.string().regex(/^dvt_[A-Za-z0-9_-]{40,60}$/),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();

const JobResponseSchema = z
  .object({
    jobs: AgentJobListSchema,
  })
  .strict();
const ClaimResponseSchema = z
  .object({
    claimToken: z.string().regex(/^clm_[A-Za-z0-9_-]{40,60}$/),
    job: AgentJobSchema,
  })
  .strict();
const LeaseResponseSchema = z
  .object({
    job: AgentJobSchema,
  })
  .strict();
const JobMutationResponseSchema = z
  .object({
    duplicate: z.boolean(),
    job: AgentJobSchema,
  })
  .strict();
const DriveExcelTransferFileSchema = z
  .object({
    downloadToken: z.string().min(40).max(2_000),
    fileId: z
      .string()
      .min(8)
      .max(300)
      .regex(/^[A-Za-z0-9_-]+$/),
    fileName: z.string().trim().min(1).max(220),
    mimeType: z.enum(['google_sheet', 'xlsx']),
    size: z.number().int().nonnegative().optional(),
  })
  .strict();
const DriveExcelTransferManifestSchema = z
  .object({
    expiresAt: z.iso.datetime({ offset: true }),
    files: z.array(DriveExcelTransferFileSchema).min(1).max(500),
    folderId: z
      .string()
      .min(8)
      .max(300)
      .regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();

const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_BINARY_RESPONSE_BYTES = 20_000_000;
const REQUEST_TIMEOUT_MS = 15_000;
const BINARY_REQUEST_TIMEOUT_MS = 60_000;
const CLOUD_STEP_REQUEST_TIMEOUT_MS = 600_000;
const HEALTHY_POLL_MS = 15_000;
const MIN_RECONNECT_MS = 5_000;
const MAX_RECONNECT_MS = 60_000;
const JOB_LEASE_SECONDS = 120;
const JOB_LEASE_RENEW_MS = 45_000;

export interface AgentClientStatus {
  readonly connection: 'offline' | 'online' | 'reconnecting' | 'unpaired';
  readonly deviceName?: string;
  readonly lastHeartbeatAt?: string;
  readonly paired: boolean;
  readonly pendingJobCount: number;
}

export interface SafeAgentLogger {
  info(code: string, message: string, metadata?: Readonly<Record<string, unknown>>): void;
  warn(code: string, message: string, metadata?: Readonly<Record<string, unknown>>): void;
}

export type AgentFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface AgentJobReporter {
  readonly signal: AbortSignal;
  downloadDriveExcelFile(nodeId: string, file: DriveExcelTransferFile): Promise<Uint8Array>;
  executeCloudStep(
    nodeId: string,
    input: JsonValue,
  ): Promise<z.infer<typeof AgentCloudStepResponseSchema>>;
  listDriveExcelFiles(nodeId: string): Promise<DriveExcelTransferManifest>;
  reportStep(step: StepResult): Promise<void>;
}

export type DriveExcelTransferFile = z.infer<typeof DriveExcelTransferFileSchema>;
export type DriveExcelTransferManifest = z.infer<typeof DriveExcelTransferManifestSchema>;

export type AgentJobHandler = (
  job: AgentJob,
  reporter: AgentJobReporter,
) => Promise<JsonValue | undefined>;

export interface AgentClientOptions {
  readonly agentVersion: string;
  readonly executeJob?: AgentJobHandler;
  readonly fetchTransport?: AgentFetch;
  readonly listFolderAliases?: () => Promise<
    readonly {
      readonly displayName: string;
      readonly folderAliasId: string;
      readonly permissions: {
        readonly read: boolean;
        readonly watch: boolean;
        readonly write: boolean;
      };
    }[]
  >;
  readonly logger: SafeAgentLogger;
  readonly onStatus: (status: AgentClientStatus) => void;
  readonly vault: SessionVault;
}

export interface SessionVault {
  clear(): Promise<void>;
  load(): Promise<PairingSession | undefined>;
  save(session: PairingSession): Promise<void>;
}

class AgentHttpError extends Error {
  constructor(readonly status: number) {
    super(`Agent server request failed with status ${status}.`);
    this.name = 'AgentHttpError';
  }
}

function validateBaseUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Agent server URL is invalid.');
  }
  const localHttp =
    url.protocol === 'http:' && ['127.0.0.1', '::1', '[::1]', 'localhost'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !localHttp) ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('Agent server must use HTTPS, except for localhost development.');
  }
  return url.origin;
}

export class AgentClient {
  private readonly agentVersion: string;
  private readonly executeJobHandler: AgentJobHandler | undefined;
  private readonly fetchTransport: AgentFetch;
  private readonly listFolderAliases: AgentClientOptions['listFolderAliases'] | undefined;
  private readonly logger: SafeAgentLogger;
  private readonly onStatus: (status: AgentClientStatus) => void;
  private readonly vault: SessionVault;
  private abortController: AbortController | undefined;
  private executorRunning = false;
  private reconnectDelayMs = MIN_RECONNECT_MS;
  private session: PairingSession | undefined;
  private status: AgentClientStatus = {
    connection: 'unpaired',
    paired: false,
    pendingJobCount: 0,
  };
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: AgentClientOptions) {
    this.agentVersion = options.agentVersion;
    this.executeJobHandler = options.executeJob;
    this.fetchTransport = options.fetchTransport ?? fetch;
    this.listFolderAliases = options.listFolderAliases;
    this.logger = options.logger;
    this.onStatus = options.onStatus;
    this.vault = options.vault;
  }

  async clearSession(): Promise<void> {
    this.stop();
    await this.vault.clear();
    this.session = undefined;
    this.setStatus({
      connection: 'unpaired',
      paired: false,
      pendingJobCount: 0,
    });
    this.logger.info('AGENT_SESSION_CLEARED', 'Device session was removed from secure storage.');
  }

  getStatus(): AgentClientStatus {
    return structuredClone(this.status);
  }

  getSession(): PairingSession | undefined {
    return this.session === undefined ? undefined : structuredClone(this.session);
  }

  async initialize(): Promise<void> {
    this.session = await this.vault.load();
    this.setStatus(
      this.session === undefined
        ? { connection: 'unpaired', paired: false, pendingJobCount: 0 }
        : {
            connection: 'offline',
            deviceName: this.session.deviceName,
            paired: true,
            pendingJobCount: 0,
          },
    );
  }

  async pair(agentBaseUrlInput: string, pairingCode: string): Promise<PairingSession> {
    const agentBaseUrl = validateBaseUrl(agentBaseUrlInput);
    const response = await this.requestJson(
      `${agentBaseUrl}/api/agent/pair/complete`,
      {
        body: JSON.stringify({
          agentVersion: this.agentVersion,
          pairingCode,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
      PairingResponseSchema,
    );
    const session: PairingSession = {
      agentBaseUrl,
      deviceId: response.device.id,
      deviceName: response.device.name,
      deviceToken: response.deviceToken,
      expiresAt: response.expiresAt,
      tenantId: response.device.tenantId,
    };
    await this.vault.save(session);
    this.session = session;
    this.setStatus({
      connection: 'offline',
      deviceName: session.deviceName,
      paired: true,
      pendingJobCount: 0,
    });
    this.logger.info('AGENT_PAIRED', 'Device pairing completed.', {
      deviceId: session.deviceId,
    });
    return structuredClone(session);
  }

  async pollOnce(signal?: AbortSignal): Promise<readonly AgentJob[]> {
    const session = this.requireSession();
    const folderAliases = ((await this.listFolderAliases?.()) ?? []).map((alias) => ({
      displayName: alias.displayName,
      folderAliasId: alias.folderAliasId,
      permissions: {
        read: alias.permissions.read,
        watch: alias.permissions.watch,
        write: alias.permissions.write,
      },
    }));
    const requestTimestamp = new Date().toISOString();
    const headers = {
      authorization: `Bearer ${session.deviceToken}`,
      'content-type': 'application/json',
      'x-request-timestamp': requestTimestamp,
    };
    await this.requestJson(
      `${session.agentBaseUrl}/api/agent/heartbeat`,
      {
        body: JSON.stringify({
          agentVersion: this.agentVersion,
          executorRunning: this.executorRunning,
          metadata: {
            folderAliases,
            platform: process.platform,
          },
        }),
        headers,
        method: 'POST',
        ...(signal === undefined ? {} : { signal }),
      },
      z.object({ acceptedAt: z.iso.datetime({ offset: true }), deviceStatus: z.string() }).strict(),
    );
    const jobResponse = await this.requestJson(
      `${session.agentBaseUrl}/api/agent/jobs`,
      {
        headers: {
          authorization: `Bearer ${session.deviceToken}`,
          'x-request-timestamp': new Date().toISOString(),
        },
        method: 'GET',
        ...(signal === undefined ? {} : { signal }),
      },
      JobResponseSchema,
    );
    this.reconnectDelayMs = MIN_RECONNECT_MS;
    this.setStatus({
      connection: 'online',
      deviceName: session.deviceName,
      lastHeartbeatAt: new Date().toISOString(),
      paired: true,
      pendingJobCount: jobResponse.jobs.length,
    });
    return jobResponse.jobs;
  }

  async processOnce(signal?: AbortSignal): Promise<readonly AgentJob[]> {
    const jobs = await this.pollOnce(signal);
    if (this.executeJobHandler === undefined) {
      return jobs;
    }
    for (const job of jobs) {
      if (signal?.aborted === true) {
        break;
      }
      await this.executePendingJob(job, signal);
    }
    if (jobs.length > 0) {
      this.setStatus({
        ...this.status,
        pendingJobCount: 0,
      });
    }
    return jobs;
  }

  start(): void {
    this.requireSession();
    if (this.executorRunning) {
      return;
    }
    this.executorRunning = true;
    this.logger.info('AGENT_EXECUTOR_STARTED', 'Agent heartbeat and job polling started.');
    this.schedule(0);
  }

  stop(): void {
    this.executorRunning = false;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.abortController?.abort();
    this.abortController = undefined;
    if (this.session !== undefined) {
      this.setStatus({
        ...this.status,
        connection: 'offline',
        pendingJobCount: 0,
      });
    }
  }

  isExecutorRunning(): boolean {
    return this.executorRunning;
  }

  private requireSession(): PairingSession {
    if (this.session === undefined) {
      throw new Error('Pair the Desktop Agent before starting the executor.');
    }
    return this.session;
  }

  private async requestJson<T>(
    url: string,
    init: RequestInit,
    schema: z.ZodType<T>,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init.signal == null ? timeout : AbortSignal.any([timeout, init.signal]);
    const response = await this.fetchTransport(url, { ...init, signal });
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new Error('Agent server response is too large.');
    }
    if (!response.ok) {
      throw new AgentHttpError(response.status);
    }
    let value: unknown;
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      throw new Error('Agent server returned invalid JSON.');
    }
    return schema.parse(value);
  }

  private async requestBinary(url: string, init: RequestInit): Promise<Uint8Array> {
    const timeout = AbortSignal.timeout(BINARY_REQUEST_TIMEOUT_MS);
    const signal = init.signal == null ? timeout : AbortSignal.any([timeout, init.signal]);
    const response = await this.fetchTransport(url, { ...init, signal });
    if (!response.ok) throw new AgentHttpError(response.status);
    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BINARY_RESPONSE_BYTES) {
      throw new Error('Agent binary response is too large.');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_BINARY_RESPONSE_BYTES) {
      throw new Error('Agent binary response is too large.');
    }
    return bytes;
  }

  private async runCycle(): Promise<void> {
    if (!this.executorRunning) {
      return;
    }
    this.abortController = new AbortController();
    try {
      const jobs = await this.processOnce(this.abortController.signal);
      if (jobs.length > 0) {
        this.logger.info('AGENT_JOBS_AVAILABLE', 'Pending Agent jobs are available.', {
          count: jobs.length,
        });
      }
      this.schedule(HEALTHY_POLL_MS);
    } catch (error) {
      if (!this.executorRunning) {
        return;
      }
      this.setStatus({
        ...this.status,
        connection: 'reconnecting',
        pendingJobCount: 0,
      });
      this.logger.warn('AGENT_RECONNECTING', 'Agent connection failed; retry scheduled.', {
        retryInMs: this.reconnectDelayMs,
        type: error instanceof Error ? error.name : 'UnknownError',
      });
      const delay = this.reconnectDelayMs;
      this.reconnectDelayMs = Math.min(MAX_RECONNECT_MS, this.reconnectDelayMs * 2);
      this.schedule(delay);
    } finally {
      this.abortController = undefined;
    }
  }

  private schedule(delayMs: number): void {
    if (!this.executorRunning) {
      return;
    }
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.runCycle();
    }, delayMs);
    this.timer.unref?.();
  }

  private async executePendingJob(job: AgentJob, parentSignal?: AbortSignal): Promise<void> {
    const session = this.requireSession();
    let claim: z.infer<typeof ClaimResponseSchema>;
    try {
      claim = await this.requestJson(
        `${session.agentBaseUrl}/api/agent/jobs/${job.id}/claim`,
        {
          body: JSON.stringify({ leaseSeconds: JOB_LEASE_SECONDS }),
          headers: this.deviceHeaders(session),
          method: 'POST',
          ...(parentSignal === undefined ? {} : { signal: parentSignal }),
        },
        ClaimResponseSchema,
      );
    } catch (error) {
      if (error instanceof AgentHttpError && error.status === 409) {
        this.logger.info('AGENT_JOB_ALREADY_CLAIMED', 'Agent job claim was already active.', {
          jobId: job.id,
        });
        return;
      }
      throw error;
    }

    const controller = new AbortController();
    const onParentAbort = () => controller.abort(parentSignal?.reason);
    parentSignal?.addEventListener('abort', onParentAbort, { once: true });
    let leaseFailure: unknown;
    const renewLease = async () => {
      try {
        await this.requestJson(
          `${session.agentBaseUrl}/api/agent/jobs/${job.id}/lease`,
          {
            body: JSON.stringify({ leaseSeconds: JOB_LEASE_SECONDS }),
            headers: this.claimHeaders(session, claim.claimToken),
            method: 'POST',
            signal: controller.signal,
          },
          LeaseResponseSchema,
        );
      } catch (error) {
        leaseFailure = error;
        controller.abort('job_lease_lost');
      }
    };
    const leaseTimer = setInterval(() => void renewLease(), JOB_LEASE_RENEW_MS);
    leaseTimer.unref?.();

    const reportStep = async (stepInput: StepResult) => {
      const step = StepResultSchema.parse(stepInput);
      await this.requestJson(
        `${session.agentBaseUrl}/api/agent/jobs/${job.id}/progress`,
        {
          body: JSON.stringify({ eventId: randomUUID(), step }),
          headers: this.claimHeaders(session, claim.claimToken),
          method: 'POST',
          signal: controller.signal,
        },
        JobMutationResponseSchema,
      );
    };
    const listDriveExcelFiles = async (nodeId: string) => {
      return await this.requestJson(
        `${session.agentBaseUrl}/api/agent/jobs/${job.id}/drive-excel/${encodeURIComponent(nodeId)}/manifest`,
        {
          headers: this.claimHeaders(session, claim.claimToken),
          method: 'GET',
          signal: controller.signal,
        },
        DriveExcelTransferManifestSchema,
      );
    };
    const downloadDriveExcelFile = async (nodeId: string, fileInput: DriveExcelTransferFile) => {
      const file = DriveExcelTransferFileSchema.parse(fileInput);
      const query = new URLSearchParams({ token: file.downloadToken });
      return await this.requestBinary(
        `${session.agentBaseUrl}/api/agent/jobs/${job.id}/drive-excel/${encodeURIComponent(nodeId)}/files/${encodeURIComponent(file.fileId)}?${query}`,
        {
          headers: this.claimHeaders(session, claim.claimToken),
          method: 'GET',
          signal: controller.signal,
        },
      );
    };
    const executeCloudStep = async (nodeId: string, input: JsonValue) => {
      return await this.requestJson(
        `${session.agentBaseUrl}/api/agent/jobs/${job.id}/cloud-steps/${encodeURIComponent(nodeId)}`,
        {
          body: JSON.stringify({ input: JsonValueSchema.parse(input) }),
          headers: this.claimHeaders(session, claim.claimToken),
          method: 'POST',
          signal: controller.signal,
        },
        AgentCloudStepResponseSchema,
        CLOUD_STEP_REQUEST_TIMEOUT_MS,
      );
    };

    try {
      this.logger.info('AGENT_JOB_STARTED', 'Desktop execution started for a claimed job.', {
        attempt: claim.job.attempt,
        jobId: job.id,
      });
      const result = await this.executeJobHandler?.(claim.job, {
        downloadDriveExcelFile,
        executeCloudStep,
        listDriveExcelFiles,
        reportStep,
        signal: controller.signal,
      });
      if (leaseFailure !== undefined || controller.signal.aborted) {
        throw leaseFailure ?? new Error('Desktop job execution was cancelled.');
      }
      await this.requestJson(
        `${session.agentBaseUrl}/api/agent/jobs/${job.id}/complete`,
        {
          body: JSON.stringify({
            eventId: randomUUID(),
            ...(result === undefined ? {} : { result: JsonValueSchema.parse(result) }),
          }),
          headers: this.claimHeaders(session, claim.claimToken),
          method: 'POST',
          signal: controller.signal,
        },
        JobMutationResponseSchema,
      );
      this.logger.info('AGENT_JOB_COMPLETED', 'Desktop execution completed.', {
        jobId: job.id,
      });
    } catch (error) {
      if (parentSignal?.aborted === true || leaseFailure !== undefined) {
        this.logger.warn(
          'AGENT_JOB_LEASE_LOST',
          'Desktop execution stopped after losing its lease.',
          {
            jobId: job.id,
          },
        );
        return;
      }
      const failure = safeJobFailure(error);
      try {
        await this.requestJson(
          `${session.agentBaseUrl}/api/agent/jobs/${job.id}/fail`,
          {
            body: JSON.stringify({
              error: failure,
              eventId: randomUUID(),
            }),
            headers: this.claimHeaders(session, claim.claimToken),
            method: 'POST',
            signal: controller.signal,
          },
          JobMutationResponseSchema,
        );
      } catch (reportError) {
        this.logger.warn('AGENT_JOB_FAILURE_REPORT_REJECTED', 'Job failure report was rejected.', {
          jobId: job.id,
          type: reportError instanceof Error ? reportError.name : 'UnknownError',
        });
      }
      this.logger.warn('AGENT_JOB_FAILED', failure.message, {
        code: failure.code,
        jobId: job.id,
        retryable: failure.retryable,
      });
    } finally {
      clearInterval(leaseTimer);
      parentSignal?.removeEventListener('abort', onParentAbort);
    }
  }

  private deviceHeaders(session: PairingSession): Readonly<Record<string, string>> {
    return {
      authorization: `Bearer ${session.deviceToken}`,
      'content-type': 'application/json',
      'x-request-timestamp': new Date().toISOString(),
    };
  }

  private claimHeaders(
    session: PairingSession,
    claimToken: string,
  ): Readonly<Record<string, string>> {
    return {
      ...this.deviceHeaders(session),
      'x-job-claim-token': claimToken,
    };
  }

  private setStatus(status: AgentClientStatus): void {
    this.status = structuredClone(status);
    this.onStatus(this.getStatus());
  }
}

function safeJobFailure(error: unknown): {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
} {
  const candidate =
    typeof error === 'object' && error !== null
      ? (error as { readonly code?: unknown; readonly retryable?: unknown })
      : undefined;
  const code =
    typeof candidate?.code === 'string' && /^[A-Z][A-Z0-9_]{0,119}$/.test(candidate.code)
      ? candidate.code
      : 'DESKTOP_EXECUTION_FAILED';
  return {
    code,
    message: 'Desktop workflow execution failed. Review the redacted local Agent log.',
    retryable: candidate?.retryable === true,
  };
}
