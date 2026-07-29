import 'server-only';

import {
  WebsiteDataActionRunSchema,
  WebsiteDataCollectionSchema,
  WebsiteDataDashboardSchema,
  WebsiteDataFieldSchema,
  WebsiteDataFormSchema,
  WebsiteDataMutationSchema,
  WebsiteDataRecordSchema,
  WebsitePublicDataSubmissionSchema,
  type WebsiteDataActionRun,
  type WebsiteDataCollection,
  type WebsiteDataDashboard,
  type WebsiteDataField,
  type WebsiteDataForm,
  type WebsiteDataMutation,
  type WebsiteDataRecord,
  type WebsiteDataValues,
  type WebsitePublicDataSubmission,
  type WebsiteSiteRole,
} from '@ai-workflow-studio/website-schema';
import { createHash } from 'node:crypto';
import { z } from 'zod';

import type { WorkspaceContext } from './auth/context';
import { getEnvironment } from './env';
import { createSupabaseAdminClient } from './supabase/server';
import { getWebsiteSiteAuthState } from './website-access-server';
import type { PublishedWebsite } from './website-publication-server';
import { getWebsiteSpecGeneration } from './website-spec-server';
import { getWebsiteProject, WebsiteStudioError } from './website-studio-server';

const CollectionRowSchema = z
  .object({
    collection_key: z.string().min(2).max(48),
    created_at: z.string().datetime({ offset: true }),
    fields: z.array(WebsiteDataFieldSchema).min(1).max(24),
    id: z.string().uuid(),
    name: z.string().min(1).max(80),
    project_id: z.string().uuid(),
    reviewed_at: z.string().datetime({ offset: true }),
    tenant_id: z.string().uuid(),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();

const FormRowSchema = z
  .object({
    active: z.boolean(),
    collection_key: z.string().min(2).max(48),
    created_at: z.string().datetime({ offset: true }),
    field_keys: z.array(z.string().min(1).max(48)).min(1).max(24),
    form_key: z.string().min(2).max(48),
    id: z.string().uuid(),
    page_slug: z.string().min(1).max(80),
    project_id: z.string().uuid(),
    required_role: z.enum(['member', 'staff', 'manager']).nullable(),
    submit_label: z.string().min(1).max(60),
    success_message: z.string().min(1).max(240),
    tenant_id: z.string().uuid(),
    title: z.string().min(1).max(120),
    updated_at: z.string().datetime({ offset: true }),
    workflow_trigger: z.enum(['none', 'audit-record-created']),
  })
  .strict();

const RecordRowSchema = z
  .object({
    collection_key: z.string().min(2).max(48),
    created_at: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
    owner_site_user_id: z.string().uuid().nullable(),
    project_id: z.string().uuid(),
    tenant_id: z.string().uuid(),
    updated_at: z.string().datetime({ offset: true }),
    values: z.record(z.string(), z.unknown()),
    version: z.number().int().positive(),
  })
  .strict();

const ActionRowSchema = z
  .object({
    action: z.enum(['create-record', 'update-record', 'delete-record']),
    created_at: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
    idempotency_key: z.string().uuid(),
    record_id: z.string().uuid().nullable(),
    status: z.literal('succeeded'),
    workflow_trigger: z.enum(['none', 'audit-record-created']),
  })
  .strict();

interface PublicWebsiteDataForm {
  readonly collection: WebsiteDataCollection;
  readonly form: WebsiteDataForm;
}

interface MemoryWebsiteData {
  readonly actions: WebsiteDataActionRun[];
  readonly collections: Map<string, WebsiteDataCollection>;
  readonly forms: Map<string, WebsiteDataForm>;
  readonly idempotency: Map<string, { readonly hash: string; readonly record: WebsiteDataRecord }>;
  readonly records: Map<string, WebsiteDataRecord>;
}

const dataGlobal = globalThis as typeof globalThis & {
  __aiWorkflowWebsiteData?: Map<string, MemoryWebsiteData>;
};

function memoryData(projectId: string): MemoryWebsiteData {
  dataGlobal.__aiWorkflowWebsiteData ??= new Map();
  const existing = dataGlobal.__aiWorkflowWebsiteData.get(projectId);
  if (existing !== undefined) return existing;
  const created: MemoryWebsiteData = {
    actions: [],
    collections: new Map(),
    forms: new Map(),
    idempotency: new Map(),
    records: new Map(),
  };
  dataGlobal.__aiWorkflowWebsiteData.set(projectId, created);
  return created;
}

function collectionView(value: unknown): WebsiteDataCollection {
  const row = CollectionRowSchema.parse(value);
  return WebsiteDataCollectionSchema.parse({
    collectionKey: row.collection_key,
    createdAt: row.created_at,
    fields: row.fields,
    id: row.id,
    name: row.name,
    projectId: row.project_id,
    reviewedAt: row.reviewed_at,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at,
  });
}

function formView(value: unknown): WebsiteDataForm {
  const row = FormRowSchema.parse(value);
  return WebsiteDataFormSchema.parse({
    active: row.active,
    collectionKey: row.collection_key,
    createdAt: row.created_at,
    fieldKeys: row.field_keys,
    formKey: row.form_key,
    id: row.id,
    pageSlug: row.page_slug,
    projectId: row.project_id,
    requiredRole: row.required_role,
    submitLabel: row.submit_label,
    successMessage: row.success_message,
    tenantId: row.tenant_id,
    title: row.title,
    updatedAt: row.updated_at,
    workflowTrigger: row.workflow_trigger,
  });
}

function recordView(value: unknown): WebsiteDataRecord {
  const row = RecordRowSchema.parse(value);
  return WebsiteDataRecordSchema.parse({
    collectionKey: row.collection_key,
    createdAt: row.created_at,
    id: row.id,
    ownerSiteUserId: row.owner_site_user_id,
    projectId: row.project_id,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at,
    values: row.values,
    version: row.version,
  });
}

function actionView(value: unknown): WebsiteDataActionRun {
  const row = ActionRowSchema.parse(value);
  return WebsiteDataActionRunSchema.parse({
    action: row.action,
    createdAt: row.created_at,
    id: row.id,
    idempotencyKey: row.idempotency_key,
    recordId: row.record_id,
    status: row.status,
    trigger: row.workflow_trigger,
  });
}

function assertCanManage(context: WorkspaceContext): void {
  if (context.actor.role === 'viewer') {
    throw new WebsiteStudioError('WEBSITE_FORBIDDEN', 'Viewer access cannot change website data.');
  }
}

async function assertKnownPage(
  context: WorkspaceContext,
  projectId: string,
  pageSlug: string,
): Promise<void> {
  const generation = await getWebsiteSpecGeneration(context, projectId);
  if (generation === undefined || !generation.spec.pages.some((page) => page.slug === pageSlug)) {
    throw new WebsiteStudioError(
      'WEBSITE_INVALID',
      'The data form must target a page in the current validated Canvas.',
    );
  }
}

function collectionByKey(
  dashboard: Pick<WebsiteDataDashboard, 'collections'>,
  collectionKey: string,
): WebsiteDataCollection {
  const collection = dashboard.collections.find(
    (candidate) => candidate.collectionKey === collectionKey,
  );
  if (collection === undefined) {
    throw new WebsiteStudioError('WEBSITE_NOT_FOUND', 'The website data collection was not found.');
  }
  return collection;
}

function stableHash(value: unknown): string {
  const normalized = JSON.stringify(value, (_key, current) => {
    if (current !== null && typeof current === 'object' && !Array.isArray(current)) {
      return Object.fromEntries(
        Object.entries(current as Readonly<Record<string, unknown>>).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      );
    }
    return current;
  });
  return createHash('sha256').update(normalized).digest('hex');
}

function invalidField(field: WebsiteDataField): never {
  throw new WebsiteStudioError('WEBSITE_INVALID', `Invalid value for field "${field.label}".`);
}

function normalizedFieldValue(
  field: WebsiteDataField,
  raw: unknown,
): string | number | boolean | null {
  if (raw === undefined || raw === null || raw === '') {
    if (field.required) invalidField(field);
    return null;
  }
  if (field.type === 'boolean') {
    if (raw === true || raw === 'true' || raw === 'on') return true;
    if (raw === false || raw === 'false') return false;
    return invalidField(field);
  }
  if (field.type === 'number') {
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000_000) return invalidField(field);
    return value;
  }
  if (typeof raw !== 'string') return invalidField(field);
  const value = raw.trim();
  if (field.type === 'text' && (value.length < 1 || value.length > 500)) return invalidField(field);
  if (field.type === 'long-text' && (value.length < 1 || value.length > 8_000)) {
    return invalidField(field);
  }
  if (field.type === 'email' && !z.string().email().max(254).safeParse(value).success) {
    return invalidField(field);
  }
  if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return invalidField(field);
  if (field.type === 'select' && !field.options.includes(value)) return invalidField(field);
  if (field.type === 'reference' && !z.string().uuid().safeParse(value).success) {
    return invalidField(field);
  }
  return value;
}

async function validateReferences(
  projectId: string,
  collections: readonly WebsiteDataCollection[],
  fields: readonly WebsiteDataField[],
  values: WebsiteDataValues,
): Promise<void> {
  for (const field of fields) {
    if (field.type !== 'reference') continue;
    const value = values[field.key];
    if (value === null || value === undefined) continue;
    const targetCollection = collections.find(
      (collection) => collection.collectionKey === field.referenceCollectionKey,
    );
    if (targetCollection === undefined) {
      throw new WebsiteStudioError(
        'WEBSITE_INVALID',
        `Reference field "${field.label}" targets an unavailable collection.`,
      );
    }
    if (getEnvironment().mockMode) {
      const target = memoryData(projectId).records.get(String(value));
      if (target?.collectionKey !== targetCollection.collectionKey) {
        throw new WebsiteStudioError(
          'WEBSITE_INVALID',
          'The referenced website record is invalid.',
        );
      }
    } else {
      const result = await createSupabaseAdminClient()
        .from('website_data_records')
        .select('id')
        .eq('project_id', projectId)
        .eq('collection_id', targetCollection.id)
        .eq('id', String(value))
        .maybeSingle();
      if (result.error !== null || result.data === null) {
        throw new WebsiteStudioError(
          'WEBSITE_INVALID',
          'The referenced website record is invalid.',
        );
      }
    }
  }
}

async function validateValues(
  projectId: string,
  collections: readonly WebsiteDataCollection[],
  collection: WebsiteDataCollection,
  rawValues: Readonly<Record<string, unknown>>,
  allowedFieldKeys?: readonly string[],
): Promise<WebsiteDataValues> {
  const allowedFields =
    allowedFieldKeys === undefined
      ? collection.fields
      : collection.fields.filter((field) => allowedFieldKeys.includes(field.key));
  const allowed = new Set(allowedFields.map((field) => field.key));
  if (Object.keys(rawValues).some((key) => !allowed.has(key))) {
    throw new WebsiteStudioError('WEBSITE_INVALID', 'The website data contains an unknown field.');
  }
  const values = Object.fromEntries(
    allowedFields.map((field) => [field.key, normalizedFieldValue(field, rawValues[field.key])]),
  );
  const parsed = z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .parse(values);
  await validateReferences(projectId, collections, allowedFields, parsed);
  return parsed;
}

function roleRank(role: WebsiteSiteRole): number {
  return { manager: 3, member: 1, staff: 2 }[role];
}

async function recordDefinitionAudit(
  context: WorkspaceContext,
  projectId: string,
  action: 'collection_reviewed' | 'form_reviewed',
  resourceId: string,
  metadata: Readonly<Record<string, string | number | boolean | null>>,
): Promise<void> {
  if (getEnvironment().mockMode) return;
  const result = await createSupabaseAdminClient()
    .from('audit_logs')
    .insert({
      action: `website_data.${action}`,
      actor_user_id: context.actor.userId,
      correlation_id: projectId,
      metadata,
      resource_id: resourceId,
      resource_type: `website_data_${action === 'collection_reviewed' ? 'collection' : 'form'}`,
      tenant_id: context.actor.tenantId,
    });
  if (result.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The website data review audit could not be recorded.',
    );
  }
}

