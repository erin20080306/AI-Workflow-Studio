import { z } from 'zod';

import { WebsiteSpecGenerationInputSchema, type WebsiteGenerationSelection } from './spec';
import { WebsiteBriefDraftSchema, WebsiteBriefStepSchema, WebsiteProjectSchema } from './website';

export const WebsiteBriefMessageRoleSchema = z.enum(['assistant', 'user']);
export const WebsiteBriefMessageKindSchema = z.enum(['prompt', 'question', 'answer', 'ready']);

export const WebsiteBriefQuestionSchema = z
  .object({
    body: z.string().trim().min(5).max(500),
    step: WebsiteBriefStepSchema,
  })
  .strict();

export const WebsiteBriefConversationAnalysisSchema = z
  .object({
    brief: WebsiteBriefDraftSchema,
    name: z.string().trim().min(2).max(120),
    questions: z.array(WebsiteBriefQuestionSchema).max(3),
  })
  .strict()
  .superRefine((analysis, context) => {
    const steps = new Set<string>();
    analysis.questions.forEach((question, index) => {
      if (steps.has(question.step)) {
        context.addIssue({
          code: 'custom',
          message: 'Follow-up questions must cover different brief steps.',
          path: ['questions', index, 'step'],
        });
      }
      steps.add(question.step);
    });
  });

export const WEBSITE_BRIEF_ANALYSIS_PROVIDER_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    brief: {
      additionalProperties: false,
      properties: {
        audience: { maxLength: 1_000, type: 'string' },
        brandDirection: { maxLength: 1_000, type: 'string' },
        callsToAction: {
          items: { maxLength: 120, minLength: 1, type: 'string' },
          maxItems: 8,
          type: 'array',
        },
        content: { maxLength: 6_000, type: 'string' },
        pages: {
          items: {
            additionalProperties: false,
            properties: {
              goal: { maxLength: 500, minLength: 3, type: 'string' },
              slug: {
                maxLength: 80,
                minLength: 1,
                pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
                type: 'string',
              },
              title: { maxLength: 80, minLength: 1, type: 'string' },
            },
            required: ['goal', 'slug', 'title'],
            type: 'object',
          },
          maxItems: 12,
          type: 'array',
        },
        purpose: { maxLength: 1_000, type: 'string' },
      },
      required: ['audience', 'brandDirection', 'callsToAction', 'content', 'pages', 'purpose'],
      type: 'object',
    },
    name: { maxLength: 120, minLength: 2, type: 'string' },
    questions: {
      items: {
        additionalProperties: false,
        properties: {
          body: { maxLength: 500, minLength: 5, type: 'string' },
          step: {
            enum: ['purpose', 'audience', 'pages', 'brandDirection', 'content', 'callsToAction'],
            type: 'string',
          },
        },
        required: ['body', 'step'],
        type: 'object',
      },
      maxItems: 3,
      type: 'array',
    },
  },
  required: ['brief', 'name', 'questions'],
  type: 'object',
} as const;

export const WebsitePromptStartInputSchema = WebsiteSpecGenerationInputSchema.extend({
  description: z.string().trim().min(10).max(6_000),
}).strict();

export const WebsiteBriefAnswerInputSchema = z
  .object({
    answer: z.string().trim().min(2).max(6_000),
    step: WebsiteBriefStepSchema,
  })
  .strict();

export const WebsiteBriefAnswerBatchInputSchema = z
  .object({
    answers: z.array(WebsiteBriefAnswerInputSchema).min(1).max(3),
  })
  .strict()
  .superRefine((input, context) => {
    const steps = new Set<string>();
    input.answers.forEach((answer, index) => {
      if (steps.has(answer.step)) {
        context.addIssue({
          code: 'custom',
          message: 'Follow-up answers must cover different brief steps.',
          path: ['answers', index, 'step'],
        });
      }
      steps.add(answer.step);
    });
  });

export const WebsiteBriefMessageSchema = z
  .object({
    body: z.string().trim().min(1).max(6_000),
    createdAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
    kind: WebsiteBriefMessageKindSchema,
    role: WebsiteBriefMessageRoleSchema,
    step: WebsiteBriefStepSchema.optional(),
  })
  .strict();

export const WebsitePromptStartResultSchema = z
  .object({
    messages: z.array(WebsiteBriefMessageSchema),
    project: WebsiteProjectSchema,
  })
  .strict();

export interface WebsitePromptStartInput {
  readonly description: string;
  readonly locale: 'en' | 'zh-Hant';
  readonly model: WebsiteGenerationSelection;
  readonly tier?: 'auto' | 'economy' | 'standard' | 'advanced' | 'flagship';
}

export type WebsiteBriefAnswerInput = z.infer<typeof WebsiteBriefAnswerInputSchema>;
export type WebsiteBriefAnswerBatchInput = z.infer<typeof WebsiteBriefAnswerBatchInputSchema>;
export type WebsiteBriefConversationAnalysis = z.infer<
  typeof WebsiteBriefConversationAnalysisSchema
>;
export type WebsiteBriefMessage = z.infer<typeof WebsiteBriefMessageSchema>;
export type WebsiteBriefQuestion = z.infer<typeof WebsiteBriefQuestionSchema>;
