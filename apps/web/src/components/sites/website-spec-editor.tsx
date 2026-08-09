'use client';

import {
  WebsiteGeneratedAssetSchema,
  type WebsitePublication,
  WebsiteSpecClientGenerationSchema,
  WebsiteThemeSchema,
  compareWebsiteSpecs,
  type WebsiteGenerationSelection,
  type WebsiteGeneratedAsset,
  type WebsiteImageProviderSelection,
  type WebsiteSection,
  type WebsiteSpecClientGeneration,
} from '@ai-workflow-studio/website-schema';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';

import { CheckIcon, SaveIcon, SparkIcon } from '@/components/icons';
import { useLanguage } from '@/components/language-provider';
import { WebsiteDeliveryPanel } from '@/components/sites/website-delivery-panel';
import { WebsiteIntegrationsPanel } from '@/components/sites/website-integrations-panel';
import { WebsiteModelDropdowns } from '@/components/sites/website-model-dropdowns';
import { WebsitePreviewCanvas } from '@/components/sites/website-preview-canvas';
import type { AiModelTierSelection, AiTierOption } from '@/lib/ai-model-selection';
import type { WebsiteGenerationModelOption } from '@/lib/website-generation-models';
import type { WebsiteGithubState } from '@/lib/website-github-schema';
import { websiteImageModelLabel } from '@/lib/website-image-models';

type WebsiteTheme = z.infer<typeof WebsiteThemeSchema>;
type EditableField = 'attribution' | 'body' | 'copyright' | 'eyebrow' | 'quote' | 'title';

