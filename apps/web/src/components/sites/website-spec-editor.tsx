'use client';

import {
  WebsiteSpecClientGenerationSchema,
  WebsiteThemeSchema,
  compareWebsiteSpecs,
  type WebsiteGenerationSelection,
  type WebsiteSection,
  type WebsiteSpecClientGeneration,
} from '@ai-workflow-studio/website-schema';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';

import { CheckIcon, SaveIcon, SparkIcon } from '@/components/icons';
import { useLanguage } from '@/components/language-provider';
import { WebsiteModelDropdowns } from '@/components/sites/website-model-dropdowns';
import { WebsitePreviewCanvas } from '@/components/sites/website-preview-canvas';
import type { AiModelTierSelection, AiTierOption } from '@/lib/ai-model-selection';
import type { WebsiteGenerationModelOption } from '@/lib/website-generation-models';

type WebsiteTheme = z.infer<typeof WebsiteThemeSchema>;
type EditableField = 'attribution' | 'body' | 'copyright' | 'eyebrow' | 'quote' | 'title';

const GenerationResponseSchema = z.object({
  generation: WebsiteSpecClientGenerationSchema,
});
const VersionsResponseSchema = z.object({
  versions: z.array(WebsiteSpecClientGenerationSchema),
});

const editableLabels: Readonly<
  Record<EditableField, { readonly en: string; readonly zhHant: string }>
> = {
  attribution: { en: 'Attribution', zhHant: '署名' },
  body: { en: 'Body', zhHant: '內文' },
  copyright: { en: 'Copyright', zhHant: '版權文字' },
  eyebrow: { en: 'Eyebrow', zhHant: '前導文字' },
  quote: { en: 'Quote', zhHant: '引言' },
  title: { en: 'Title', zhHant: '標題' },
};

const sourceLabels = {
  direct: { en: 'Direct edit', zhHant: '直接編輯' },
  generated: { en: 'Generated', zhHant: 'AI 產生' },
  'natural-language': { en: 'AI edit', zhHant: 'AI 修改' },
  restore: { en: 'Restore', zhHant: '還原' },
} as const;

const copy = {
  en: {
    aiApply: 'Apply validated AI edit',
    aiHelp:
      'Describe one focused change. The model must return a complete validated Website Spec; code and arbitrary URLs remain rejected.',
    aiInstruction: 'Natural-language change',
    aiPlaceholder: 'Make the hero clearer and more concise while keeping all existing pages.',
    compare: 'Compare with',
    compareEmpty: 'Select an earlier version to see a deterministic comparison.',
    comparison: {
      addedSections: 'Added sections',
      changedPages: 'Changed pages',
      changedSections: 'Changed sections',
      movedSections: 'Moved sections',
      removedSections: 'Removed sections',
      theme: 'Theme',
    },
    copyField: 'Property',
    direct: 'Direct property controls',
    duplicate: 'Duplicate',
    editing: 'Saving a validated version…',
    failed: 'The edit could not be validated or saved.',
    history: 'Version history',
    moveDown: 'Move down',
    moveUp: 'Move up',
    page: 'Page',
    redo: 'Redo',
    restore: 'Restore as new version',
    section: 'Section',
    sectionCopy: 'Section copy',
    sectionHelp:
      'Choose a registered section, update an allowed property, reorder, or duplicate it.',
    success: 'A new reversible version was saved.',
    theme: 'Theme controls',
    themeSave: 'Save theme version',
    title: 'Visual editing and versions',
    undo: 'Undo',
    versionName: 'Version name',
    current: 'Current',
  },
  'zh-Hant': {
    aiApply: '套用已驗證 AI 修改',
    aiHelp:
      '描述一項明確修改；模型必須回傳完整且通過驗證的 Website Spec，程式碼與任意網址仍會被拒絕。',
    aiInstruction: '自然語言修改',
    aiPlaceholder: '讓首頁 Hero 更精簡清楚，但保留所有既有頁面。',
    compare: '比較版本',
    compareEmpty: '選擇較早版本，即可查看決定性的差異摘要。',
    comparison: {
      addedSections: '新增區塊',
      changedPages: '變更頁面',
      changedSections: '變更區塊',
      movedSections: '移動區塊',
      removedSections: '移除區塊',
      theme: '主題',
    },
    copyField: '屬性',
    direct: '直接屬性控制',
    duplicate: '複製區塊',
    editing: '正在儲存已驗證版本…',
    failed: '修改未通過驗證，或目前無法儲存。',
    history: '版本紀錄',
    moveDown: '向下移動',
    moveUp: '向上移動',
    page: '頁面',
    redo: '重做',
    restore: '還原為新版本',
    section: '區塊',
    sectionCopy: '區塊文案',
    sectionHelp: '選擇已註冊區塊後，可修改允許的屬性、重新排序或複製。',
    success: '已儲存新的可還原版本。',
    theme: '主題控制',
    themeSave: '儲存主題版本',
    title: '視覺編輯與版本',
    undo: '復原',
    versionName: '版本名稱',
    current: '目前版本',
  },
} as const;