export async function getWebsiteDataDashboard(
  context: WorkspaceContext,
  projectId: string,
): Promise<WebsiteDataDashboard> {
  const project = await getWebsiteProject(context, projectId);
  if (getEnvironment().mockMode) {
    const memory = memoryData(project.id);
    return WebsiteDataDashboardSchema.parse({
      actions: [...memory.actions]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 100),
      collections: [...memory.collections.values()].sort((left, right) =>
        left.collectionKey.localeCompare(right.collectionKey),
      ),
      forms: [...memory.forms.values()].sort((left, right) =>
        left.formKey.localeCompare(right.formKey),
      ),
      records: [...memory.records.values()]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 200),
    });
  }
  const admin = createSupabaseAdminClient();
  const [collectionsResult, formsResult, recordsResult, actionsResult] = await Promise.all([
    admin
      .from('website_data_collections')
      .select(
        'collection_key, created_at, fields, id, name, project_id, reviewed_at, tenant_id, updated_at',
      )
      .eq('tenant_id', context.actor.tenantId)
      .eq('project_id', project.id)
      .order('collection_key')
      .limit(12),
    admin
      .from('website_data_forms')
      .select(
        'active, collection:website_data_collections!inner(collection_key), created_at, field_keys, form_key, id, page_slug, project_id, required_role, submit_label, success_message, tenant_id, title, updated_at, workflow_trigger',
      )
      .eq('tenant_id', context.actor.tenantId)
      .eq('project_id', project.id)
      .order('form_key')
      .limit(12),
    admin
      .from('website_data_records')
      .select(
        'collection:website_data_collections!inner(collection_key), created_at, id, owner_site_user_id, project_id, tenant_id, updated_at, values, version',
      )
      .eq('tenant_id', context.actor.tenantId)
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(200),
    admin
      .from('website_data_action_runs')
      .select('action, created_at, id, idempotency_key, record_id, status, workflow_trigger')
      .eq('tenant_id', context.actor.tenantId)
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  const collectionRows = z.array(CollectionRowSchema).safeParse(collectionsResult.data);
  const formRows = z
    .array(
      FormRowSchema.omit({ collection_key: true }).extend({
        collection: z.object({ collection_key: z.string().min(2).max(48) }),
      }),
    )
    .safeParse(formsResult.data);
  const recordRows = z
    .array(
      RecordRowSchema.omit({ collection_key: true }).extend({
        collection: z.object({ collection_key: z.string().min(2).max(48) }),
      }),
    )
    .safeParse(recordsResult.data);
  const actionRows = z.array(ActionRowSchema).safeParse(actionsResult.data);
  if (
    collectionsResult.error !== null ||
    formsResult.error !== null ||
    recordsResult.error !== null ||
    actionsResult.error !== null ||
    !collectionRows.success ||
    !formRows.success ||
    !recordRows.success ||
    !actionRows.success
  ) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The website data workspace could not be loaded.',
    );
  }
  return WebsiteDataDashboardSchema.parse({
    actions: actionRows.data.map(actionView),
    collections: collectionRows.data.map(collectionView),
    forms: formRows.data.map((row) =>
      formView({ ...row, collection_key: row.collection.collection_key }),
    ),
    records: recordRows.data.map((row) =>
      recordView({ ...row, collection_key: row.collection.collection_key }),
    ),
  });
}

