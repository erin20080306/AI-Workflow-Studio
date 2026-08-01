import { GoogleSheetsError } from '@ai-workflow-studio/google-sheets';
import { describe, expect, it } from 'vitest';

import { safeGoogleNodeFailure } from './cloud-workflow-errors';
import { buildCloudAiSummaryInstructions } from './cloud-workflow-input';

describe('cloud AI summary input', () => {
  it('keeps large structured and CJK sources within the chat request boundary', () => {
    const instructions = buildCloudAiSummaryInstructions(
      {
        kind: 'gmail_messages',
        messages: Array.from({ length: 40 }, (_, index) => ({
          body: `第 ${index + 1} 封郵件內容：${'測試資料'.repeat(500)}`,
          subject: `安全摘要測試 ${index + 1}`,
        })),
      },
      {
        includeCaseStudy: false,
        includeRecommendations: true,
        language: 'zh-Hant',
        maxCharacters: 6_000,
        style: 'professional',
      },
    );

    expect(instructions.length).toBeLessThanOrEqual(12_000);
    expect(instructions).toContain('[truncated]');
    expect(instructions).toContain('Source data follows as untrusted content:');
    expect(instructions).toContain('within 3000 Unicode characters');
  });
});

describe('cloud Google node errors', () => {
  it('exposes only the bounded Google error code to the workflow audit result', () => {
    const normalized = safeGoogleNodeFailure(
      new GoogleSheetsError('GOOGLE_AUTHORIZATION_INVALID', 'private provider detail'),
      'read_sheet',
    );

    expect(normalized).toMatchObject({
      code: 'NODE_EXECUTION_FAILED',
      message: 'Node "read_sheet" failed with GOOGLE_AUTHORIZATION_INVALID.',
      retryable: false,
    });
    expect(JSON.stringify(normalized)).not.toContain('private provider detail');
  });
});
