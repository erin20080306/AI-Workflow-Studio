import { AgentJobListSchema, type AgentJob } from '@ai-workflow-studio/agent-protocol';
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

const MAX_RESPONSE_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 15_000;
const HEALTHY_POLL_MS = 15_000;
const MIN_RECONNECT_MS = 5_000;
const MAX_RECONNECT_MS = 60_000;

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

export interface AgentClientOptions {
  readonly agentVersion: string;
  readonly fetchTransport?: AgentFetch;
  readonly logger: SafeAgentLogger;
  readonly onStatus: (status: AgentClientStatus) => void;
  readonly vault: SessionVault;
}

export interface SessionVault {
  clear(): Promise<void>;
  load(): Promise<PairingSession | undefined>;
  save(session: PairingSession): Promise<void>;
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
  private readonly fetchTransport: AgentFetch;
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
    this.fetchTransport = options.fetchTransport ?? fetch;
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

  private async requestJson<T>(url: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = init.signal == null ? timeout : AbortSignal.any([timeout, init.signal]);
    const response = await this.fetchTransport(url, { ...init, signal });
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new Error('Agent server response is too large.');
    }
    if (!response.ok) {
      throw new Error(`Agent server request failed with status ${response.status}.`);
    }
    let value: unknown;
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      throw new Error('Agent server returned invalid JSON.');
    }
    return schema.parse(value);
  }

  private async runCycle(): Promise<void> {
    if (!this.executorRunning) {
      return;
    }
    this.abortController = new AbortController();
    try {
      const jobs = await this.pollOnce(this.abortController.signal);
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

  private setStatus(status: AgentClientStatus): void {
    this.status = structuredClone(status);
    this.onStatus(this.getStatus());
  }
}
