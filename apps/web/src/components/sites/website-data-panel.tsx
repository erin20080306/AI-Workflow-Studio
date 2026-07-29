'use client';

import {
  WebsiteDataDashboardSchema,
  WebsiteDataValueSchema,
  type WebsiteDataDashboard,
  type WebsiteDataField,
  type WebsiteDataFieldType,
} from '@ai-workflow-studio/website-schema';
import { useMemo, useState } from 'react';
import { z } from 'zod';

import { useLanguage } from '@/components/language-provider';

const DashboardResponseSchema = z.object({ dashboard: WebsiteDataDashboardSchema }).strict();
const EditableValuesSchema = z.record(z.string(), WebsiteDataValueSchema);

interface FieldDraft {
  readonly id: string;
  key: string;
  label: string;
  options: string;
  referenceCollectionKey: string;
  required: boolean;
  type: WebsiteDataFieldType;
}

function createField(): FieldDraft {
  return {
    id: crypto.randomUUID(),
    key: 'name',
    label: '姓名',
    options: '',
    referenceCollectionKey: '',
    required: true,
    type: 'text',
  };
}

function safeKey(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, '')
    .replaceAll(/^-+/g, '');
}

const copy = {
  en: {
    actionHistory: 'Safe action history',
    active: 'Published and active',
    addField: 'Add field',
    collection: 'Collection',
    collectionKey: 'Collection key',
    collectionName: 'Collection name',
    collections: 'Collections',
    createRecord: 'Create record',
    data: 'Custom data',
    delete: 'Delete',
    deleteConfirm: 'Delete this record? This destructive action will be audited.',
    empty: 'Nothing has been configured yet.',
    error: 'The safe data action could not be completed.',
    fieldKey: 'Field key',
    fieldLabel: 'Field label',
    fields: 'Fields',
    formKey: 'Form key',
    formTitle: 'Form title',
    forms: 'Forms',
    intro:
      'Create reviewed data schemas and forms. The server accepts only allowlisted field types and actions.',
    json: 'Record values (validated JSON)',
    page: 'Target page',
    records: 'Records',
    reference: 'Reference collection',
    required: 'Required',
    requiredRole: 'Required site role',
    review: 'I reviewed every field, form permission, and server action.',
    saveCollection: 'Review and save collection',
    saveForm: 'Review and save form',
    saved: 'Website data workspace updated.',
    selectFields: 'Fields shown on the form',
    submitLabel: 'Submit button',
    successMessage: 'Success message',
    trigger: 'After-create workflow',
    updateRecord: 'Update selected record',
  },
  'zh-Hant': {
    actionHistory: '安全動作紀錄',
    active: '發布並啟用表單',
    addField: '新增欄位',
    collection: '資料集合',
    collectionKey: '集合代稱',
    collectionName: '集合名稱',
    collections: '資料集合',
    createRecord: '新增資料',
    data: '自訂資料',
    delete: '刪除',
    deleteConfirm: '確定刪除此資料？這個破壞性動作會留下稽核紀錄。',
    empty: '目前尚未設定資料。',
    error: '無法完成安全資料動作，請檢查設定後再試。',
    fieldKey: '欄位代稱',
    fieldLabel: '欄位名稱',
    fields: '資料欄位',
    formKey: '表單代稱',
    formTitle: '表單標題',
    forms: '表單流程',
    intro: '建立經審核的資料結構與表單；伺服器只接受平台允許的欄位類型與動作。',
    json: '資料內容（經驗證 JSON）',
    page: '表單頁面',
    records: '資料紀錄',
    reference: '關聯集合',
    required: '必填',
    requiredRole: '需要網站角色',
    review: '我已檢查每個欄位、表單權限與伺服器動作。',
    saveCollection: '審核並儲存集合',
    saveForm: '審核並儲存表單',
    saved: '網站資料工作區已更新。',
    selectFields: '表單顯示欄位',
    submitLabel: '送出按鈕文字',
    successMessage: '送出成功訊息',
    trigger: '新增後流程',
    updateRecord: '更新選取資料',
  },
} as const;

