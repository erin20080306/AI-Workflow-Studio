'use client';

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { NODE_CATALOG_BY_TYPE, type Workflow } from '@ai-workflow-studio/workflow-schema';
import { useMemo } from 'react';

import { NODE_PRESENTATION } from '@/lib/mock-workflows';

interface WorkflowFlowNodeData extends Record<string, unknown> {
  readonly category: string;
  readonly label: string;
  readonly requiresApproval: boolean;
  readonly risk: string;
}

type WorkflowFlowNode = Node<WorkflowFlowNodeData, 'workflow'>;

function WorkflowNodeCard({ data, selected }: NodeProps<WorkflowFlowNode>) {
  return (
    <button
      aria-label={`${data.label}，${data.category}`}
      className={`min-w-[184px] rounded-2xl border bg-white px-4 py-3 text-left shadow-[0_10px_28px_rgba(15,23,42,0.09)] transition ${
        selected
          ? 'border-indigo-500 ring-4 ring-indigo-100'
          : 'border-slate-200 hover:border-indigo-300'
      }`}
      type="button"
    >
      <Handle
        className="!size-2 !border-2 !border-white !bg-slate-400"
        position={Position.Left}
        type="target"
      />
      <div className="flex items-start justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
          {data.category}
        </span>
        <span
          className={`size-2 rounded-full ${
            data.risk === 'write' ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
        />
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-950">{data.label}</p>
      <p className="mt-1 text-[11px] text-slate-500">
        {data.requiresApproval ? '需要核准' : '安全讀取'}
      </p>
      <Handle
        className="!size-2 !border-2 !border-white !bg-indigo-500"
        position={Position.Right}
        type="source"
      />
    </button>
  );
}

const nodeTypes = {
  workflow: WorkflowNodeCard,
};

function toFlowNodes(workflow: Workflow): readonly WorkflowFlowNode[] {
  return workflow.nodes.map((workflowNode, index) => {
    const definition = NODE_CATALOG_BY_TYPE.get(workflowNode.type);
    const presentation = NODE_PRESENTATION[workflowNode.type];

    return {
      data: {
        category: presentation.category,
        label: presentation.label,
        requiresApproval: definition?.approvalMode !== 'none',
        risk: definition?.riskLevel ?? 'read',
      },
      id: workflowNode.id,
      position: {
        x: 40 + index * 238,
        y: index % 2 === 0 ? 118 : 150,
      },
      type: 'workflow',
    };
  });
}

function toFlowEdges(workflow: Workflow): readonly Edge[] {
  return workflow.edges.map((edge) => ({
    animated: false,
    id: `${edge.from}-${edge.to}`,
    markerEnd: {
      color: '#6366f1',
      height: 16,
      type: MarkerType.ArrowClosed,
      width: 16,
    },
    source: edge.from,
    style: {
      stroke: '#6366f1',
      strokeWidth: 2,
    },
    target: edge.to,
    type: 'smoothstep',
  }));
}

export function WorkflowFlowCanvas({
  onSelectNode,
  selectedNodeId,
  workflow,
}: Readonly<{
  onSelectNode: (nodeId: string) => void;
  selectedNodeId: string;
  workflow: Workflow;
}>) {
  const nodes = useMemo(
    () =>
      toFlowNodes(workflow).map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      })),
    [selectedNodeId, workflow],
  );
  const edges = useMemo(() => toFlowEdges(workflow), [workflow]);

  return (
    <div
      aria-label="工作流視覺化畫布"
      className="h-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-[#f8faf8]"
      role="region"
    >
      <ReactFlow
        colorMode="light"
        edges={[...edges]}
        elementsSelectable
        fitView
        fitViewOptions={{ maxZoom: 1, padding: 0.18 }}
        maxZoom={1.3}
        minZoom={0.5}
        nodeTypes={nodeTypes}
        nodes={[...nodes]}
        nodesConnectable={false}
        nodesDraggable={false}
        onNodeClick={(_event, node) => onSelectNode(node.id)}
        panOnScroll
        proOptions={{ hideAttribution: false }}
      >
        <Background color="#cbd5cf" gap={18} size={1.2} variant={BackgroundVariant.Dots} />
        <MiniMap
          maskColor="rgb(248 250 248 / 78%)"
          nodeColor={(node) =>
            (node.data as WorkflowFlowNodeData).risk === 'write' ? '#f59e0b' : '#6366f1'
          }
          pannable
          zoomable
        />
        <Controls position="bottom-right" showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