async function saveCollection(
  context: WorkspaceContext,
  projectId: string,
  mutation: Extract<WebsiteDataMutation, { action: 'upsert-collection' }>,
  dashboard: WebsiteDataDashboard,
): Promise<void> {
  const existing = dashboard.collections.find(
    (collection) => collection.collectionKey === mutation.collectionKey,
  );
  for (const field of mutation.fields) {
    if (field.type !== 'reference') continue;
    if (field.referenceCollectionKey === mutation.collectionKey) {
      throw new WebsiteStudioError('WEBSITE_INVALID', 'A collection cannot reference itself.');
    }
    if (
      !dashboard.collections.some(
        (collection) => collection.collectionKey === field.referenceCollectionKey,
      )
    ) {
      throw new WebsiteStudioError(
        'WEBSITE_INVALID',
        `Reference collection "${field.referenceCollectionKey ?? ''}" does not exist.`,
      );
    }
  }
  if (existing === undefined && dashboard.collections.length >= 12) {
    throw new WebsiteStudioError(
      'WEBSITE_RATE_LIMITED',
      'This website has reached its collection limit.',
    );
  }
  if (
    existing !== undefined &&
    dashboard.records.some((record) => record.collectionKey === mutation.collectionKey) &&
    stableHash(existing.fields) !== stableHash(mutation.fields)
  ) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'A collection with records cannot change its reviewed fields.',
    );
  }
  const now = new Date().toISOString();
  if (getEnvironment().mockMode) {
    const memory = memoryData(projectId);
    memory.collections.set(
      mutation.collectionKey,
      WebsiteDataCollectionSchema.parse({
        collectionKey: mutation.collectionKey,
        createdAt: existing?.createdAt ?? now,
        fields: mutation.fields,
        id: existing?.id ?? crypto.randomUUID(),
        name: mutation.name,
        projectId,
        reviewedAt: now,
        tenantId: context.actor.tenantId,
        updatedAt: now,
      }),
    );
    return;
  }
  const admin = createSupabaseAdminClient();
  const attributes = {
    fields: mutation.fields,
    name: mutation.name,
    reviewed_at: now,
    reviewed_by: context.actor.userId,
    updated_by: context.actor.userId,
  };
  let resourceId = existing?.id;
  const result =
    existing === undefined
      ? await admin
          .from('website_data_collections')
          .insert({
            ...attributes,
            collection_key: mutation.collectionKey,
            created_by: context.actor.userId,
            project_id: projectId,
            tenant_id: context.actor.tenantId,
          })
          .select('id')
          .single()
      : await admin
          .from('website_data_collections')
          .update(attributes)
          .eq('tenant_id', context.actor.tenantId)
          .eq('project_id', projectId)
          .eq('id', existing.id);
  if (result.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The reviewed website collection could not be saved.',
    );
  }
  if (existing === undefined) {
    const inserted = z.object({ id: z.string().uuid() }).safeParse(result.data);
    if (!inserted.success) {
      throw new WebsiteStudioError(
        'WEBSITE_STATE_CONFLICT',
        'The reviewed website collection returned an invalid identifier.',
      );
    }
    resourceId = inserted.data.id;
  }
  await recordDefinitionAudit(context, projectId, 'collection_reviewed', resourceId ?? projectId, {
    collectionKey: mutation.collectionKey,
    fieldCount: mutation.fields.length,
  });
}

