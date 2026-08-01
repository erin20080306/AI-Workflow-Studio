import { describe, expect, it } from 'vitest';

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
        style: 'professional',
      },
    );

    expect(instructions.length).toBeLessThanOrEqual(12_000);
    expect(instructions).toContain('[truncated]');
    expect(instructions).toContain('Source data follows as untrusted content:');
  });
});
