import { z } from 'zod';

import { WebsiteSiteRoleSchema } from './access';

const IdentifierSchema = z
  .string()
  .trim()
  .min(2)
  .max(48)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);

const FieldKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(48)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);

const PageSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const WebsiteDataFieldTypeSchema = z.enum([
  'text',
  'long-text',
  'number',
  'boolean',
  'date',
  'email',
  'select',
  'reference',
]);

export const WebsiteDataFieldSchema = z
  .object({
    key: FieldKeySchema,
    label: z.string().trim().min(1).max(80),
    options: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    referenceCollectionKey: IdentifierSchema.nullable().default(null),
    required: z.boolean().default(false),
    type: WebsiteDataFieldTypeSchema,
  })
  .strict()
  .superRefine((field, context) => {
    if (field.type === 'select') {
      if (field.options.length < 2 || new Set(field.options).size !== field.options.length) {
        context.addIssue({
          code: 'custom',
          message: 'Select fields require at least two unique options.',
          path: ['options'],
        });
      }
    } else if (field.options.length > 0) {
      context.addIssue({
        code: 'custom',
        message: 'Only select fields may define options.',
        path: ['options'],
      });
    }
    if (field.type === 'reference' && field.referenceCollectionKey === null) {
      context.addIssue({
        code: 'custom',
        message: 'Reference fields require a target collection.',
        path: ['referenceCollectionKey'],
      });
    } else if (field.type !== 'reference' && field.referenceCollectionKey !== null) {
      context.addIssue({
        code: 'custom',
        message: 'Only reference fields may target a collection.',
        path: ['referenceCollectionKey'],
      });
    }
  });

const FieldListSchema = z
  .array(WebsiteDataFieldSchema)
  .min(1)
  .max(24)
  .superRefine((fields, context) => {
    const keys = fields.map((field) => field.key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: 'custom',
        message: 'Collection field keys must be unique.',
      });
    }
  });