async function saveForm(
  context: WorkspaceContext,
  projectId: string,
  mutation: Extract<WebsiteDataMutation, { action: 'upsert-form' }>,
  dashboard: WebsiteDataDashboard,
): Promise<void> {
  await assertKnownPage(context, projectId, mutation.pageSlug);
  const collection = collectionByKey(dashboard, mutation.collectionKey);
  const existing = dashboard.forms.find((form) => form.formKey === mutation.formKey);
  if (existing === undefined && dashboard.forms.length >= 12) {
    throw new WebsiteStudioError(
      'WEBSITE_RATE_LIMITED',
      'This website has reached its form limit.',
    );
  }
  const fieldKeys = new Set(mutation.fieldKeys);
  if (
    fieldKeys.size !== mutation.fieldKeys.length ||
    mutation.fieldKeys.some(
      (fieldKey) => !collection.fields.some((field) => field.key === fieldKey),
    ) ||
    collection.fields.some((field) => field.required && !fieldKeys.has(field.key))
  ) {
    throw new WebsiteStudioError(
      'WEBSITE_INVALID',
      'The reviewed form must contain valid fields and every required collection field.',
    );
  }
  if (
    mutation.fieldKeys.some(
      (fieldKey) => collection.fields.find((field) => field.key === fieldKey)?.type === 'reference',
    )
  ) {
    throw new WebsiteStudioError(
      'WEBSITE_INVALID',
      'Public forms cannot expose internal record relationship identifiers.',
    );
  }
  const now = new Date().toISOString();
  if (getEnvironment().mockMode) {
    memoryData(projectId).forms.set(
      mutation.formKey,
      WebsiteDataFormSchema.parse({
        active: mutation.active,
        collectionKey: mutation.collectionKey,
        createdAt: existing?.createdAt ?? now,
        fieldKeys: mutation.fieldKeys,
        formKey: mutation.formKey,
        id: existing?.id ?? crypto.randomUUID(),
        pageSlug: mutation.pageSlug,
        projectId,
        requiredRole: mutation.requiredRole,
        submitLabel: mutation.submitLabel,
        successMessage: mutation.successMessage,
        tenantId: context.actor.tenantId,
        title: mutation.title,
        updatedAt: now,
        workflowTrigger: mutation.workflowTrigger,
      }),
    );
    return;
  }
  const admin = createSupabaseAdminClient();
  const attributes = {
    active: mutation.active,
    collection_id: collection.id,
    field_keys: mutation.fieldKeys,
    page_slug: mutation.pageSlug,
    required_role: mutation.requiredRole,
    reviewed_at: now,
    reviewed_by: context.actor.userId,
    submit_label: mutation.submitLabel,
    success_message: mutation.successMessage,
    title: mutation.title,
    updated_by: context.actor.userId,
    workflow_trigger: mutation.workflowTrigger,
  };
  let resourceId = existing?.id;
  const result =
    existing === undefined
      ? await admin
          .from('website_data_forms')
          .insert({
            ...attributes,
            created_by: context.actor.userId,
            form_key: mutation.formKey,
            project_id: projectId,
            tenant_id: context.actor.tenantId,
          })
          .select('id')
          .single()
      : await admin
          .from('website_data_forms')
          .update(attributes)
          .eq('tenant_id', context.actor.tenantId)
          .eq('project_id', projectId)
          .eq('id', existing.id);
  if (result.error !== null) {
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The reviewed website data form could not be saved.',
    );
  }
  if (existing === undefined) {
    const inserted = z.object({ id: z.string().uuid() }).safeParse(result.data);
    if (!inserted.success) {
      throw new WebsiteStudioError(
        'WEBSITE_STATE_CONFLICT',
        'The reviewed website data form returned an invalid identifier.',
      );
    }
    resourceId = inserted.data.id;
  }
  await recordDefinitionAudit(context, projectId, 'form_reviewed', resourceId ?? projectId, {
    active: mutation.active,
    fieldCount: mutation.fieldKeys.length,
    formKey: mutation.formKey,
  });
}

