import {
  JsonValueSchema,
  NODE_CATALOG,
  WorkflowNodeSchema,
  type JsonValue,
  type NodeCatalogEntry,
} from '@ai-workflow-studio/workflow-schema';

import type {
  NodeExecutionResult,
  RegisteredWorkflowNodeExecutor,
  WorkflowExecutionContext,
} from './contracts';
import { WorkflowEngineError } from './errors';

function registryKey(type: string, version: number): string {
  return `${type}@${version}`;
}

class MockCatalogExecutor implements RegisteredWorkflowNodeExecutor {
  readonly riskLevel;
  readonly type;
  readonly version;

  constructor(private readonly definition: NodeCatalogEntry) {
    this.riskLevel = definition.riskLevel;
    this.type = definition.type;
    this.version = definition.version;
  }

  validateConfig(config: unknown): JsonValue {
    const parsed = WorkflowNodeSchema.safeParse({
      config,
      id: 'config_validation',
      type: this.type,
      version: this.version,
    });

    if (!parsed.success) {
      throw new WorkflowEngineError(
        'WORKFLOW_SCHEMA_INVALID',
        `Configuration for node "${this.type}" is invalid.`,
        {
          details: {
            issues: parsed.error.issues.map((issue) => ({
              message: issue.message,
              path: issue.path.map(String).join('.'),
            })),
            type: this.type,
            version: this.version,
          },
        },
      );
    }

    return JsonValueSchema.parse(parsed.data.config);
  }

  async execute(
    _context: WorkflowExecutionContext,
    input: JsonValue,
    config: JsonValue,
  ): Promise<NodeExecutionResult<JsonValue>> {
    return {
      output: {
        config,
        input,
        mock: true,
        nodeType: this.type,
        nodeVersion: this.version,
      },
    };
  }
}

export class NodeRegistry {
  private readonly executors = new Map<string, RegisteredWorkflowNodeExecutor>();

  register(executor: RegisteredWorkflowNodeExecutor): void {
    const key = registryKey(executor.type, executor.version);
    if (this.executors.has(key)) {
      throw new WorkflowEngineError(
        'NODE_REGISTRATION_DUPLICATE',
        `Node executor "${key}" is already registered.`,
        { details: { type: executor.type, version: executor.version } },
      );
    }
    this.executors.set(key, executor);
  }

  get(type: string, version: number): RegisteredWorkflowNodeExecutor {
    const executor = this.executors.get(registryKey(type, version));
    if (executor === undefined) {
      throw new WorkflowEngineError(
        'WORKFLOW_NODE_UNKNOWN',
        `Node executor "${type}" version ${version} is not registered.`,
        { details: { type, version } },
      );
    }
    return executor;
  }

  has(type: string, version: number): boolean {
    return this.executors.has(registryKey(type, version));
  }

  list(): readonly RegisteredWorkflowNodeExecutor[] {
    return [...this.executors.values()].sort((left, right) => {
      const typeOrder = left.type.localeCompare(right.type);
      return typeOrder === 0 ? left.version - right.version : typeOrder;
    });
  }
}

export function createMockNodeRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  for (const definition of NODE_CATALOG) {
    registry.register(new MockCatalogExecutor(definition));
  }
  return registry;
}