export function WebsiteDataPanel({
  canManage,
  initialDashboard,
  pages,
  projectId,
}: Readonly<{
  canManage: boolean;
  initialDashboard: WebsiteDataDashboard;
  pages: readonly { readonly slug: string; readonly title: string }[];
  projectId: string;
}>) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [collectionKey, setCollectionKey] = useState('bookings');
  const [collectionName, setCollectionName] = useState(locale === 'zh-Hant' ? '預約' : 'Bookings');
  const [fields, setFields] = useState<FieldDraft[]>([createField()]);
  const [collectionReviewed, setCollectionReviewed] = useState(false);
  const [formKey, setFormKey] = useState('booking-form');
  const [formTitle, setFormTitle] = useState(locale === 'zh-Hant' ? '預約表單' : 'Booking form');
  const [formCollectionKey, setFormCollectionKey] = useState('');
  const [formFieldKeys, setFormFieldKeys] = useState<string[]>([]);
  const [formPageSlug, setFormPageSlug] = useState(pages[0]?.slug ?? 'home');
  const [requiredRole, setRequiredRole] = useState('');
  const [workflowTrigger, setWorkflowTrigger] = useState<'none' | 'audit-record-created'>('none');
  const [submitLabel, setSubmitLabel] = useState(locale === 'zh-Hant' ? '送出資料' : 'Submit');
  const [successMessage, setSuccessMessage] = useState(
    locale === 'zh-Hant' ? '資料已安全送出。' : 'Your data was submitted safely.',
  );
  const [formActive, setFormActive] = useState(false);
  const [formReviewed, setFormReviewed] = useState(false);
  const [recordCollectionKey, setRecordCollectionKey] = useState('');
  const [recordJson, setRecordJson] = useState('{}');
  const [selectedRecord, setSelectedRecord] = useState<{
    readonly id: string;
    readonly version: number;
  }>();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string>();
  const formCollection = useMemo(
    () => dashboard.collections.find((item) => item.collectionKey === formCollectionKey),
    [dashboard.collections, formCollectionKey],
  );

  async function mutate(input: Readonly<Record<string, unknown>>): Promise<boolean> {
    setSaving(true);
    setNotice(undefined);
    try {
      const response = await fetch(`/api/websites/${projectId}/data`, {
        body: JSON.stringify(input),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      });
      const parsed = DashboardResponseSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) throw new Error('Invalid website data response.');
      setDashboard(parsed.data.dashboard);
      setNotice(text.saved);
      return true;
    } catch {
      setNotice(text.error);
      return false;
    } finally {
      setSaving(false);
    }
  }

  function updateField(id: string, patch: Partial<Omit<FieldDraft, 'id'>>): void {
    setFields((current) =>
      current.map((field) => (field.id === id ? { ...field, ...patch } : field)),
    );
  }

  async function saveCollection(): Promise<void> {
    const reviewedFields: WebsiteDataField[] = fields.map((field) => ({
      key: field.key,
      label: field.label,
      options:
        field.type === 'select'
          ? field.options
              .split(',')
              .map((option) => option.trim())
              .filter(Boolean)
          : [],
      referenceCollectionKey:
        field.type === 'reference' ? field.referenceCollectionKey || null : null,
      required: field.required,
      type: field.type,
    }));
    const saved = await mutate({
      action: 'upsert-collection',
      collectionKey,
      confirmed: collectionReviewed,
      fields: reviewedFields,
      name: collectionName,
    });
    if (saved) setCollectionReviewed(false);
  }

  function selectFormCollection(key: string): void {
    setFormCollectionKey(key);
    const collection = dashboard.collections.find((item) => item.collectionKey === key);
    setFormFieldKeys(
      collection?.fields.filter((field) => field.type !== 'reference').map((field) => field.key) ??
        [],
    );
  }

  async function saveForm(): Promise<void> {
    const saved = await mutate({
      action: 'upsert-form',
      active: formActive,
      collectionKey: formCollectionKey,
      confirmed: formReviewed,
      fieldKeys: formFieldKeys,
      formKey,
      pageSlug: formPageSlug,
      requiredRole: requiredRole || null,
      submitLabel,
      successMessage,
      title: formTitle,
      workflowTrigger,
    });
    if (saved) setFormReviewed(false);
  }

  async function saveRecord(): Promise<void> {
    const parsedJson = (() => {
      try {
        return EditableValuesSchema.safeParse(JSON.parse(recordJson));
      } catch {
        return { success: false } as const;
      }
    })();
    if (!parsedJson.success) {
      setNotice(text.error);
      return;
    }
    const saved = await mutate(
      selectedRecord === undefined
        ? {
            action: 'create-record',
            collectionKey: recordCollectionKey,
            idempotencyKey: crypto.randomUUID(),
            values: parsedJson.data,
          }
        : {
            action: 'update-record',
            collectionKey: recordCollectionKey,
            expectedVersion: selectedRecord.version,
            idempotencyKey: crypto.randomUUID(),
            recordId: selectedRecord.id,
            values: parsedJson.data,
          },
    );
    if (saved) {
      setSelectedRecord(undefined);
      setRecordJson('{}');
    }
  }

  async function deleteRecord(record: WebsiteDataDashboard['records'][number]): Promise<void> {
    if (!globalThis.confirm(text.deleteConfirm)) return;
    await mutate({
      action: 'delete-record',
      collectionKey: record.collectionKey,
      confirmed: true,
      expectedVersion: record.version,
      idempotencyKey: crypto.randomUUID(),
      recordId: record.id,
    });
  }

  function beginEdit(record: WebsiteDataDashboard['records'][number]): void {
    setRecordCollectionKey(record.collectionKey);
    setRecordJson(JSON.stringify(record.values, null, 2));
    setSelectedRecord({ id: record.id, version: record.version });
  }

  return (
    <section className="mt-5 space-y-5">
      <div className="rounded-3xl bg-slate-950 p-6 text-white">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">
          {text.data}
        </p>
        <h2 className="mt-2 text-2xl font-semibold">
          {text.forms} · {text.collections}
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300">{text.intro}</p>
        <dl className="mt-5 grid gap-3 sm:grid-cols-4">
          {[
            [text.collections, dashboard.collections.length],
            [text.forms, dashboard.forms.length],
            [text.records, dashboard.records.length],
            [text.actionHistory, dashboard.actions.length],
          ].map(([label, value]) => (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4" key={label}>
              <dt className="text-xs text-slate-400">{label}</dt>
              <dd className="mt-1 text-2xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {notice === undefined ? null : (
        <p
          aria-live="polite"
          className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-900"
        >
          {notice}
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h3 className="text-xl font-semibold text-slate-950">{text.collections}</h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-700">
              {text.collectionKey}
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 font-mono text-sm"
                disabled={!canManage}
                onChange={(event) => setCollectionKey(safeKey(event.target.value))}
                value={collectionKey}
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              {text.collectionName}
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"
                disabled={!canManage}
                onChange={(event) => setCollectionName(event.target.value)}
                value={collectionName}
              />
            </label>
          </div>
          <div className="mt-5 space-y-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              {text.fields}
            </p>
            {fields.map((field) => (
              <div className="rounded-2xl border border-slate-200 p-4" key={field.id}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    aria-label={text.fieldKey}
                    className="rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-xs"
                    disabled={!canManage}
                    onChange={(event) =>
                      updateField(field.id, { key: safeKey(event.target.value) })
                    }
                    placeholder={text.fieldKey}
                    value={field.key}
                  />
                  <input
                    aria-label={text.fieldLabel}
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-xs"
                    disabled={!canManage}
                    onChange={(event) => updateField(field.id, { label: event.target.value })}
                    placeholder={text.fieldLabel}
                    value={field.label}
                  />
                  <select
                    aria-label="Field type"
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs"
                    disabled={!canManage}
                    onChange={(event) =>
                      updateField(field.id, {
                        type: event.target.value as WebsiteDataFieldType,
                      })
                    }
                    value={field.type}
                  >
                    {[
                      'text',
                      'long-text',
                      'number',
                      'boolean',
                      'date',
                      'email',
                      'select',
                      'reference',
                    ].map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  {field.type === 'select' ? (
                    <input
                      aria-label="Options"
                      className="rounded-xl border border-slate-300 px-3 py-2.5 text-xs"
                      disabled={!canManage}
                      onChange={(event) => updateField(field.id, { options: event.target.value })}
                      placeholder="new, confirmed, cancelled"
                      value={field.options}
                    />
                  ) : field.type === 'reference' ? (
                    <select
                      aria-label={text.reference}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs"
                      disabled={!canManage}
                      onChange={(event) =>
                        updateField(field.id, { referenceCollectionKey: event.target.value })
                      }
                      value={field.referenceCollectionKey}
                    >
                      <option value="">—</option>
                      {dashboard.collections.map((collection) => (
                        <option key={collection.id} value={collection.collectionKey}>
                          {collection.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span />
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <input
                      checked={field.required}
                      disabled={!canManage}
                      onChange={(event) =>
                        updateField(field.id, { required: event.target.checked })
                      }
                      type="checkbox"
                    />
                    {text.required}
                  </label>
                  {fields.length > 1 ? (
                    <button
                      className="text-xs font-semibold text-rose-700"
                      disabled={!canManage}
                      onClick={() =>
                        setFields((current) => current.filter((item) => item.id !== field.id))
                      }
                      type="button"
                    >
                      {text.delete}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <button
            className="mt-3 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold"
            disabled={!canManage || fields.length >= 24}
            onClick={() => setFields((current) => [...current, createField()])}
            type="button"
          >
            + {text.addField}
          </button>
          <label className="mt-5 flex items-start gap-3 text-xs font-semibold text-slate-700">
            <input
              checked={collectionReviewed}
              disabled={!canManage}
              onChange={(event) => setCollectionReviewed(event.target.checked)}
              type="checkbox"
            />
            {text.review}
          </label>
          <button
            className="mt-4 w-full rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
            disabled={!canManage || !collectionReviewed || saving}
            onClick={() => void saveCollection()}
            type="button"
          >
            {text.saveCollection}
          </button>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h3 className="text-xl font-semibold text-slate-950">{text.forms}</h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-700">
              {text.formKey}
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 font-mono text-sm"
                disabled={!canManage}
                onChange={(event) => setFormKey(safeKey(event.target.value))}
                value={formKey}
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              {text.formTitle}
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"
                disabled={!canManage}
                onChange={(event) => setFormTitle(event.target.value)}
                value={formTitle}
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              {text.collection}
              <select
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                disabled={!canManage}
                onChange={(event) => selectFormCollection(event.target.value)}
                value={formCollectionKey}
              >
                <option value="">—</option>
                {dashboard.collections.map((collection) => (
                  <option key={collection.id} value={collection.collectionKey}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-700">
              {text.page}
              <select
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                disabled={!canManage}
                onChange={(event) => setFormPageSlug(event.target.value)}
                value={formPageSlug}
              >
                {pages.map((page) => (
                  <option key={page.slug} value={page.slug}>
                    {page.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-700">
              {text.requiredRole}
              <select
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                disabled={!canManage}
                onChange={(event) => setRequiredRole(event.target.value)}
                value={requiredRole}
              >
                <option value="">Public</option>
                <option value="member">member</option>
                <option value="staff">staff</option>
                <option value="manager">manager</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-700">
              {text.trigger}
              <select
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                disabled={!canManage}
                onChange={(event) =>
                  setWorkflowTrigger(event.target.value as 'none' | 'audit-record-created')
                }
                value={workflowTrigger}
              >
                <option value="none">none</option>
                <option value="audit-record-created">audit-record-created</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-700">
              {text.submitLabel}
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"
                disabled={!canManage}
                onChange={(event) => setSubmitLabel(event.target.value)}
                value={submitLabel}
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              {text.successMessage}
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"
                disabled={!canManage}
                onChange={(event) => setSuccessMessage(event.target.value)}
                value={successMessage}
              />
            </label>
          </div>
          {formCollection === undefined ? null : (
            <fieldset className="mt-5 rounded-2xl border border-slate-200 p-4">
              <legend className="px-2 text-xs font-bold text-slate-700">{text.selectFields}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {formCollection.fields.map((field) => (
                  <label className="flex items-center gap-2 text-xs text-slate-700" key={field.key}>
                    <input
                      checked={formFieldKeys.includes(field.key)}
                      disabled={!canManage || field.required || field.type === 'reference'}
                      onChange={(event) =>
                        setFormFieldKeys((current) =>
                          event.target.checked
                            ? [...current, field.key]
                            : current.filter((key) => key !== field.key),
                        )
                      }
                      type="checkbox"
                    />
                    {field.label} · {field.type}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="mt-5 flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                checked={formActive}
                disabled={!canManage}
                onChange={(event) => setFormActive(event.target.checked)}
                type="checkbox"
              />
              {text.active}
            </label>
            <label className="flex items-start gap-2 text-xs font-semibold text-slate-700">
              <input
                checked={formReviewed}
                disabled={!canManage}
                onChange={(event) => setFormReviewed(event.target.checked)}
                type="checkbox"
              />
              {text.review}
            </label>
          </div>
          <button
            className="mt-4 w-full rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
            disabled={!canManage || !formReviewed || saving || formCollection === undefined}
            onClick={() => void saveForm()}
            type="button"
          >
            {text.saveForm}
          </button>
          <div className="mt-5 space-y-2">
            {dashboard.forms.map((form) => (
              <div className="rounded-2xl border border-slate-200 p-4 text-xs" key={form.id}>
                <strong>{form.title}</strong>
                <p className="mt-1 text-slate-500">
                  /{form.pageSlug} · {form.collectionKey} · {form.requiredRole ?? 'public'} ·{' '}
                  {form.active ? 'active' : 'draft'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h3 className="text-xl font-semibold text-slate-950">{text.records}</h3>
          <label className="mt-5 block text-xs font-semibold text-slate-700">
            {text.collection}
            <select
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
              disabled={!canManage}
              onChange={(event) => {
                setRecordCollectionKey(event.target.value);
                setSelectedRecord(undefined);
                setRecordJson('{}');
              }}
              value={recordCollectionKey}
            >
              <option value="">—</option>
              {dashboard.collections.map((collection) => (
                <option key={collection.id} value={collection.collectionKey}>
                  {collection.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-4 block text-xs font-semibold text-slate-700">
            {text.json}
            <textarea
              className="mt-1.5 min-h-64 w-full rounded-xl border border-slate-300 px-3 py-3 font-mono text-xs"
              disabled={!canManage}
              onChange={(event) => setRecordJson(event.target.value)}
              spellCheck={false}
              value={recordJson}
            />
          </label>
          <button
            className="mt-4 w-full rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
            disabled={!canManage || saving || recordCollectionKey.length < 2}
            onClick={() => void saveRecord()}
            type="button"
          >
            {selectedRecord === undefined ? text.createRecord : text.updateRecord}
          </button>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h3 className="text-xl font-semibold text-slate-950">{text.records}</h3>
          <div className="mt-5 space-y-3">
            {dashboard.records.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">{text.empty}</p>
            ) : (
              dashboard.records.map((record) => (
                <article className="rounded-2xl border border-slate-200 p-4" key={record.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-mono text-xs font-semibold text-slate-700">
                      {record.collectionKey} · v{record.version}
                    </p>
                    <div className="flex gap-2">
                      <button
                        className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold"
                        disabled={!canManage}
                        onClick={() => beginEdit(record)}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700"
                        disabled={!canManage}
                        onClick={() => void deleteRecord(record)}
                        type="button"
                      >
                        {text.delete}
                      </button>
                    </div>
                  </div>
                  <pre className="mt-3 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] leading-5 text-emerald-200">
                    {JSON.stringify(record.values, null, 2)}
                  </pre>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