async function executeDataAction(
  context: WorkspaceContext | undefined,
  website: Pick<PublishedWebsite, 'projectId' | 'tenantId'>,
  collection: WebsiteDataCollection,
  dashboard: WebsiteDataDashboard,
  action: Extract<
    WebsiteDataMutation,
    { action: 'create-record' | 'delete-record' | 'update-record' }
  >,
  options: {
    readonly siteUserId?: string;
    readonly workflowTrigger?: WebsiteDataForm['workflowTrigger'];
  } = {},
): Promise<WebsiteDataRecord> {
  const current =
    action.action === 'create-record'
      ? undefined
      : dashboard.records.find((record) => record.id === action.recordId);
  if (action.action !== 'create-record') {
    if (current === undefined || current.collectionKey !== collection.collectionKey) {
      throw new WebsiteStudioError('WEBSITE_NOT_FOUND', 'The website data record was not found.');
    }
    if (current.version !== action.expectedVersion) {
      throw new WebsiteStudioError(
        'WEBSITE_STATE_CONFLICT',
        'The website data record changed before this action was approved.',
      );
    }
  }
  const values =
    action.action === 'delete-record'
      ? {}
      : await validateValues(website.projectId, dashboard.collections, collection, action.values);
  const request = {
    action: action.action,
    collectionKey: collection.collectionKey,
    expectedVersion: action.action === 'create-record' ? null : action.expectedVersion,
    recordId: action.action === 'create-record' ? null : action.recordId,
    trigger: options.workflowTrigger ?? 'none',
    values,
  };
  const requestHash = stableHash(request);
  if (getEnvironment().mockMode) {
    const memory = memoryData(website.projectId);
    const previous = memory.idempotency.get(action.idempotencyKey);
    if (previous !== undefined) {
      if (previous.hash !== requestHash) {
        throw new WebsiteStudioError(
          'WEBSITE_STATE_CONFLICT',
          'The idempotency key is already bound to another website action.',
        );
      }
      return previous.record;
    }
    if (action.action === 'create-record' && memory.records.size >= 5_000) {
      throw new WebsiteStudioError(
        'WEBSITE_RATE_LIMITED',
        'This website has reached its record limit.',
      );
    }
    const now = new Date().toISOString();
    const result =
      action.action === 'create-record'
        ? WebsiteDataRecordSchema.parse({
            collectionKey: collection.collectionKey,
            createdAt: now,
            id: crypto.randomUUID(),
            ownerSiteUserId: options.siteUserId ?? null,
            projectId: website.projectId,
            tenantId: website.tenantId,
            updatedAt: now,
            values,
            version: 1,
          })
        : action.action === 'update-record'
          ? WebsiteDataRecordSchema.parse({
              ...current,
              updatedAt: now,
              values,
              version: current!.version + 1,
            })
          : current!;
    if (action.action === 'delete-record') memory.records.delete(result.id);
    else memory.records.set(result.id, result);
    memory.idempotency.set(action.idempotencyKey, { hash: requestHash, record: result });
    memory.actions.unshift(
      WebsiteDataActionRunSchema.parse({
        action: action.action,
        createdAt: now,
        id: crypto.randomUUID(),
        idempotencyKey: action.idempotencyKey,
        recordId: result.id,
        status: 'succeeded',
        trigger: options.workflowTrigger ?? 'none',
      }),
    );
    return result;
  }
  const result = await createSupabaseAdminClient().rpc('execute_website_data_action', {
    action_idempotency_key: action.idempotencyKey,
    action_name: action.action,
    action_values: values,
    action_workflow_trigger: options.workflowTrigger ?? 'none',
    deletion_confirmed: action.action === 'delete-record',
    site_actor_user_id: options.siteUserId ?? null,
    target_collection_key: collection.collectionKey,
    target_expected_version: action.action === 'create-record' ? null : action.expectedVersion,
    target_project_id: website.projectId,
    target_record_id: action.action === 'create-record' ? null : action.recordId,
    target_tenant_id: website.tenantId,
    workspace_actor_user_id: context?.actor.userId ?? null,
  });
  if (result.error !== null) {
    const message = result.error.message.toLowerCase();
    if (message.includes('quota')) {
      throw new WebsiteStudioError('WEBSITE_RATE_LIMITED', 'This website reached its data limit.');
    }
    if (message.includes('version') || message.includes('idempotency')) {
      throw new WebsiteStudioError(
        'WEBSITE_STATE_CONFLICT',
        'The website data action conflicted with an earlier request.',
      );
    }
    throw new WebsiteStudioError(
      'WEBSITE_STATE_CONFLICT',
      'The safe website data action could not be completed.',
    );
  }
  return WebsiteDataRecordSchema.parse(result.data);
}

