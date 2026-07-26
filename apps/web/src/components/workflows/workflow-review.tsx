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
import { useLanguage } from '@/components/language-provider';
import { NODE_PRESENTATION } from '@/lib/mock-workflows';

import { WorkflowFlowCanvas } from './workflow-flow-canvas';

type DryRunState =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly plannedSteps: number; readonly status: 'succeeded' }
  | { readonly status: 'failed' };

const approvalLabels = {
  en: {
    always: 'Approval required for every run',
    first_run: 'Approval required for the first run',
    none: 'No extra approval required',
  },
  'zh-Hant': {
    always: '每次執行需核准',
    first_run: '首次執行需核准',
    none: '不需額外核准',
  },
} as const;

const riskLabels = {
  en: { destructive: 'Destructive', external: 'External', read: 'Read', write: 'Write' },
  'zh-Hant': { destructive: '破壞性', external: '外部服務', read: '讀取', write: '寫入' },
} as const;

const copy = {
  en: {
    dryRun: 'Run dry run',
    dryRunComplete: 'Dry run complete',
    dryRunFailed: 'Dry run could not complete. Fix the validation issues and try again.',
    dryRunSuccess:
      'Every node passed schema, permission, and execution-order checks. No write was performed.',
    execution: 'Execution',
    inspector: 'Node inspector',
    nodeSummary: (nodes: number, edges: number) => `${nodes} nodes · ${edges} connections`,
    overwrite: 'Overwrite existing file · No',
    permissions: 'Permission summary',
    permissionsHelp:
      'Can access only the “Order import folder” alias. The workflow never receives an absolute path.',
    planned: (planned: number, total: number) => `${planned} / ${total} steps planned`,
    planning: 'Planning…',
    read: 'Read · Up to 50 MB / 100,000 rows / 20 sheets',
    readWrite: 'Expected data access',
    risk: 'Risk',
    riskApproval: 'Risk and approval',
    riskHelp:
      'AI can create drafts only. A user must approve report writes before the first live run.',
    safetyPassed: 'Safety check passed',
    safetySettings: 'Safety settings',
    saveDraft: 'Save draft',
    selectNode: 'Select a node to inspect its settings.',
    validationErrors: 'Validation errors',
    validationRequired: 'Validation issues need attention',
    write: 'Write · New file “Daily order summary.xlsx”',
    writeNodes: (count: number) => `${count} write nodes`,
  },
  'zh-Hant': {
    dryRun: '執行 Dry Run',
    dryRunComplete: 'Dry Run 完成',
    dryRunFailed: 'Dry Run 無法完成。請先修正驗證問題再重試。',
    dryRunSuccess: '所有節點都通過 schema、權限與執行順序檢查，沒有執行任何寫入。',
    execution: '執行位置',
    inspector: '節點檢視器',
    nodeSummary: (nodes: number, edges: number) => `${nodes} 個節點 · ${edges} 條連線`,
    overwrite: '覆寫既有檔案 · 否',
    permissions: '權限摘要',
    permissionsHelp: '僅能讀寫「訂單匯入資料夾」別名；流程不會收到實際絕對路徑。',
    planned: (planned: number, total: number) => `${planned} / ${total} 個步驟已規劃`,
    planning: '規劃中…',
    read: '讀取 · 最多 50 MB / 100,000 列 / 20 個工作表',
    readWrite: '預計讀寫資料',
    risk: '風險',
    riskApproval: '風險與核准',
    riskHelp: 'AI 只能建立草稿。首次正式執行前必須由使用者核准報表寫入。',
    safetyPassed: '安全檢查通過',
    safetySettings: '安全設定',
    saveDraft: '儲存草稿',
    selectNode: '選取節點以檢查設定。',
    validationErrors: '驗證錯誤',
    validationRequired: '需要修正驗證問題',
    write: '寫入 · 新檔「每日訂單彙整.xlsx」',
    writeNodes: (count: number) => `${count} 個寫入節點`,
  },
} as const;

