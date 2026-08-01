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
import {
  NODE_CATALOG_BY_TYPE,
  type Workflow,
  type WorkflowNodeType,
} from '@ai-workflow-studio/workflow-schema';
import { useMemo, type ComponentType, type SVGProps } from 'react';

import { FileIcon, FlowIcon, FolderIcon, MailIcon, SparkIcon, TableIcon } from '@/components/icons';
import { useLanguage } from '@/components/language-provider';
import { NODE_PRESENTATION } from '@/lib/mock-workflows';

interface WorkflowFlowNodeData extends Record<string, unknown> {
  readonly category: string;
  readonly label: string;
  readonly locale: 'en' | 'zh-Hant';
  readonly nodeType: WorkflowNodeType;
  readonly requiresApproval: boolean;
  readonly risk: string;
  readonly stepNumber: number;
}

type WorkflowFlowNode = Node<WorkflowFlowNodeData, 'workflow'>;

type WorkflowIcon = ComponentType<SVGProps<SVGSVGElement>>;

function iconForNode(type: WorkflowNodeType): WorkflowIcon {
  if (type === 'ai.summarize') return SparkIcon;
  if (type.startsWith('gmail.')) return MailIcon;
  if (type.startsWith('excel.') || type.startsWith('google_sheets.')) return TableIcon;
  if (type.startsWith('folder.')) return FolderIcon;
  if (
    type === 'data.inline' ||
    type === 'report.compose' ||
    type === 'google_forms.read_responses' ||
    type === 'google_slides.create'
  ) {
    return FileIcon;
  }
  return FlowIcon;
}

function riskDot(risk: string): string {
  if (risk === 'destructive') return 'bg-rose-500';
  if (risk === 'external') return 'bg-violet-500';
  if (risk === 'write') return 'bg-amber-500';
  return 'bg-emerald-500';
}

function WorkflowNodeCard({ data, selected }: NodeProps<WorkflowFlowNode>) {
  const NodeIcon = iconForNode(data.nodeType);
  return (
    <button
      aria-label={`${data.label}, ${data.category}`}
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
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
            <NodeIcon className="size-4.5" />
          </span>
          <div className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              {data.category}
            </span>
            <span className="mt-0.5 block text-[10px] font-semibold text-slate-400">
              {data.locale === 'en' ? `Step ${data.stepNumber}` : `步驟 ${data.stepNumber}`}
            </span>
          </div>
        </div>
        <span className={`mt-1 size-2.5 shrink-0 rounded-full ${riskDot(data.risk)}`} />
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-950">{data.label}</p>
      <p className="mt-1 text-[11px] text-slate-500">
        {data.requiresApproval
          ? data.locale === 'en'
            ? 'Approval required'
            : '需要核准'
          : data.locale === 'en'
            ? 'Safe read'
            : '安全讀取'}
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

function toFlowNodes(workflow: Workflow, locale: 'en' | 'zh-Hant'): readonly WorkflowFlowNode[] {
  const presentationLocale = locale === 'en' ? 'en' : 'zhHant';
  return workflow.nodes.map((workflowNode, index) => {
    const definition = NODE_CATALOG_BY_TYPE.get(workflowNode.type);
    const presentation = NODE_PRESENTATION[workflowNode.type];

    return {
      data: {
        category: presentation.category[presentationLocale],
        label: presentation.label[presentationLocale],
        locale,
        nodeType: workflowNode.type,
        requiresApproval: definition?.approvalMode !== 'none',
        risk: definition?.riskLevel ?? 'read',
        stepNumber: index + 1,
      },
      id: workflowNode.id,
      position: {
        x: 40 + index * 238,
        y: 130,
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
  const { locale } = useLanguage();
  const nodes = useMemo(
    () =>
      toFlowNodes(workflow, locale).map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      })),
    [locale, selectedNodeId, workflow],
  );
  const edges = useMemo(() => toFlowEdges(workflow), [workflow]);

  return (
    <div
      aria-label={locale === 'en' ? 'Workflow visualization canvas' : '工作流視覺化畫布'}
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