export async function mutateWebsiteData(
  context: WorkspaceContext,
  projectId: string,
  mutationValue: WebsiteDataMutation,
): Promise<WebsiteDataDashboard> {
  assertCanManage(context);
  const mutation = WebsiteDataMutationSchema.parse(mutationValue);
  const project = await getWebsiteProject(context, projectId);
  const dashboard = await getWebsiteDataDashboard(context, project.id);
  if (mutation.action === 'upsert-collection') {
    await saveCollection(context, project.id, mutation, dashboard);
  } else if (mutation.action === 'upsert-form') {
    await saveForm(context, project.id, mutation, dashboard);
  } else {
    const collection = collectionByKey(dashboard, mutation.collectionKey);
    await executeDataAction(
      context,
      { projectId: project.id, tenantId: context.actor.tenantId },
      collection,
      dashboard,
      mutation,
    );
  }
  return getWebsiteDataDashboard(context, project.id);
}

async function publishedData(
  website: Pick<PublishedWebsite, 'projectId' | 'tenantId'>,
): Promise<Pick<WebsiteDataDashboard, 'collections' | 'forms'>> {
  if (getEnvironment().mockMode) {
    const memory = memoryData(website.projectId);
    return {
      collections: [...memory.collections.values()],
      forms: [...memory.forms.values()],
    };
  }
  const admin = createSupabaseAdminClient();
  const [collectionsResult, formsResult] = await Promise.all([
    admin
      .from('website_data_collections')
      .select(
        'collection_key, created_at, fields, id, name, project_id, reviewed_at, tenant_id, updated_at',
      )
      .eq('tenant_id', website.tenantId)
      .eq('project_id', website.projectId)
      .limit(12),
    admin
      .from('website_data_forms')
      .select(
        'active, collection:website_data_collections!inner(collection_key), created_at, field_keys, form_key, id, page_slug, project_id, required_role, submit_label, success_message, tenant_id, title, updated_at, workflow_trigger',
      )
      .eq('tenant_id', website.tenantId)
      .eq('project_id', website.projectId)
      .eq('active', true)
      .limit(12),
  ]);
  const collections = z.array(CollectionRowSchema).safeParse(collectionsResult.data);
  const forms = z
    .array(
      FormRowSchema.omit({ collection_key: true }).extend({
        collection: z.object({ collection_key: z.string().min(2).max(48) }),
      }),
    )
    .safeParse(formsResult.data);
  if (
    collectionsResult.error !== null ||
    formsResult.error !== null ||
    !collections.success ||
    !forms.success
  ) {
    return { collections: [], forms: [] };
  }
  return {
    collections: collections.data.map(collectionView),
    forms: forms.data.map((row) =>
      formView({ ...row, collection_key: row.collection.collection_key }),
    ),
  };
}

