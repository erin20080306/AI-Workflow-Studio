import { describe, expect, it } from 'vitest';

import {
  MOCK_WORKFLOW,
  MOCK_WORKFLOW_SUMMARIES,
  MOCK_WORKFLOW_VERSIONS,
  inspectMockWorkflow,
} from './mock-workflows';

describe('Mock Workflow fixture', () => {
  it('stays valid and exposes approval risk for the write node', () => {
    const inspection = inspectMockWorkflow(MOCK_WORKFLOW);

    expect(inspection.validation.success).toBe(true);
    expect(inspection.validation.issues).toEqual([]);
    expect(inspection.riskSummary.requiresApproval).toBe(true);
    expect(inspection.riskSummary.write.map((node) => node.nodeId)).toEqual([
      'create_order_report',
    ]);
  });

  it('keeps list and version fixtures internally consistent', () => {
    expect(MOCK_WORKFLOW_SUMMARIES[0]?.nodeCount).toBe(MOCK_WORKFLOW.nodes.length);
    expect(MOCK_WORKFLOW_VERSIONS[0]?.status).toBe('current');
  });
});
