import type {
  AgentJob,
  StepResult,
  Workflow,
  WorkflowRiskSummary,
} from '@ai-workflow-studio/workflow-schema';

export type RunStatus =
  'awaiting_approval' | 'cancelled' | 'failed' | 'queued' | 'running' | 'succeeded' | 'timed_out';

export type RunRole = 'admin' | 'editor' | 'owner' | 'viewer';

export interface RunActor {
  readonly role: RunRole;
  readonly tenantId: string;
  readonly userId: string;
}

export interface RunApproval {
  readonly expiresAt: string;
  readonly id: string;
  readonly requestedAt: string;
  readonly requestedBy: string;
  readonly resolvedAt?: string;
  readonly resolvedBy?: string;
  readonly riskSummary: WorkflowRiskSummary;
  readonly status: 'approved' | 'expired' | 'pending' | 'rejected';
}

export interface RunAuditEntry {
  readonly action: string;
  readonly actorType: 'device' | 'system' | 'user';
  readonly actorId?: string;
  readonly createdAt: string;
  readonly id: string;
  readonly metadata: Readonly<Record<string, boolean | number | string>>;
}

export interface RunNotification {
  readonly createdAt: string;
  readonly id: string;
  readonly kind: 'approval' | 'error' | 'info' | 'success';
  readonly message: string;
  readonly read: boolean;
  readonly title: string;
}

export type RunStepResult =
  | {
      readonly kind: 'ai_summary';
      readonly model: string;
      readonly provider: 'anthropic' | 'gemini' | 'mock' | 'openai';
      readonly text: string;
    }
  | {
      readonly content: string;
      readonly format: 'html' | 'markdown';
      readonly includeReferences: boolean;
      readonly kind: 'business_report';
      readonly title: string;
    }
  | {
      readonly kind: 'google_slides_presentation';
      readonly presentationId: string;
      readonly slideCount: number;
      readonly url: string;
    }
  | {
      readonly deploymentId: string;
      readonly kind: 'apps_script_deployment';
      readonly requiredScopes?: readonly string[];
      readonly scriptId: string;
      readonly versionNumber?: number;
    };

export interface RunStepView extends StepResult {
  readonly attempt: number;
  readonly currentAction?:
    | 'drive.download_items'
    | 'drive.open_folder'
    | 'drive.select_items'
    | 'drive.verify_download'
    | 'excel.autofit_used_range'
    | 'excel.open_workbook'
    | 'excel.save_workbook'
    | 'excel.verify_active_workbook';
  readonly nodeType: string;
  readonly result?: RunStepResult;
}

export interface WorkflowRunView {
  readonly approval?: RunApproval;
  readonly attempts: number;
  readonly audit: readonly RunAuditEntry[];
  readonly completedAt?: string;
  readonly createdAt: string;
  readonly deviceId?: string;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
  readonly id: string;
  readonly idempotencyKey: string;
  readonly jobId?: string;
  readonly maxAttempts: number;
  readonly notifications: readonly RunNotification[];
  readonly startedAt?: string;
  readonly status: RunStatus;
  readonly steps: readonly RunStepView[];
  readonly tenantId: string;
  readonly timeoutAt: string;
  readonly workflowId: string;
  readonly workflowName: string;
  readonly workflowVersionId: string;
}

export interface StartRunInput {
  readonly deviceId: string;
  readonly idempotencyKey: string;
  readonly maxAttempts?: number;
  readonly timeoutSeconds?: number;
  readonly workflow: Workflow;
  readonly workflowId: string;
  readonly workflowVersionId: string;
}

export interface RunJobDispatcher {
  cancel(tenantId: string, jobId: string, now: Date): Promise<boolean>;
  enqueue(job: AgentJob): Promise<void>;
}

export interface RunStartResult {
  readonly duplicate: boolean;
  readonly run: WorkflowRunView;
}

export interface AgentProgressInput {
  readonly deviceId: string;
  readonly eventId: string;
  readonly jobId: string;
  readonly step: StepResult;
  readonly tenantId: string;
}

export interface AgentCompletionInput {
  readonly deviceId: string;
  readonly eventId: string;
  readonly jobId: string;
  readonly tenantId: string;
}

export interface AgentFailureInput extends AgentCompletionInput {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
}