function editableFields(section: WebsiteSection | undefined): readonly EditableField[] {
  if (section === undefined) return [];
  return (Object.keys(editableLabels) as EditableField[]).filter((field) => field in section);
}

function sectionFieldValue(section: WebsiteSection | undefined, field: EditableField): string {
  if (section === undefined) return '';
  switch (field) {
    case 'attribution':
      return 'attribution' in section ? section.attribution : '';
    case 'body':
      return 'body' in section && typeof section.body === 'string' ? section.body : '';
    case 'copyright':
      return 'copyright' in section ? section.copyright : '';
    case 'eyebrow':
      return 'eyebrow' in section ? (section.eyebrow ?? '') : '';
    case 'quote':
      return 'quote' in section ? section.quote : '';
    case 'title':
      return 'title' in section ? section.title : '';
  }
}

export function WebsiteSpecEditor({
  initialGeneration,
  initialVersions,
  modelOptions,
  projectId,
  tierOptions,
}: Readonly<{
  initialGeneration: WebsiteSpecClientGeneration;
  initialVersions: readonly WebsiteSpecClientGeneration[];
  modelOptions: readonly WebsiteGenerationModelOption[];
  projectId: string;
  tierOptions: readonly AiTierOption[];
}>) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const [generation, setGeneration] = useState(initialGeneration);
  const [versions, setVersions] = useState<readonly WebsiteSpecClientGeneration[]>(initialVersions);
  const [pageSlug, setPageSlug] = useState(initialGeneration.spec.pages[0]?.slug ?? '');
  const currentPage = generation.spec.pages.find((page) => page.slug === pageSlug);
  const [sectionId, setSectionId] = useState(currentPage?.sections[0]?.id ?? '');
  const section = currentPage?.sections.find((candidate) => candidate.id === sectionId);
  const fields = editableFields(section);
  const [copyField, setCopyField] = useState<EditableField>(fields[0] ?? 'title');
  const [copyValue, setCopyValue] = useState(sectionFieldValue(section, copyField));
  const [theme, setTheme] = useState<WebsiteTheme>(generation.spec.theme);
  const [instruction, setInstruction] = useState('');
  const [selectedModel, setSelectedModel] = useState<WebsiteGenerationSelection>(
    modelOptions[0]?.id ?? 'auto',
  );
  const [selectedTier, setSelectedTier] = useState<AiModelTierSelection>('auto');
  const [versionName, setVersionName] = useState(`Version ${generation.version + 1}`);
  const [compareVersion, setCompareVersion] = useState<number>();
  const [undoStack, setUndoStack] = useState<number[]>([]);
  const [redoStack, setRedoStack] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    const activePage =
      generation.spec.pages.find((page) => page.slug === pageSlug) ?? generation.spec.pages[0];
    const activeSection =
      activePage?.sections.find((candidate) => candidate.id === sectionId) ??
      activePage?.sections[0];
    if (activePage !== undefined && activePage.slug !== pageSlug) setPageSlug(activePage.slug);
    if (activeSection !== undefined && activeSection.id !== sectionId)
      setSectionId(activeSection.id);
    const nextFields = editableFields(activeSection);
    const nextField = nextFields.includes(copyField) ? copyField : (nextFields[0] ?? 'title');
    if (nextField !== copyField) setCopyField(nextField);
    setCopyValue(sectionFieldValue(activeSection, nextField));
  }, [copyField, generation.spec.pages, pageSlug, sectionId]);

  useEffect(() => {
    setTheme(generation.spec.theme);
    setVersionName(`Version ${generation.version + 1}`);
  }, [generation]);

  const baseline = versions.find((version) => version.version === compareVersion);
  const comparison = useMemo(
    () =>
      baseline === undefined ? undefined : compareWebsiteSpecs(baseline.spec, generation.spec),
    [baseline, generation.spec],
  );

  async function refreshVersions(): Promise<void> {
    const response = await fetch(`/api/websites/${projectId}/versions`, { cache: 'no-store' });
    if (!response.ok) return;
    const payload: unknown = await response.json();
    setVersions(VersionsResponseSchema.parse(payload).versions);
  }

  function acceptGeneration(next: WebsiteSpecClientGeneration, previousVersion: number): void {
    setGeneration(next);
    setUndoStack((stack) => [...stack, previousVersion]);
    setRedoStack([]);
    setMessage(text.success);
    void refreshVersions();
  }

  async function createEdit(payload: Readonly<Record<string, unknown>>): Promise<void> {
    if (busy || versionName.trim().length === 0) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/websites/${projectId}/edits`, {
        body: JSON.stringify(payload),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error('edit failed');
      const next = GenerationResponseSchema.parse(body).generation;
      acceptGeneration(next, generation.version);
    } catch {
      setMessage(text.failed);
    } finally {
      setBusy(false);
    }
  }

  async function restoreVersion(
    targetVersion: number,
    mode: 'history' | 'redo' | 'undo',
  ): Promise<void> {
    if (busy) return;
    const previousVersion = generation.version;
    setBusy(true);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/websites/${projectId}/versions/${targetVersion}/restore`, {
        body: JSON.stringify({
          versionName:
            mode === 'undo'
              ? `Undo to v${targetVersion}`
              : mode === 'redo'
                ? `Redo v${targetVersion}`
                : versionName,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error('restore failed');
      const next = GenerationResponseSchema.parse(body).generation;
      setGeneration(next);
      if (mode === 'undo') {
        setUndoStack((stack) => stack.slice(0, -1));
        setRedoStack((stack) => [...stack, previousVersion]);
      } else if (mode === 'redo') {
        setRedoStack((stack) => stack.slice(0, -1));
        setUndoStack((stack) => [...stack, previousVersion]);
      } else {
        setUndoStack((stack) => [...stack, previousVersion]);
        setRedoStack([]);
      }
      setMessage(text.success);
      void refreshVersions();
    } catch {
      setMessage(text.failed);
    } finally {
      setBusy(false);
    }
  }

  const sectionIndex = currentPage?.sections.findIndex((item) => item.id === sectionId) ?? -1;

  return (
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">
            <SparkIcon className="size-4" /> Phase 27
          </p>
          <h3 className="mt-2 text-xl font-semibold text-slate-950">{text.title}</h3>
          <p className="mt-2 text-xs text-slate-500">
            v{generation.version} · {generation.versionName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-40"
            disabled={busy || undoStack.length === 0}
            onClick={() => {
              const target = undoStack.at(-1);
              if (target !== undefined) void restoreVersion(target, 'undo');
            }}
            type="button"
          >
            ↶ {text.undo}
          </button>
          <button
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-40"
            disabled={busy || redoStack.length === 0}
            onClick={() => {
              const target = redoStack.at(-1);
              if (target !== undefined) void restoreVersion(target, 'redo');
            }}
            type="button"
          >
            ↷ {text.redo}
          </button>
        </div>
      </div>

      <label className="mt-5 block max-w-xl text-xs font-semibold text-slate-600">
        <span className="mb-1.5 block">{text.versionName}</span>
        <input
          className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-indigo-500"
          maxLength={80}
          onChange={(event) => setVersionName(event.target.value)}
          value={versionName}
        />
      </label>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <article className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 sm:p-5">
          <h4 className="text-sm font-semibold text-slate-950">{text.aiInstruction}</h4>
          <p className="mt-1 text-xs leading-5 text-slate-500">{text.aiHelp}</p>
          <div className="mt-4">
            <WebsiteModelDropdowns
              disabled={busy}
              locale={locale}
              modelOptions={modelOptions}
              onModelChange={setSelectedModel}
              onTierChange={setSelectedTier}
              selectedModel={selectedModel}
              selectedTier={selectedTier}
              tierOptions={tierOptions}
            />
          </div>
          <textarea
            aria-label={text.aiInstruction}
            className="mt-3 min-h-28 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm leading-6 outline-none focus:border-indigo-500"
            maxLength={1_000}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder={text.aiPlaceholder}
            value={instruction}
          />
          <button
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
            disabled={busy || instruction.trim().length < 10}
            onClick={() =>
              void createEdit({
                instruction,
                kind: 'natural-language',
                locale,
                model: selectedModel,
                tier: selectedTier,
                versionName,
              })
            }
            type="button"
          >
            <SparkIcon className="size-4" /> {text.aiApply}
          </button>
        </article>

        <article className="rounded-2xl border border-slate-200 p-4 sm:p-5">
          <h4 className="text-sm font-semibold text-slate-950">{text.direct}</h4>
          <p className="mt-1 text-xs leading-5 text-slate-500">{text.sectionHelp}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">
              <span className="mb-1.5 block">{text.page}</span>
              <select
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                onChange={(event) => {
                  const nextPage = generation.spec.pages.find(
                    (page) => page.slug === event.target.value,
                  );
                  setPageSlug(event.target.value);
                  setSectionId(nextPage?.sections[0]?.id ?? '');
                }}
                value={pageSlug}
              >
                {generation.spec.pages.map((page) => (
                  <option key={page.slug} value={page.slug}>
                    {page.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              <span className="mb-1.5 block">{text.section}</span>
              <select
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                onChange={(event) => setSectionId(event.target.value)}
                value={sectionId}
              >
                {currentPage?.sections.map((item, index) => (
                  <option key={item.id} value={item.id}>
                    {index + 1}. {item.type}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-40"
              disabled={busy || sectionIndex <= 0}
              onClick={() =>
                void createEdit({
                  edit: { direction: 'up', pageSlug, sectionId, type: 'move-section' },
                  kind: 'direct',
                  versionName,
                })
              }
              type="button"
            >
              ↑ {text.moveUp}
            </button>
            <button
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-40"
              disabled={
                busy ||
                currentPage === undefined ||
                sectionIndex < 0 ||
                sectionIndex >= currentPage.sections.length - 1
              }
              onClick={() =>
                void createEdit({
                  edit: { direction: 'down', pageSlug, sectionId, type: 'move-section' },
                  kind: 'direct',
                  versionName,
                })
              }
              type="button"
            >
              ↓ {text.moveDown}
            </button>
            <button
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-40"
              disabled={busy || section === undefined}
              onClick={() =>
                void createEdit({
                  edit: { pageSlug, sectionId, type: 'duplicate-section' },
                  kind: 'direct',
                  versionName,
                })
              }
              type="button"
            >
              + {text.duplicate}
            </button>
          </div>

          {fields.length > 0 ? (
            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-700">{text.sectionCopy}</p>
              <label className="mt-3 block text-xs font-semibold text-slate-600">
                <span className="mb-1.5 block">{text.copyField}</span>
                <select
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  onChange={(event) => setCopyField(event.target.value as EditableField)}
                  value={copyField}
                >
                  {fields.map((field) => (
                    <option key={field} value={field}>
                      {locale === 'en' ? editableLabels[field].en : editableLabels[field].zhHant}
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                aria-label={text.sectionCopy}
                className="mt-3 min-h-24 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm leading-6"
                maxLength={1_500}
                onChange={(event) => setCopyValue(event.target.value)}
                value={copyValue}
              />
              <button
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
                disabled={busy || copyValue.trim().length === 0}
                onClick={() =>
                  void createEdit({
                    edit: {
                      field: copyField,
                      pageSlug,
                      sectionId,
                      type: 'update-section-copy',
                      value: copyValue,
                    },
                    kind: 'direct',
                    versionName,
                  })
                }
                type="button"
              >
                <SaveIcon className="size-4" /> {text.sectionCopy}
              </button>
            </div>
          ) : null}
        </article>
      </div>

      <article className="mt-5 rounded-2xl border border-slate-200 p-4 sm:p-5">
        <h4 className="text-sm font-semibold text-slate-950">{text.theme}</h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {(
            [
              ['appearance', ['light', 'dark', 'system']],
              ['density', ['airy', 'balanced', 'compact']],
              [
                'palette',
                ['indigo-mint', 'graphite-amber', 'navy-cyan', 'forest-sand', 'violet-rose'],
              ],
              ['radius', ['soft', 'rounded', 'pill']],
              ['typography', ['modern-sans', 'editorial', 'technical', 'friendly']],
            ] as const
          ).map(([key, options]) => (
            <label className="text-xs font-semibold text-slate-600" key={key}>
              <span className="mb-1.5 block capitalize">{key}</span>
              <select
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs"
                onChange={(event) =>
                  setTheme((current) =>
                    WebsiteThemeSchema.parse({ ...current, [key]: event.target.value }),
                  )
                }
                value={theme[key]}
              >
                {options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <button
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
          disabled={busy}
          onClick={() =>
            void createEdit({
              edit: { patch: theme, type: 'update-theme' },
              kind: 'direct',
              versionName,
            })
          }
          type="button"
        >
          <SaveIcon className="size-4" /> {text.themeSave}
        </button>
      </article>

      {busy || message !== undefined ? (
        <p
          aria-live="polite"
          className={`mt-4 rounded-xl px-3 py-2.5 text-xs font-semibold ${
            message === text.success ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-800'
          }`}
        >
          {busy ? text.editing : message}
        </p>
      ) : null}

      <WebsitePreviewCanvas generation={generation} projectId={projectId} />

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <article className="rounded-2xl border border-slate-200 p-4 sm:p-5">
          <h4 className="text-sm font-semibold text-slate-950">{text.compare}</h4>
          <select
            className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
            onChange={(event) =>
              setCompareVersion(event.target.value === '' ? undefined : Number(event.target.value))
            }
            value={compareVersion ?? ''}
          >
            <option value="">{text.compareEmpty}</option>
            {versions
              .filter((version) => version.version !== generation.version)
              .map((version) => (
                <option key={version.version} value={version.version}>
                  v{version.version} · {version.versionName}
                </option>
              ))}
          </select>
          {comparison !== undefined ? (
            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
              {[
                [text.comparison.theme, comparison.changedThemeProperties.length],
                [text.comparison.changedPages, comparison.changedPages.length],
                [text.comparison.changedSections, comparison.changedSections],
                [text.comparison.movedSections, comparison.movedSections],
                [text.comparison.addedSections, comparison.addedSections],
                [text.comparison.removedSections, comparison.removedSections],
              ].map(([label, value]) => (
                <div className="rounded-xl bg-slate-50 p-3" key={label}>
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="mt-1 text-lg font-semibold text-slate-950">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </article>

        <article className="rounded-2xl border border-slate-200 p-4 sm:p-5">
          <h4 className="text-sm font-semibold text-slate-950">{text.history}</h4>
          <div className="mt-3 max-h-80 space-y-2 overflow-auto pr-1">
            {versions.map((version) => (
              <div
                className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${
                  version.version === generation.version
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-slate-200 bg-slate-50'
                }`}
                key={version.version}
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-950">
                    v{version.version} · {version.versionName}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {locale === 'en'
                      ? sourceLabels[version.source].en
                      : sourceLabels[version.source].zhHant}
                    {' · '}
                    {new Date(version.createdAt).toLocaleString(
                      locale === 'en' ? 'en-US' : 'zh-TW',
                    )}
                  </p>
                </div>
                {version.version === generation.version ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800">
                    <CheckIcon className="size-3.5" /> {text.current}
                  </span>
                ) : (
                  <button
                    className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[10px] font-semibold text-slate-700 disabled:opacity-40"
                    disabled={busy}
                    onClick={() => void restoreVersion(version.version, 'history')}
                    type="button"
                  >
                    {text.restore}
                  </button>
                )}
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