const GenerationResponseSchema = z.object({
  generation: WebsiteSpecClientGenerationSchema,
});
const ImageGenerationResponseSchema = z.object({
  asset: WebsiteGeneratedAssetSchema,
  generation: WebsiteSpecClientGenerationSchema,
});
const AutoImagesResponseSchema = z.object({
  generated: z.number().int().min(0),
  generation: WebsiteSpecClientGenerationSchema.optional(),
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
  'asset-generation': { en: 'AI image', zhHant: 'AI 圖片' },
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
    exportHelp:
      'Download any exact version as a portable static ZIP with HTML, local assets, a manifest, and SHA-256 integrity metadata.',
    exportPaid: 'ZIP export is included with active paid subscriptions.',
    exportRequiresPaid: 'Paid plan required',
    exportZip: 'Export ZIP',
    failed: 'The edit could not be validated or saved.',
    history: 'Version history',
    imageAlt: 'Accessible alternative text',
    imageClaude:
      'Claude can refine the visual direction in the natural-language editor; actual pixels are rendered by OpenAI or Gemini.',
    autoFillImages: 'Auto-fill all product photos',
    autoFillingImages: 'Generating product photos…',
    imageGenerate: 'Generate and attach image',
    imageGenerating: 'Generating, validating, and storing a private image…',
    imageHelp:
      'Choose a hero, content, or testimonial section. The server generates one PNG, validates it, stores it privately, and creates a reversible version.',
    imageIncompatible:
      'Select a hero, content, testimonial, product, or gallery section to attach an image.',
    imageLast: 'Latest image',
    imageModel: 'Image provider',
    imagePrompt: 'Visual description',
    imagePromptPlaceholder:
      'A polished editorial workspace with soft natural light, deep navy and mint accents, no text or watermark.',
    imageTitle: 'AI website image',
    imageTier: 'Image quality and cost level',
    integrationsPaid:
      'Payment, contact, analytics, and external API implementation guidance requires an active paid subscription and a workspace owner or administrator.',
    integrationsTitle: 'Guided website integrations',
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
    exportHelp:
      '可將任一指定版本下載為靜態網站 ZIP，內含 HTML、本機素材、manifest 與 SHA-256 完整性資料。',
    exportPaid: 'ZIP 匯出包含在有效付費訂閱方案內。',
    exportRequiresPaid: '需付費方案',
    exportZip: '匯出 ZIP',
    failed: '修改未通過驗證，或目前無法儲存。',
    history: '版本紀錄',
    imageAlt: '無障礙替代文字',
    imageClaude: 'Claude 可在自然語言編輯器協助優化視覺方向；真正圖片由 OpenAI 或 Gemini 產生。',
    autoFillImages: '為所有商品自動配圖',
    autoFillingImages: '正在為商品產生照片…',
    imageGenerate: '產生並套用圖片',
    imageGenerating: '正在產生、驗證並私密儲存圖片…',
    imageHelp:
      '選擇 Hero、內容或推薦語區塊；伺服器會產生一張 PNG、驗證格式、私密儲存，並建立可還原版本。',
    imageIncompatible: '請選擇 Hero、內容、推薦語、商品或圖廊區塊，才能套用圖片。',
    imageLast: '最新圖片',
    imageModel: '圖片模型供應商',
    imagePrompt: '圖片描述',
    imagePromptPlaceholder:
      '具專業編輯風格的工作空間，柔和自然光、深海軍藍與薄荷綠點綴，不含文字與浮水印。',
    imageTitle: 'AI 網站圖片',
    imageTier: '圖片品質與成本等級',
    integrationsPaid:
      '付款、聯絡表單、網站分析與外部 API 實作引導，需有效付費訂閱並由工作區 Owner 或 Admin 管理。',
    integrationsTitle: '網站串接實作引導',
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
  canExportWebsite,
  canManageIntegrations,
  canPublishGithub,
  githubState,
  initialGeneration,
  initialPublication,
  initialVersions,
  modelOptions,
  projectId,
  suggestedSiteSlug,
  tierOptions,
}: Readonly<{
  canExportWebsite: boolean;
  canManageIntegrations: boolean;
  canPublishGithub: boolean;
  githubState: WebsiteGithubState;
  initialGeneration: WebsiteSpecClientGeneration;
  initialPublication: WebsitePublication | undefined;
  initialVersions: readonly WebsiteSpecClientGeneration[];
  modelOptions: readonly WebsiteGenerationModelOption[];
  projectId: string;
  suggestedSiteSlug: string;
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
  const [imageProvider, setImageProvider] = useState<WebsiteImageProviderSelection>('auto');
  const [imageTier, setImageTier] = useState<AiModelTierSelection>('auto');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [itemIndex, setItemIndex] = useState(0);
  const [lastAsset, setLastAsset] = useState<WebsiteGeneratedAsset>();
  const [versionName, setVersionName] = useState(`Version ${generation.version + 1}`);
  const [compareVersion, setCompareVersion] = useState<number>();
  const [undoStack, setUndoStack] = useState<number[]>([]);
  const [redoStack, setRedoStack] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
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

  async function generateImage(): Promise<void> {
    if (
      busy ||
      versionName.trim().length === 0 ||
      imagePrompt.trim().length < 10 ||
      imageAlt.trim().length === 0
    ) {
      return;
    }
    const itemSection =
      section?.type === 'product-grid' || section?.type === 'gallery' ? section : undefined;
    const targetItemIndex =
      itemSection === undefined
        ? undefined
        : Math.max(0, Math.min(itemIndex, itemSection.items.length - 1));
    setBusy(true);
    setImageBusy(true);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/websites/${projectId}/images`, {
        body: JSON.stringify({
          alt: imageAlt,
          ...(targetItemIndex === undefined ? {} : { itemIndex: targetItemIndex }),
          locale,
          pageSlug,
          prompt: imagePrompt,
          provider: imageProvider,
          sectionId,
          tier: imageTier,
          versionName,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error('image generation failed');
      const parsed = ImageGenerationResponseSchema.parse(body);
      setLastAsset(parsed.asset);
      acceptGeneration(parsed.generation, generation.version);
      setImagePrompt('');
    } catch {
      setMessage(text.failed);
    } finally {
      setImageBusy(false);
      setBusy(false);
    }
  }

  async function autoFillProductImages(): Promise<void> {
    if (busy || versionName.trim().length === 0) return;
    setBusy(true);
    setImageBusy(true);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/websites/${projectId}/images/auto`, {
        body: JSON.stringify({ locale, provider: imageProvider, tier: imageTier, versionName }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error('auto image generation failed');
      const parsed = AutoImagesResponseSchema.parse(body);
      if (parsed.generation !== undefined) {
        acceptGeneration(parsed.generation, generation.version);
      }
    } catch {
      setMessage(text.failed);
    } finally {
      setImageBusy(false);
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
  const itemImageOptions =
    section?.type === 'product-grid'
      ? section.items.map((item, index) => ({ index, label: item.name }))
      : section?.type === 'gallery'
        ? section.items.map((item, index) => ({
            index,
            label: item.caption ?? `#${index + 1}`,
          }))
        : [];
  const hasProductGrid =
    currentPage?.sections.some((item) => item.type === 'product-grid') ?? false;
  const isItemImageSection = section?.type === 'product-grid' || section?.type === 'gallery';
  const imageCompatible =
    section?.type === 'hero' ||
    section?.type === 'content' ||
    section?.type === 'testimonial' ||
    (isItemImageSection && itemImageOptions.length > 0);
  const selectedImageTier = imageTier === 'auto' ? undefined : imageTier;

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

      <article className="mt-5 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-600">
              Phase 28
            </p>
            <h4 className="mt-1 text-sm font-semibold text-slate-950">{text.imageTitle}</h4>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">{text.imageHelp}</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-[10px] font-semibold ${
              imageCompatible ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
            }`}
          >
            {section?.type ?? text.section}
          </span>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">
            <span className="mb-1.5 block">{text.imageModel}</span>
            <select
              aria-label={text.imageModel}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-900"
              disabled={busy}
              onChange={(event) =>
                setImageProvider(event.target.value as WebsiteImageProviderSelection)
              }
              value={imageProvider}
            >
              <option value="auto">Auto · Gemini → OpenAI</option>
              <option value="openai">OpenAI · gpt-image-2</option>
              <option value="gemini">Gemini · native image models</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            <span className="mb-1.5 block">{text.imageTier}</span>
            <select
              aria-label={text.imageTier}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-900"
              disabled={busy}
              onChange={(event) => setImageTier(event.target.value as AiModelTierSelection)}
              value={imageTier}
            >
              <option value="auto">
                {locale === 'en' ? 'Auto · budget aware' : '自動 · 依額度與成本選擇'}
              </option>
              {tierOptions.map((option) => (
                <option disabled={!option.enabled} key={option.id} value={option.id}>
                  {locale === 'en' ? option.label.en : option.label.zhHant}
                  {' · '}
                  {websiteImageModelLabel(option.id)}
                  {option.enabled
                    ? ''
                    : locale === 'en'
                      ? ' · locked by Store plan'
                      : ' · 需更高 Microsoft Store 方案'}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 rounded-xl border border-violet-100 bg-white/80 px-3 py-2.5 text-[11px] leading-5 text-slate-600">
          {selectedImageTier === undefined
            ? locale === 'en'
              ? 'Auto selects an allowed image model from remaining allowance and estimated cost.'
              : '自動模式會依剩餘額度、預估成本與方案權限選擇圖片模型。'
            : websiteImageModelLabel(selectedImageTier)}
        </div>

        {isItemImageSection ? (
          <label className="mt-3 block text-xs font-semibold text-slate-600">
            <span className="mb-1.5 block">
              {locale === 'en'
                ? section?.type === 'gallery'
                  ? 'Gallery item'
                  : 'Product'
                : section?.type === 'gallery'
                  ? '圖廊項目'
                  : '選擇商品'}
            </span>
            <select
              aria-label={locale === 'en' ? 'Item' : '選擇項目'}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-violet-500"
              disabled={busy}
              onChange={(event) => setItemIndex(Number(event.target.value))}
              value={Math.min(itemIndex, Math.max(0, itemImageOptions.length - 1))}
            >
              {itemImageOptions.map((option) => (
                <option key={option.index} value={option.index}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="mt-3 block text-xs font-semibold text-slate-600">
          <span className="mb-1.5 block">{text.imagePrompt}</span>
          <textarea
            aria-label={text.imagePrompt}
            className="min-h-24 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm leading-6 outline-none focus:border-violet-500"
            disabled={busy}
            maxLength={1_200}
            onChange={(event) => setImagePrompt(event.target.value)}
            placeholder={text.imagePromptPlaceholder}
            value={imagePrompt}
          />
        </label>
        <label className="mt-3 block text-xs font-semibold text-slate-600">
          <span className="mb-1.5 block">{text.imageAlt}</span>
          <input
            aria-label={text.imageAlt}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-violet-500"
            disabled={busy}
            maxLength={180}
            onChange={(event) => setImageAlt(event.target.value)}
            value={imageAlt}
          />
        </label>
        {!imageCompatible ? (
          <p className="mt-3 text-xs font-semibold text-amber-800">{text.imageIncompatible}</p>
        ) : null}
        <p className="mt-3 text-[11px] leading-5 text-slate-500">{text.imageClaude}</p>
        <button
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          disabled={
            busy ||
            !imageCompatible ||
            imagePrompt.trim().length < 10 ||
            imageAlt.trim().length === 0
          }
          onClick={() => void generateImage()}
          type="button"
        >
          <SparkIcon className="size-4" /> {imageBusy ? text.imageGenerating : text.imageGenerate}
        </button>
        {hasProductGrid ? (
          <button
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-300 bg-white px-4 py-3 text-sm font-semibold text-violet-700 disabled:opacity-40"
            disabled={busy}
            onClick={() => void autoFillProductImages()}
            type="button"
          >
            <SparkIcon className="size-4" />{' '}
            {imageBusy ? text.autoFillingImages : text.autoFillImages}
          </button>
        ) : null}
        {lastAsset !== undefined ? (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <p className="font-semibold">{text.imageLast}</p>
            <p className="mt-1 break-all font-mono text-[10px]">
              {lastAsset.provider} · {lastAsset.model} · {lastAsset.width}×{lastAsset.height} ·{' '}
              {Math.ceil(lastAsset.byteSize / 1_024)} KB
            </p>
          </div>
        ) : null}
      </article>

      {busy || message !== undefined ? (
        <p
          aria-live="polite"
          className={`mt-4 rounded-xl px-3 py-2.5 text-xs font-semibold ${
            message === text.success ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-800'
          }`}
        >
          {busy ? (imageBusy ? text.imageGenerating : text.editing) : message}
        </p>
      ) : null}

      <WebsitePreviewCanvas generation={generation} projectId={projectId} />
      <WebsiteDeliveryPanel
        canPublishGithub={canPublishGithub}
        generation={generation}
        githubState={githubState}
        initialPublication={initialPublication}
        projectId={projectId}
        suggestedSiteSlug={suggestedSiteSlug}
        versions={versions}
      />
      {canManageIntegrations ? (
        <WebsiteIntegrationsPanel projectId={projectId} />
      ) : (
        <section className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <h3 className="text-base font-semibold text-slate-950">{text.integrationsTitle}</h3>
          <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-600">{text.integrationsPaid}</p>
        </section>
      )}

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
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            {canExportWebsite ? text.exportHelp : text.exportPaid}
          </p>
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
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {canExportWebsite ? (
                    <a
                      className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[10px] font-semibold text-indigo-700"
                      download
                      href={`/api/websites/${projectId}/versions/${version.version}/export`}
                    >
                      ↓ {text.exportZip}
                    </a>
                  ) : (
                    <span className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-[10px] font-semibold text-slate-500">
                      {text.exportRequiresPaid}
                    </span>
                  )}
                  {version.version === generation.version ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800">
                      <CheckIcon className="size-3.5" /> {text.current}
                    </span>
                  ) : (
                    <button
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[10px] font-semibold text-slate-700 disabled:opacity-40"
                      disabled={busy}
                      onClick={() => void restoreVersion(version.version, 'history')}
                      type="button"
                    >
                      {text.restore}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
