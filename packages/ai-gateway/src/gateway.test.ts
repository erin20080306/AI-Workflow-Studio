import { describe, expect, it } from 'vitest';

import { AiGatewayError } from './errors';
import { AiGateway } from './gateway';
import { MockAiAdapter } from './providers/mock';
import type {
  AiProviderAdapter,
  ProviderCompletion,
  ProviderCompletionRequest,
  UsageSink,
} from './types';
import { InMemoryUsageSink } from './usage';

const DEVICE_ID = '00000000-0000-4000-8000-000000000601';
const FOLDER_ID = '00000000-0000-4000-8000-000000000602';

const plannerRequest = {
  context: {
    allowedFolderAliasIds: [FOLDER_ID],
    executionTarget: {
      deviceId: DEVICE_ID,
      type: 'desktop' as const,
    },
    locale: 'zh-Hant',
    timezone: 'Asia/Taipei',
  },
  maxRepairAttempts: 1,
  prompt: '每天整理訂單 Excel，依訂單編號去重，並建立一份不覆寫原檔的彙整報表。',
};

class StaticAdapter implements AiProviderAdapter {
  calls = 0;
  readonly model = 'static-test-model';
  readonly provider = 'mock' as const;

  constructor(private readonly outputs: readonly string[]) {}

  async complete(_request: ProviderCompletionRequest): Promise<ProviderCompletion> {
    const text = this.outputs[Math.min(this.calls, this.outputs.length - 1)] ?? '';
    this.calls += 1;
    return {
      model: this.model,
      text,
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      },
    };
  }
}

describe('AiGateway', () => {
  it('returns a validated Mock plan and records redacted usage', async () => {
    const usage = new InMemoryUsageSink();
    const gateway = new AiGateway(new MockAiAdapter(), usage);
    const result = await gateway.plan(plannerRequest);

    expect(result.provider).toBe('mock');
    expect(result.attempts).toBe(1);
    expect(result.output.workflow.executionTarget).toEqual(plannerRequest.context.executionTarget);
    expect(result.output.workflow.nodes).toHaveLength(4);
    expect(JSON.stringify(usage.records)).not.toContain(plannerRequest.prompt);
    expect(usage.records).toMatchObject([
      {
        attempt: 1,
        operation: 'workflow_plan',
        outcome: 'succeeded',
        provider: 'mock',
        validationCodes: [],
      },
    ]);
  });

  it('repairs an invalid first response once and aggregates usage', async () => {
    const mockCompletion = await new MockAiAdapter().complete({
      attempt: 2,
      jsonSchema: {},
      maxOutputTokens: 12_000,
      operation: 'workflow_plan',
      plannerRequest,
      schemaName: 'workflow_plan',
      systemPrompt: 'system',
      userPrompt: 'user',
    });
    const adapter = new StaticAdapter(['not-json', mockCompletion.text]);
    const usage = new InMemoryUsageSink();
    const result = await new AiGateway(adapter, usage).plan(plannerRequest);

    expect(result.attempts).toBe(2);
    expect(result.usage).toEqual({
      inputTokens: 20,
      outputTokens: 40,
      totalTokens: 60,
    });
    expect(usage.records.map((record) => record.outcome)).toEqual(['invalid', 'succeeded']);
  });

  it('releases a validated read-only fallback after the bounded repair limit', async () => {
    const adapter = new StaticAdapter(['```json\n{}\n```']);
    const usage = new InMemoryUsageSink();

    const result = await new AiGateway(adapter, usage).plan({
      ...plannerRequest,
      maxRepairAttempts: 2,
    });

    expect(result.output.workflow.nodes).toMatchObject([
      { id: 'validate_input', type: 'data.validate' },
    ]);
    expect(result.output.workflow.executionTarget).toEqual(plannerRequest.context.executionTarget);
    expect(result.output.assumptions.join(' ')).toContain('server-side normalization');
    expect(adapter.calls).toBe(3);
    expect(usage.records).toHaveLength(3);
    expect(usage.records.map((record) => record.outcome)).toEqual([
      'invalid',
      'invalid',
      'succeeded',
    ]);
  });

  it('never releases an unknown executable node and replaces it with a safe fallback', async () => {
    const malicious = JSON.stringify({
      assumptions: [],
      explanation: 'Run a command.',
      mappingProposals: [],
      workflow: {
        description: 'Unsafe',
        edges: [],
        executionTarget: { type: 'cloud' },
        name: 'Unsafe shell',
        nodes: [
          {
            config: { command: 'rm -rf /' },
            id: 'run_shell',
            type: 'shell.execute',
            version: 1,
          },
        ],
        schemaVersion: 1,
        trigger: { config: {}, type: 'manual.trigger' },
      },
    });

    const result = await new AiGateway(
      new StaticAdapter([malicious]),
      new InMemoryUsageSink(),
    ).plan({
      ...plannerRequest,
      maxRepairAttempts: 0,
    });

    expect(result.output.workflow.nodes).toMatchObject([
      { id: 'validate_input', type: 'data.validate' },
    ]);
    expect(JSON.stringify(result.output)).not.toContain('shell.execute');
    expect(JSON.stringify(result.output)).not.toContain('rm -rf');
  });

  it('withholds a valid output when usage logging fails', async () => {
    const failingSink: UsageSink = {
      async record() {
        throw new Error('mock usage database unavailable');
      },
    };

    await expect(
      new AiGateway(new MockAiAdapter(), failingSink).plan(plannerRequest),
    ).rejects.toMatchObject({
      code: 'AI_USAGE_LOG_FAILED',
      name: AiGatewayError.name,
    });
  });

  it('rejects an underspecified request before calling the provider', async () => {
    const adapter = new StaticAdapter(['{}']);

    await expect(
      new AiGateway(adapter, new InMemoryUsageSink()).plan({ prompt: 'short' }),
    ).rejects.toMatchObject({ code: 'AI_REQUEST_INVALID' });
    expect(adapter.calls).toBe(0);
  });

  it('accepts a short meaningful workflow phrase and fills safe defaults', async () => {
    const usage = new InMemoryUsageSink();
    const result = await new AiGateway(new MockAiAdapter(), usage).plan({
      context: {
        allowedFolderAliasIds: [],
        executionTarget: { type: 'cloud' },
        locale: 'zh-Hant',
        timezone: 'Asia/Taipei',
      },
      maxRepairAttempts: 1,
      prompt: '整理訂單',
    });

    expect(result.output.workflow.trigger).toEqual({ config: {}, type: 'manual.trigger' });
    expect(result.output.workflow.executionTarget).toEqual({ type: 'cloud' });
    expect(result.output.assumptions.length).toBeGreaterThan(0);
  });
});
