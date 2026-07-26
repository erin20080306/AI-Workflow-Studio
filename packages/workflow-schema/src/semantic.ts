import { NODE_CATALOG_BY_TYPE, type NodeCatalogEntry, type RiskLevel } from './node-catalog';
import { WorkflowSchema, type Workflow } from './workflow';

export type WorkflowValidationCode =
  | 'WORKFLOW_APPROVAL_REQUIRED'
  | 'WORKFLOW_CYCLE_DETECTED'
  | 'WORKFLOW_DISCONNECTED'
  | 'WORKFLOW_DUPLICATE_EDGE'
  | 'WORKFLOW_DUPLICATE_NODE_ID'
  | 'WORKFLOW_EDGE_INVALID'
  | 'WORKFLOW_EXECUTION_TARGET_INVALID'
  | 'WORKFLOW_NODE_UNKNOWN'
  | 'WORKFLOW_SCHEMA_INVALID';

export interface WorkflowValidationIssue {
  readonly code: WorkflowValidationCode;
  readonly message: string;
  readonly nodeId?: string;
  readonly path?: string;
}

export interface WorkflowValidationResult {
  readonly issues: readonly WorkflowValidationIssue[];
  readonly success: boolean;
  readonly workflow?: Workflow;
}

export interface RiskNodeSummary {
  readonly approvalMode: NodeCatalogEntry['approvalMode'];
  readonly description: string;
  readonly nodeId: string;
  readonly riskLevel: RiskLevel;
  readonly type: NodeCatalogEntry['type'];
}

export interface WorkflowRiskSummary {
  readonly destructive: readonly RiskNodeSummary[];
  readonly external: readonly RiskNodeSummary[];
  readonly read: readonly RiskNodeSummary[];
  readonly requiresApproval: boolean;
  readonly write: readonly RiskNodeSummary[];
}

function detectCycle(workflow: Workflow): readonly string[] | undefined {
  const adjacency = new Map<string, string[]>(
    workflow.nodes.map((workflowNode) => [workflowNode.id, []]),
  );
  const inDegree = new Map<string, number>(
    workflow.nodes.map((workflowNode) => [workflowNode.id, 0]),
  );

  for (const edge of workflow.edges) {
    adjacency.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const queue = [...inDegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([nodeId]) => nodeId)
    .sort();
  const visited: string[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (nodeId === undefined) {
      break;
    }
    visited.push(nodeId);

    for (const target of adjacency.get(nodeId) ?? []) {
      const degree = (inDegree.get(target) ?? 0) - 1;
      inDegree.set(target, degree);
      if (degree === 0) {
        queue.push(target);
        queue.sort();
      }
    }
  }

  if (visited.length === workflow.nodes.length) {
    return undefined;
  }

  return workflow.nodes.map((node) => node.id).filter((nodeId) => !visited.includes(nodeId));
}

function findDisconnectedNodes(workflow: Workflow): readonly string[] {
  if (workflow.nodes.length <= 1) {
    return [];
  }

  const neighbors = new Map<string, Set<string>>(
    workflow.nodes.map((workflowNode) => [workflowNode.id, new Set()]),
  );
  for (const edge of workflow.edges) {
    neighbors.get(edge.from)?.add(edge.to);
    neighbors.get(edge.to)?.add(edge.from);
  }

  const firstNodeId = workflow.nodes[0]?.id;
  if (firstNodeId === undefined) {
    return [];
  }

  const visited = new Set<string>();
  const queue = [firstNodeId];
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (nodeId === undefined || visited.has(nodeId)) {
      continue;
    }
    visited.add(nodeId);
    queue.push(...(neighbors.get(nodeId) ?? []));
  }

  return workflow.nodes.map((node) => node.id).filter((nodeId) => !visited.has(nodeId));
}

export function validateWorkflow(input: unknown): WorkflowValidationResult {
  const parsed = WorkflowSchema.safeParse(input);
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((issue) => ({
        code: 'WORKFLOW_SCHEMA_INVALID',
        message: issue.message,
        path: issue.path.map(String).join('.'),
      })),
      success: false,
    };
  }

  const workflow = parsed.data;
  const issues: WorkflowValidationIssue[] = [];
  const nodeIds = new Set<string>();

  for (const workflowNode of workflow.nodes) {
    if (nodeIds.has(workflowNode.id)) {
      issues.push({
        code: 'WORKFLOW_DUPLICATE_NODE_ID',
        message: `Node id "${workflowNode.id}" is duplicated.`,
        nodeId: workflowNode.id,
      });
    }
    nodeIds.add(workflowNode.id);

    const definition = NODE_CATALOG_BY_TYPE.get(workflowNode.type);
    if (definition === undefined || definition.version !== workflowNode.version) {
      issues.push({
        code: 'WORKFLOW_NODE_UNKNOWN',
        message: `Node "${workflowNode.type}" version ${workflowNode.version} is not registered.`,
        nodeId: workflowNode.id,
      });
      continue;
    }

    if (definition.executionLocation === 'desktop' && workflow.executionTarget.type !== 'desktop') {
      issues.push({
        code: 'WORKFLOW_EXECUTION_TARGET_INVALID',
        message: `Node "${workflowNode.type}" requires a desktop execution target.`,
        nodeId: workflowNode.id,
      });
    }
  }

  const edgeKeys = new Set<string>();
  for (const edge of workflow.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to) || edge.from === edge.to) {
      issues.push({
        code: 'WORKFLOW_EDGE_INVALID',
        message: `Edge "${edge.from}" → "${edge.to}" is invalid.`,
      });
    }

    const edgeKey = `${edge.from}\u0000${edge.to}`;
    if (edgeKeys.has(edgeKey)) {
      issues.push({
        code: 'WORKFLOW_DUPLICATE_EDGE',
        message: `Edge "${edge.from}" → "${edge.to}" is duplicated.`,
      });
    }
    edgeKeys.add(edgeKey);
  }

  if (!issues.some((issue) => issue.code === 'WORKFLOW_EDGE_INVALID')) {
    const cyclicNodeIds = detectCycle(workflow);
    if (cyclicNodeIds !== undefined) {
      issues.push({
        code: 'WORKFLOW_CYCLE_DETECTED',
        message: `Workflow contains a cycle involving: ${cyclicNodeIds.join(', ')}.`,
      });
    }

    const disconnectedNodeIds = findDisconnectedNodes(workflow);
    if (disconnectedNodeIds.length > 0) {
      issues.push({
        code: 'WORKFLOW_DISCONNECTED',
        message: `Workflow contains disconnected nodes: ${disconnectedNodeIds.join(', ')}.`,
      });
    }
  }

  return {
    issues,
    success: issues.length === 0,
    workflow,
  };
}

export function summarizeWorkflowRisks(workflow: Workflow): WorkflowRiskSummary {
  const groups: Record<RiskLevel, RiskNodeSummary[]> = {
    destructive: [],
    external: [],
    read: [],
    write: [],
  };

  for (const workflowNode of workflow.nodes) {
    const definition = NODE_CATALOG_BY_TYPE.get(workflowNode.type);
    if (definition === undefined) {
      continue;
    }
    groups[definition.riskLevel].push({
      approvalMode: definition.approvalMode,
      description: definition.description,
      nodeId: workflowNode.id,
      riskLevel: definition.riskLevel,
      type: definition.type,
    });
  }

  return {
    destructive: groups.destructive,
    external: groups.external,
    read: groups.read,
    requiresApproval: [...groups.destructive, ...groups.external, ...groups.write].some(
      (node) => node.approvalMode !== 'none',
    ),
    write: groups.write,
  };
}
