import { describe, expect, it } from 'vitest';

import { AssistantWorkflowDraftSummarySchema } from './assistant-execution-schema';

const validDraft = {
  conversationId: '10000000-0000-4000-8000-000000000001',
  createdAt: '2026-07-27T14:30:00.000Z',
  definitionHash: 'a'.repeat(64),
  id: '20000000-0000-4000-8000-000000000001',
  messageId: '30000000-0000-4000-8000-000000000001',
  name: 'Reviewed workflow',
  nodeCount: 4,
  risk: {
    destructive: 0,
    external: 0,
    read: 2,
    requiresApproval: true,
    write: 1,
  },
  status: 'draft',
  version: 1,
  workflowId: '40000000-0000-4000-8000-000000000001',
  workflowVersionId: '50000000-0000-4000-8000-000000000001',
} as const;

describe('assistant execution schema', () => {
  it('accepts a bounded reviewed Workflow v1 draft summary', () => {
    expect(AssistantWorkflowDraftSummarySchema.parse(validDraft)).toEqual(validDraft);
  });

  it('rejects mutable versions, malformed hashes, and unknown fields', () => {
    expect(() =>
      AssistantWorkflowDraftSummarySchema.parse({
        ...validDraft,
        definitionHash: 'unsafe',
        version: 2,
      }),
    ).toThrow();
    expect(() =>
      AssistantWorkflowDraftSummarySchema.parse({ ...validDraft, shellCommand: 'rm -rf .' }),
    ).toThrow();
  });
});
