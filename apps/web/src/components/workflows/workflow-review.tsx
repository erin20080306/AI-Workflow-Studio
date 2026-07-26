'use client';

import { createMockNodeRegistry, WorkflowEngine } from '@ai-workflow-studio/workflow-engine';
import {
  NODE_CATALOG_BY_TYPE,
  summarizeWorkflowRisks,
  validateWorkflow,
  type Workflow,
} from '@ai-workflow-studio/workflow-schema';
import { useMemo, useState } from 'react';

import { AlertIcon, CheckIcon, PlayIcon, SaveIcon, ShieldIcon } from '@/components/icons';
import { NODE_PRESENTATION } from '@/lib/mock-workflows';

import { WorkflowFlowCanvas } from './workflow-flow-canvas';

type DryRunState =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly message: string; readonly plannedSteps: number; readonly status: 'succeeded' }
  | { readonly message: string; readonly status: 'failed' };

const approvalLabels = {
  always: '每次執行需核准',
  first_run: '首次執行需核准',
  none: '不需額外核准',
} as const;

const riskLabels = {
  destructive: '破壞性',
  external: '外部服務',
  read: '讀取',
  write: '寫入',
} as const;

function formatConfigValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item),
      )
      .join('、');
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }
  return String(value);
}

export function WorkflowReview({
  onSaveDraft,
  workflow,
}: Readonly<{
  onSaveDraft?: () => void;
  workflow: Workflow;
}>) {
  const [selectedNodeId, setSelectedNodeId] = useState(workflow.nodes[0]?.id ?? '');
  const [dryRun, setDryRun] = useState<DryRunState>({ status: 'idle' });
  const inspection = useMemo(
    () => ({
      risk: summarizeWorkflowRisks(workflow),
      validation: validateWorkflow(workflow),
    }),
    [workflow],
  );
  const selectedNode =
    workflow.nodes.find((workflowNode) => workflowNode.id === selectedNodeId) ?? workflow.nodes[0];
  const definition =
    selectedNode === undefined ? undefined : NODE_CATALOG_BY_TYPE.get(selectedNode.type);
  const presentation =
    selectedNode === undefined ? undefined : NODE_PRESENTATION[selectedNode.type];

  async function executeDryRun() {
    setDryRun({ status: 'running' });
    try {
      const engine = new WorkflowEngine(createMockNodeRegistry());
      const uniquePart = crypto.randomUUID();
      const result = await engine.execute(workflow, {
        idempotencyKey: `dry-run-${uniquePart}`,
        mode: 'dry-run',
        runId: uniquePart,
      });
      setDryRun({
        message: '所有節點都通過 schema、權限與執行順序檢查，沒有執行任何寫入。',
        plannedSteps: result.steps.length,
        status: 'succeeded',
      });
    } catch {
      setDryRun({
        message: 'Dry Run 無法完成。請先修正驗證問題再重試。',
        status: 'failed',
      });
    }
  }

  return (
    <div>
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-xl ${
              inspection.validation.success
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-rose-100 text-rose-700'
            }`}
          >
            {inspection.validation.success ? (
              <CheckIcon className="size-5" />
            ) : (
              <AlertIcon className="size-5" />
            )}
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-950">
              {inspection.validation.success ? '安全檢查通過' : '需要修正驗證問題'}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Schema v{workflow.schemaVersion} · {workflow.nodes.length} 個節點 ·{' '}
              {workflow.edges.length} 條連線
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 disabled:cursor-wait disabled:opacity-60"
            disabled={dryRun.status === 'running' || !inspection.validation.success}
            onClick={executeDryRun}
            type="button"
          >
            <PlayIcon className="size-4" />
            {dryRun.status === 'running' ? '規劃中…' : '執行 Dry Run'}
          </button>
          {onSaveDraft !== undefined && (
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              onClick={onSaveDraft}
              type="button"
            >
              <SaveIcon className="size-4" />
              儲存草稿
            </button>
          )}
        </div>
      </section>

      {dryRun.status === 'succeeded' && (
        <section
          aria-live="polite"
          className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
              <CheckIcon className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-emerald-950">Dry Run 完成</p>
              <p className="mt-1 text-xs font-semibold text-emerald-800">
                {dryRun.plannedSteps} / {workflow.nodes.length} 個步驟已規劃
              </p>
              <p className="mt-1 text-xs leading-5 text-emerald-800">{dryRun.message}</p>
            </div>
          </div>
        </section>
      )}

      {dryRun.status === 'failed' && (
        <p
          aria-live="assertive"
          className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          {dryRun.message}
        </p>
      )}

      <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <WorkflowFlowCanvas
          onSelectNode={setSelectedNodeId}
          selectedNodeId={selectedNodeId}
          workflow={workflow}
        />

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600">
            Node inspector
          </p>
          {selectedNode !== undefined && definition !== undefined && presentation !== undefined ? (
            <>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">
                {presentation.label}
              </h2>
              <p className="mt-1 text-xs text-slate-500">{selectedNode.type} · v1</p>

              <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-slate-400">風險</dt>
                  <dd className="mt-1 font-semibold text-slate-900">
                    {riskLabels[definition.riskLevel]}
                  </dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-slate-400">執行位置</dt>
                  <dd className="mt-1 font-semibold capitalize text-slate-900">
                    {definition.executionLocation}
                  </dd>
                </div>
              </dl>

              <div
                className={`mt-3 rounded-xl px-3 py-2.5 text-xs font-semibold ${
                  definition.approvalMode === 'none'
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-amber-50 text-amber-900'
                }`}
              >
                {approvalLabels[definition.approvalMode]}
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4">
                <h3 className="text-xs font-semibold text-slate-900">安全設定</h3>
                <dl className="mt-3 space-y-3">
                  {Object.entries(selectedNode.config).map(([key, value]) => (
                    <div className="grid grid-cols-[100px_1fr] gap-3 text-xs" key={key}>
                      <dt className="break-words text-slate-400">{key}</dt>
                      <dd className="break-words text-right font-medium text-slate-700">
                        {formatConfigValue(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-500">選取節點以檢查設定。</p>
          )}
        </aside>
      </div>

      <section className="mt-5 grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-indigo-700">
            <ShieldIcon className="size-4" />
            <h2 className="text-sm font-semibold">權限摘要</h2>
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-950">Erin’s MacBook Air</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            僅能讀寫「訂單匯入資料夾」別名；流程不會收到實際絕對路徑。
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-950">預計讀寫資料</h2>
          <div className="mt-4 space-y-2 text-xs text-slate-600">
            <p>讀取 · 最多 50 MB / 100,000 列 / 20 個工作表</p>
            <p>寫入 · 新檔「每日訂單彙整.xlsx」</p>
            <p>覆寫既有檔案 · 否</p>
          </div>
        </article>

        <article
          className={`rounded-2xl border p-5 shadow-sm ${
            inspection.risk.requiresApproval
              ? 'border-amber-200 bg-amber-50'
              : 'border-emerald-200 bg-emerald-50'
          }`}
        >
          <h2 className="text-sm font-semibold text-slate-950">風險與核准</h2>
          <p className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
            {inspection.risk.write.length} 個寫入節點
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            AI 只能建立草稿。首次 Live Run 前必須由使用者核准報表寫入。
          </p>
        </article>
      </section>

      {!inspection.validation.success && (
        <section className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <h2 className="text-sm font-semibold text-rose-950">Validation errors</h2>
          <ul className="mt-3 space-y-2 text-xs text-rose-800">
            {inspection.validation.issues.map((issue) => (
              <li key={`${issue.code}-${issue.path ?? issue.nodeId ?? issue.message}`}>
                {issue.code}: {issue.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