export const WebsiteDataCollectionSchema = z
  .object({
    collectionKey: IdentifierSchema,
    createdAt: z.string().datetime({ offset: true }),
    fields: FieldListSchema,
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    projectId: z.string().uuid(),
    reviewedAt: z.string().datetime({ offset: true }),
    tenantId: z.string().uuid(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const WebsiteDataWorkflowTriggerSchema = z.enum(['none', 'audit-record-created']);

export const WebsiteDataFormSchema = z
  .object({
    active: z.boolean(),
    collectionKey: IdentifierSchema,
    createdAt: z.string().datetime({ offset: true }),
    fieldKeys: z.array(FieldKeySchema).min(1).max(24),
    formKey: IdentifierSchema,
    id: z.string().uuid(),
    pageSlug: PageSlugSchema,
    projectId: z.string().uuid(),
    requiredRole: WebsiteSiteRoleSchema.nullable(),
    submitLabel: z.string().trim().min(1).max(60),
    successMessage: z.string().trim().min(1).max(240),
    tenantId: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    updatedAt: z.string().datetime({ offset: true }),
    workflowTrigger: WebsiteDataWorkflowTriggerSchema,
  })
  .strict()
  .superRefine((form, context) => {
    if (new Set(form.fieldKeys).size !== form.fieldKeys.length) {
      context.addIssue({
        code: 'custom',
        message: 'Form fields must be unique.',
        path: ['fieldKeys'],
      });
    }
  });

export const WebsiteDataValueSchema = z.union([
  z.string().max(8_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const WebsiteDataValuesSchema = z
  .record(FieldKeySchema, WebsiteDataValueSchema)
  .refine((values) => Object.keys(values).length <= 24, 'A record may contain at most 24 fields.');

export const WebsiteDataRecordSchema = z
  .object({
    collectionKey: IdentifierSchema,
    createdAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
    ownerSiteUserId: z.string().uuid().nullable(),
    projectId: z.string().uuid(),
    tenantId: z.string().uuid(),
    updatedAt: z.string().datetime({ offset: true }),
    values: WebsiteDataValuesSchema,
    version: z.number().int().positive(),
  })
  .strict();

export const WebsiteDataActionTypeSchema = z.enum([
  'create-record',
  'update-record',
  'delete-record',
]);

export const WebsiteDataActionRunSchema = z
  .object({
    action: WebsiteDataActionTypeSchema,
    createdAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
    idempotencyKey: z.string().uuid(),
    recordId: z.string().uuid().nullable(),
    status: z.literal('succeeded'),
    trigger: WebsiteDataWorkflowTriggerSchema,
  })
  .strict();

export const WebsiteDataDashboardSchema = z
  .object({
    actions: z.array(WebsiteDataActionRunSchema).max(100),
    collections: z.array(WebsiteDataCollectionSchema).max(12),
    forms: z.array(WebsiteDataFormSchema).max(12),
    records: z.array(WebsiteDataRecordSchema).max(200),
  })
  .strict();

export const WebsiteDataMutationSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('upsert-collection'),
      collectionKey: IdentifierSchema,
      confirmed: z.literal(true),
      fields: FieldListSchema,
      name: z.string().trim().min(1).max(80),
    })
    .strict(),
  z
    .object({
      action: z.literal('upsert-form'),
      active: z.boolean(),
      collectionKey: IdentifierSchema,
      confirmed: z.literal(true),
      fieldKeys: z.array(FieldKeySchema).min(1).max(24),
      formKey: IdentifierSchema,
      pageSlug: PageSlugSchema,
      requiredRole: WebsiteSiteRoleSchema.nullable(),
      submitLabel: z.string().trim().min(1).max(60),
      successMessage: z.string().trim().min(1).max(240),
      title: z.string().trim().min(1).max(120),
      workflowTrigger: WebsiteDataWorkflowTriggerSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('create-record'),
      collectionKey: IdentifierSchema,
      idempotencyKey: z.string().uuid(),
      values: WebsiteDataValuesSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('update-record'),
      collectionKey: IdentifierSchema,
      expectedVersion: z.number().int().positive(),
      idempotencyKey: z.string().uuid(),
      recordId: z.string().uuid(),
      values: WebsiteDataValuesSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('delete-record'),
      collectionKey: IdentifierSchema,
      confirmed: z.literal(true),
      expectedVersion: z.number().int().positive(),
      idempotencyKey: z.string().uuid(),
      recordId: z.string().uuid(),
    })
    .strict(),
]);

export const WebsitePublicDataSubmissionSchema = z
  .object({
    formKey: IdentifierSchema,
    idempotencyKey: z.string().uuid(),
    pageSlug: PageSlugSchema,
    values: WebsiteDataValuesSchema,
    website: z.literal('').optional(),
  })
  .strict();

export type WebsiteDataActionRun = z.infer<typeof WebsiteDataActionRunSchema>;
export type WebsiteDataCollection = z.infer<typeof WebsiteDataCollectionSchema>;
export type WebsiteDataDashboard = z.infer<typeof WebsiteDataDashboardSchema>;
export type WebsiteDataField = z.infer<typeof WebsiteDataFieldSchema>;
export type WebsiteDataFieldType = z.infer<typeof WebsiteDataFieldTypeSchema>;
export type WebsiteDataForm = z.infer<typeof WebsiteDataFormSchema>;
export type WebsiteDataMutation = z.infer<typeof WebsiteDataMutationSchema>;
export type WebsiteDataRecord = z.infer<typeof WebsiteDataRecordSchema>;
export type WebsiteDataValues = z.infer<typeof WebsiteDataValuesSchema>;
export type WebsiteDataWorkflowTrigger = z.infer<typeof WebsiteDataWorkflowTriggerSchema>;
export type WebsitePublicDataSubmission = z.infer<typeof WebsitePublicDataSubmissionSchema>;
