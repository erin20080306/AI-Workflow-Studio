import { GoogleSheetsError } from '@ai-workflow-studio/google-sheets';
import { describe, expect, it } from 'vitest';

import { safeGoogleNodeFailure } from './cloud-workflow-errors';
import { buildCloudAiSummaryInstructions } from './cloud-workflow-input';
import { appsScriptParentId, buildProfessionalSlides } from './cloud-workflow-output';

describe('cloud Slides and approved GAS planning', () => {
  it('creates exactly the requested slide count and keeps references bounded', () => {
    const slides = buildProfessionalSlides(
      '摘要重點一包含足夠文字\n摘要重點二包含足夠文字\nhttps://example.com/chart.png',
      {
        includeImages: true,
        includeReferences: true,
        maxSlides: 5,
        title: '成本摘要',
      },
      '2026-08-01',
    );

    expect(slides).toHaveLength(5);
    expect(slides[0]?.title).toBe('成本摘要');
    expect(slides[1]).toMatchObject({ imageUrl: 'https://example.com/chart.png' });
    expect(slides.every((slide) => slide.body.length >= 1 && slide.body.length <= 8)).toBe(true);
  });

  it('binds the allowlisted Slides GAS template only to a validated presentation output', () => {
    expect(
      appsScriptParentId({
        kind: 'google_slides_presentation',
        presentationId: '1PresentationResourceId123456789',
      }),
    ).toBe('1PresentationResourceId123456789');
    expect(appsScriptParentId({ kind: 'inline_text', text: 'not a presentation' })).toBeUndefined();
  });
});

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