function formatConfigValue(value: unknown, locale: 'en' | 'zh-Hant'): string {
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item),
      )
      .join(locale === 'en' ? ', ' : '、');
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') {
    return value ? (locale === 'en' ? 'Yes' : '是') : locale === 'en' ? 'No' : '否';
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
  const { locale } = useLanguage();
  const text = copy[locale];
  const presentationLocale = locale === 'en' ? 'en' : 'zhHant';
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
        plannedSteps: result.steps.length,
        status: 'succeeded',
      });
    } catch {
      setDryRun({ status: 'failed' });
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
              {inspection.validation.success ? text.safetyPassed : text.validationRequired}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Schema v{workflow.schemaVersion} ·{' '}
              {text.nodeSummary(workflow.nodes.length, workflow.edges.length)}
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
            {dryRun.status === 'running' ? text.planning : text.dryRun}
          </button>
          {onSaveDraft !== undefined && (
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              onClick={onSaveDraft}
              type="button"
            >
              <SaveIcon className="size-4" />
              {text.saveDraft}
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
              <p className="text-sm font-semibold text-emerald-950">{text.dryRunComplete}</p>
              <p className="mt-1 text-xs font-semibold text-emerald-800">
                {text.planned(dryRun.plannedSteps, workflow.nodes.length)}
              </p>
              <p className="mt-1 text-xs leading-5 text-emerald-800">{text.dryRunSuccess}</p>
            </div>
          </div>
        </section>
      )}

      {dryRun.status === 'failed' && (
        <p
          aria-live="assertive"
          className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          {text.dryRunFailed}
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
            {text.inspector}
          </p>
          {selectedNode !== undefined && definition !== undefined && presentation !== undefined ? (
            <>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">
                {presentation.label[presentationLocale]}
              </h2>
              <p className="mt-1 text-xs text-slate-500">{selectedNode.type} · v1</p>

              <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-slate-400">{text.risk}</dt>
                  <dd className="mt-1 font-semibold text-slate-900">
                    {riskLabels[locale][definition.riskLevel]}
                  </dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-slate-400">{text.execution}</dt>
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
                {approvalLabels[locale][definition.approvalMode]}
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4">
                <h3 className="text-xs font-semibold text-slate-900">{text.safetySettings}</h3>
                <dl className="mt-3 space-y-3">
                  {Object.entries(selectedNode.config).map(([key, value]) => (
                    <div className="grid grid-cols-[100px_1fr] gap-3 text-xs" key={key}>
                      <dt className="break-words text-slate-400">{key}</dt>
                      <dd className="break-words text-right font-medium text-slate-700">
                        {formatConfigValue(value, locale)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-500">{text.selectNode}</p>
          )}
        </aside>
      </div>

      <section className="mt-5 grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-indigo-700">
            <ShieldIcon className="size-4" />
            <h2 className="text-sm font-semibold">{text.permissions}</h2>
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-950">Erin’s MacBook Air</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{text.permissionsHelp}</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-950">{text.readWrite}</h2>
          <div className="mt-4 space-y-2 text-xs text-slate-600">
            <p>{text.read}</p>
            <p>{text.write}</p>
            <p>{text.overwrite}</p>
          </div>
        </article>

        <article
          className={`rounded-2xl border p-5 shadow-sm ${
            inspection.risk.requiresApproval
              ? 'border-amber-200 bg-amber-50'
              : 'border-emerald-200 bg-emerald-50'
          }`}
        >
          <h2 className="text-sm font-semibold text-slate-950">{text.riskApproval}</h2>
          <p className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
            {text.writeNodes(inspection.risk.write.length)}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{text.riskHelp}</p>
        </article>
      </section>

      {!inspection.validation.success && (
        <section className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <h2 className="text-sm font-semibold text-rose-950">{text.validationErrors}</h2>
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