export async function listPublishedWebsiteDataForms(
  website: Pick<PublishedWebsite, 'projectId' | 'tenantId'>,
  pageSlug: string,
): Promise<readonly PublicWebsiteDataForm[]> {
  const data = await publishedData(website);
  return data.forms
    .filter((form) => form.active && form.pageSlug === pageSlug)
    .map((form) => ({
      collection: collectionByKey(data, form.collectionKey),
      form,
    }));
}

export async function submitPublishedWebsiteDataForm(
  website: Pick<PublishedWebsite, 'projectId' | 'tenantId'>,
  submissionValue: WebsitePublicDataSubmission,
  mockToken?: string,
): Promise<{ readonly message: string; readonly record: WebsiteDataRecord }> {
  const submission = WebsitePublicDataSubmissionSchema.parse(submissionValue);
  const data = await publishedData(website);
  const form = data.forms.find(
    (candidate) =>
      candidate.active &&
      candidate.formKey === submission.formKey &&
      candidate.pageSlug === submission.pageSlug,
  );
  if (form === undefined) {
    throw new WebsiteStudioError('WEBSITE_NOT_FOUND', 'The published website form was not found.');
  }
  const auth = await getWebsiteSiteAuthState(website, mockToken);
  if (
    form.requiredRole !== null &&
    (auth.member === undefined ||
      auth.member.status !== 'active' ||
      roleRank(auth.member.role) < roleRank(form.requiredRole))
  ) {
    throw new WebsiteStudioError(
      'WEBSITE_FORBIDDEN',
      'This website form requires a higher site role.',
    );
  }
  const collection = collectionByKey(data, form.collectionKey);
  const values = await validateValues(
    website.projectId,
    data.collections,
    collection,
    submission.values,
    form.fieldKeys,
  );
  if (getEnvironment().mockMode) {
    const cutoff = Date.now() - 60_000;
    const recent = memoryData(website.projectId).actions.filter(
      (action) =>
        action.action === 'create-record' && new Date(action.createdAt).getTime() >= cutoff,
    );
    if (recent.length >= 30) {
      throw new WebsiteStudioError(
        'WEBSITE_RATE_LIMITED',
        'This website form is temporarily rate limited.',
      );
    }
  } else {
    const recent = await createSupabaseAdminClient()
      .from('website_data_action_runs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', website.tenantId)
      .eq('project_id', website.projectId)
      .eq('action', 'create-record')
      .gte('created_at', new Date(Date.now() - 60_000).toISOString());
    if (recent.error !== null || recent.count === null) {
      throw new WebsiteStudioError(
        'WEBSITE_STATE_CONFLICT',
        'The website form rate limit could not be verified.',
      );
    }
    if (recent.count >= 30) {
      throw new WebsiteStudioError(
        'WEBSITE_RATE_LIMITED',
        'This website form is temporarily rate limited.',
      );
    }
  }
  const record = await executeDataAction(
    undefined,
    website,
    collection,
    { actions: [], collections: data.collections, forms: data.forms, records: [] },
    {
      action: 'create-record',
      collectionKey: collection.collectionKey,
      idempotencyKey: submission.idempotencyKey,
      values,
    },
    {
      ...(auth.member === undefined ? {} : { siteUserId: auth.member.userId }),
      workflowTrigger: form.workflowTrigger,
    },
  );
  return { message: form.successMessage, record };
}
