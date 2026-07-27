import type {
  AiChatAdapter,
  AiProviderAdapter,
  ProviderChatEvent,
  ProviderChatRequest,
  ProviderCompletion,
  ProviderCompletionRequest,
} from '../types';

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class MockAiAdapter implements AiProviderAdapter, AiChatAdapter {
  readonly model = 'mock-planner-v1';
  readonly provider = 'mock' as const;

  async *streamChat(request: ProviderChatRequest): AsyncIterable<ProviderChatEvent> {
    const latest = request.messages.at(-1)?.content ?? '';
    const text =
      request.chatRequest.locale === 'en'
        ? `I understand your request: “${latest}”\n\nAsk mode can explain and refine the approach, but it cannot run tools. Switch to Plan when you want validated Workflow JSON for review.`
        : `我理解你的需求：「${latest}」\n\n詢問模式可以協助釐清需求與說明做法，但不會執行工具。需要產生可審核的 Workflow JSON 時，請切換到「規劃」。`;
    const chunks = text.match(/.{1,14}/gu) ?? [text];
    for (const chunk of chunks) {
      await Promise.resolve();
      yield { text: chunk, type: 'delta' };
    }
    const inputTokens = estimateTokens(
      request.systemPrompt + request.messages.map((message) => message.content).join(''),
    );
    const outputTokens = estimateTokens(text);
    yield {
      model: 'mock-chat-v1',
      requestId: 'mock-chat',
      type: 'done',
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    };
  }

  async complete(request: ProviderCompletionRequest): Promise<ProviderCompletion> {
    const { executionTarget } = request.plannerRequest.context;
    const folderAliasId = request.plannerRequest.context.allowedFolderAliasIds[0];
    const workflow =
      executionTarget.type === 'desktop' && folderAliasId !== undefined
        ? {
            description: '讀取已授權資料夾中的訂單 Excel，依訂單編號去重，再建立新的彙整報表。',
            edges: [
              { from: 'list_order_files', to: 'read_order_files' },
              { from: 'read_order_files', to: 'deduplicate_orders' },
              { from: 'deduplicate_orders', to: 'create_order_report' },
            ],
            executionTarget,
            name: '每日訂單彙整',
            nodes: [
              {
                config: { folderAliasId, pattern: '*.xlsx' },
                id: 'list_order_files',
                type: 'folder.list_files',
                version: 1,
              },
              {
                config: {
                  headerRow: 1,
                  maxFileSizeBytes: 50_000_000,
                  maxRows: 100_000,
                  maxSheets: 20,
                  sheetMode: 'all',
                },
                id: 'read_order_files',
                type: 'excel.read',
                version: 1,
              },
              {
                config: { keep: 'first', keys: ['訂單編號'] },
                id: 'deduplicate_orders',
                type: 'data.deduplicate',
                version: 1,
              },
              {
                config: {
                  folderAliasId,
                  outputName: '每日訂單彙整.xlsx',
                  overwrite: false,
                  reportTitle: '每日訂單彙整',
                },
                id: 'create_order_report',
                type: 'excel.create_report',
                version: 1,
              },
            ],
            schemaVersion: 1,
            trigger: { config: {}, type: 'manual.trigger' },
          }
        : {
            description: '驗證輸入資料中的必要欄位。',
            edges: [],
            executionTarget,
            name: '資料品質檢查',
            nodes: [
              {
                config: {
                  onInvalid: 'separate',
                  rules: [{ dataType: 'string', field: 'id', required: true }],
                },
                id: 'validate_input',
                type: 'data.validate',
                version: 1,
              },
            ],
            schemaVersion: 1,
            trigger: { config: {}, type: 'manual.trigger' },
          };
    const text = JSON.stringify({
      assumptions: ['使用者已確認 Mock 執行裝置與資料夾別名。'],
      explanation:
        '先列出與讀取受限 Excel，再做確定性的訂單編號去重，最後建立不覆寫既有檔案的新報表。',
      mappingProposals: [],
      workflow,
    });
    const inputTokens = estimateTokens(request.systemPrompt + request.userPrompt);
    const outputTokens = estimateTokens(text);
    return {
      model: this.model,
      requestId: `mock-${request.attempt}`,
      text,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    };
  }
}
