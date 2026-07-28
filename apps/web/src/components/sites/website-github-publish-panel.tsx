'use client';

import type { WebsiteSpecClientGeneration } from '@ai-workflow-studio/website-schema';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';

import { CheckIcon, ShieldIcon } from '@/components/icons';
import { useLanguage } from '@/components/language-provider';
import { WebsiteDeploymentGuidePanel } from '@/components/sites/website-deployment-guide-panel';
import {
  WebsiteGithubPublicationSchema,
  WebsiteGithubRepositoryUrlSchema,
  WebsiteGithubRepositorySchema,
  githubBranchForSiteSlug,
  type WebsiteGithubPublication,
  type WebsiteGithubState,
} from '@/lib/website-github-schema';

const RepositoriesResponseSchema = z
  .object({ repositories: z.array(WebsiteGithubRepositorySchema) })
  .strict();
const PublicationResponseSchema = z
  .object({ publication: WebsiteGithubPublicationSchema })
  .strict();

const copy = {
  en: {
    account: 'Connected GitHub App',
    branch: 'Managed branch',
    branchHelp: 'AI Workflow Studio writes only to this isolated branch. It never overwrites main.',
    confirm: 'I approve writing this exact website version to the selected repository.',
    connect: 'Connect GitHub App',
    disconnected: 'GitHub App disconnected from this workspace.',
    disconnect: 'Disconnect',
    failed: 'GitHub could not publish this version. No other branch was changed.',
    installHelp:
      'Install the least-privilege GitHub App on only the repositories you choose. Personal access tokens are never accepted.',
    locked:
      'GitHub source publishing is available to paid plans and workspace owners or administrators.',
    notConfigured: 'GitHub App publishing is not configured by the platform administrator yet.',
    published: 'Website source published',
    publish: 'Publish exact version to GitHub',
    publishing: 'Publishing safely…',
    repository: 'GitHub repository URL',
    repositoryAuthorized: 'This repository is authorized for the connected GitHub App.',
    repositoryEmpty: 'No allowed repositories were returned by this installation.',
    repositoryLoading: 'Loading allowed repositories…',
    repositoryPlaceholder: 'https://github.com/owner/repository',
    repositoryUnauthorized:
      'This repository is not authorized. Add it to the GitHub App installation, then try again.',
    repositoryUrlHelp:
      'Paste the repository URL. The platform matches it against repositories explicitly authorized to the GitHub App.',
    repositoryUrlInvalid: 'Enter an HTTPS URL in the form https://github.com/owner/repository.',
    reviewAuthorization: 'Review GitHub App repository access',
    source: 'Deterministic source SHA-256',
    title: 'Publish website source to your GitHub',
    version: 'Immutable website version',
    warning:
      'Only validated static HTML, local images, manifest, and integrity metadata are pushed. Prompts, credentials, account data, and server code are excluded.',
  },
  'zh-Hant': {
    account: '已連接 GitHub App',
    branch: '平台管理分支',
    branchHelp: 'AI Workflow Studio 只會寫入這個隔離分支，絕不覆蓋 main。',
    confirm: '我同意將這個確切網站版本寫入所選的儲存庫。',
    connect: '連接 GitHub App',
    disconnected: '已中斷此工作區的 GitHub App 連線。',
    disconnect: '中斷連線',
    failed: 'GitHub 無法發布此版本；其他分支沒有被更動。',
    installHelp: '只在你選擇的儲存庫安裝最小權限 GitHub App；平台不接受也不儲存個人存取 Token。',
    locked: 'GitHub 程式碼推送只開放付費方案，且必須由工作區擁有者或管理員操作。',
    notConfigured: '平台管理者尚未完成 GitHub App 發布設定。',
    published: '網站程式碼已推送',
    publish: '將確切版本推送到 GitHub',
    publishing: '正在安全推送…',
    repository: 'GitHub 儲存庫網址',
    repositoryAuthorized: '此儲存庫已授權給目前連接的 GitHub App。',
    repositoryEmpty: '此 GitHub App 安裝沒有回傳可用儲存庫。',
    repositoryLoading: '正在讀取已授權儲存庫…',
    repositoryPlaceholder: 'https://github.com/擁有者/儲存庫',
    repositoryUnauthorized: '此儲存庫尚未授權；請加入 GitHub App 安裝範圍後再試一次。',
    repositoryUrlHelp: '請貼上儲存庫網址；平台只會比對已明確授權給 GitHub App 的儲存庫。',
    repositoryUrlInvalid: '請輸入 https://github.com/擁有者/儲存庫 格式的 HTTPS 網址。',
    reviewAuthorization: '檢查 GitHub App 儲存庫權限',
    source: '確定性來源 SHA-256',
    title: '將網站程式碼推送到你的 GitHub',
    version: '不可變更的網站版本',
    warning:
      '只會推送已驗證靜態 HTML、本機圖片、manifest 與完整性資料；需求對話、憑證、帳戶資料及伺服器程式都不會加入。',
  },
} as const;

function branchSuffix(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 63)
    .replaceAll(/-+$/g, '');
}

export function WebsiteGithubPublishPanel({
  canPublish,
  initialState,
  projectId,
  suggestedSiteSlug,
  versions,
}: Readonly<{
  canPublish: boolean;
  initialState: WebsiteGithubState;
  projectId: string;
  suggestedSiteSlug: string;
  versions: readonly WebsiteSpecClientGeneration[];
}>) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const [state, setState] = useState(initialState);
  const [repositories, setRepositories] = useState<z.infer<typeof WebsiteGithubRepositorySchema>[]>(
    [],
  );
  const [loadingRepositories, setLoadingRepositories] = useState(false);
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [version, setVersion] = useState(versions[0]?.version ?? 1);
  const [suffix, setSuffix] = useState(() =>
    githubBranchForSiteSlug(suggestedSiteSlug).replace('ai-workflow-studio/', ''),
  );
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [publication, setPublication] = useState<WebsiteGithubPublication>();
  const branch = `ai-workflow-studio/${suffix}`;
  const parsedRepositoryUrl = WebsiteGithubRepositoryUrlSchema.safeParse(repositoryUrl);
  const selectedRepository = parsedRepositoryUrl.success
    ? repositories.find(
        (repository) =>
          repository.fullName.toLowerCase() === parsedRepositoryUrl.data.fullName.toLowerCase(),
      )
    : undefined;
  const repositoryId = selectedRepository?.id ?? '';
  const sortedVersions = useMemo(
    () => [...versions].sort((left, right) => right.version - left.version),
    [versions],
  );

  useEffect(() => {
    const latestVersion = sortedVersions[0]?.version;
    if (latestVersion !== undefined) {
      setVersion(latestVersion);
    }
  }, [sortedVersions]);

  useEffect(() => {
    if (!canPublish || state.connection === undefined) return;
    let active = true;
    setLoadingRepositories(true);
    void fetch('/api/integrations/github/repositories', { cache: 'no-store' })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error('repositories unavailable');
        return RepositoriesResponseSchema.parse(payload).repositories;
      })
      .then((items) => {
        if (!active) return;
        setRepositories(items);
      })
      .catch(() => {
        if (active) setMessage(text.failed);
      })
      .finally(() => {
        if (active) setLoadingRepositories(false);
      });
    return () => {
      active = false;
    };
  }, [canPublish, state.connection, text.failed]);

  async function publish(): Promise<void> {
    if (
      busy ||
      !confirmed ||
      repositoryId === '' ||
      suffix.length < 3 ||
      state.connection === undefined
    ) {
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/websites/${projectId}/github`, {
        body: JSON.stringify({
          branch,
          confirmed: true,
          idempotencyKey: crypto.randomUUID(),
          repositoryId,
          version,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error('publish failed');
      setPublication(PublicationResponseSchema.parse(payload).publication);
      setConfirmed(false);
    } catch {
      setMessage(text.failed);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(): Promise<void> {
    if (busy || !window.confirm(text.disconnect)) return;
    setBusy(true);
    try {
      const response = await fetch('/api/integrations/github/status', { method: 'DELETE' });
      if (!response.ok) throw new Error('disconnect failed');
      setState({ configured: state.configured });
      setRepositories([]);
      setRepositoryUrl('');
      setMessage(text.disconnected);
    } catch {
      setMessage(text.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-950 p-5 text-white sm:p-6">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-violet-300">
        <ShieldIcon className="size-4" />
        Phase 38
      </p>
      <h3 className="mt-2 text-lg font-semibold">{text.title}</h3>
      <p className="mt-2 max-w-4xl text-xs leading-6 text-slate-300">{text.warning}</p>

      {!canPublish ? (
        <p className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm font-medium text-amber-100">
          {text.locked}
        </p>
      ) : !state.configured ? (
        <p className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm font-medium text-amber-100">
          {text.notConfigured}
        </p>
      ) : state.connection === undefined ? (
        <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-900 p-4">
          <p className="text-xs leading-6 text-slate-300">{text.installHelp}</p>
          <a
            className="mt-4 inline-flex rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950"
            href={`/api/integrations/github/install?projectId=${encodeURIComponent(projectId)}`}
          >
            {text.connect}
          </a>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  {text.account}
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {state.connection.account.login} · {state.connection.account.type}
                </p>
              </div>
              <button
                className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200"
                disabled={busy}
                onClick={() => void disconnect()}
                type="button"
              >
                {text.disconnect}
              </button>
            </div>
          </div>
          <label className="text-xs font-semibold text-slate-200">
            <span className="mb-2 block">{text.version}</span>
            <select
              className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-3 text-sm text-white"
              disabled={busy}
              onChange={(event) => setVersion(Number(event.target.value))}
              value={version}
            >
              {sortedVersions.map((item) => (
                <option key={item.version} value={item.version}>
                  v{item.version} · {item.versionName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-200">
            <span className="mb-2 block">{text.repository}</span>
            <input
              aria-label={text.repository}
              autoCapitalize="none"
              autoComplete="off"
              className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-3 text-sm text-white"
              disabled={busy || loadingRepositories || repositories.length === 0}
              onChange={(event) => setRepositoryUrl(event.target.value)}
              placeholder={text.repositoryPlaceholder}
              spellCheck={false}
              type="url"
              value={repositoryUrl}
            />
            <span className="mt-2 block font-normal leading-5 text-slate-400">
              {loadingRepositories
                ? text.repositoryLoading
                : repositories.length === 0
                  ? text.repositoryEmpty
                  : text.repositoryUrlHelp}
            </span>
            {repositoryUrl.trim().length > 0 ? (
              <span
                className={`mt-2 block font-semibold leading-5 ${
                  selectedRepository !== undefined ? 'text-emerald-300' : 'text-amber-200'
                }`}
              >
                {!parsedRepositoryUrl.success
                  ? text.repositoryUrlInvalid
                  : selectedRepository === undefined
                    ? text.repositoryUnauthorized
                    : `${text.repositoryAuthorized} ${selectedRepository.fullName} · ${
                        selectedRepository.private ? 'private' : 'public'
                      }`}
              </span>
            ) : null}
            {parsedRepositoryUrl.success && selectedRepository === undefined ? (
              <a
                className="mt-2 inline-flex text-xs font-semibold text-violet-200 underline"
                href="https://github.com/settings/installations"
                rel="noreferrer"
                target="_blank"
              >
                {text.reviewAuthorization} ↗
              </a>
            ) : null}
          </label>
          <label className="text-xs font-semibold text-slate-200 lg:col-span-2">
            <span className="mb-2 block">{text.branch}</span>
            <div className="flex overflow-hidden rounded-xl border border-slate-600 bg-slate-900">
              <span className="border-r border-slate-700 px-3 py-3 font-mono text-xs text-slate-400">
                ai-workflow-studio/
              </span>
              <input
                className="min-w-0 flex-1 bg-transparent px-3 py-3 font-mono text-xs text-white outline-none"
                disabled={busy}
                maxLength={63}
                onChange={(event) => setSuffix(branchSuffix(event.target.value))}
                value={suffix}
              />
            </div>
            <span className="mt-2 block font-normal leading-5 text-slate-400">
              {text.branchHelp}
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-2xl border border-violet-400/30 bg-violet-400/10 p-4 text-xs font-medium leading-5 text-violet-100 lg:col-span-2">
            <input
              checked={confirmed}
              className="mt-1 size-4"
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
              type="checkbox"
            />
            {text.confirm}
          </label>
          <button
            className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-40 lg:col-span-2"
            disabled={
              busy ||
              !confirmed ||
              repositoryId === '' ||
              suffix.length < 3 ||
              sortedVersions.length === 0
            }
            onClick={() => void publish()}
            type="button"
          >
            {busy ? text.publishing : text.publish}
          </button>
        </div>
      )}

      {publication !== undefined ? (
        <>
          <div className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
              <CheckIcon className="size-4" /> {text.published} · v{publication.version}
            </p>
            <a
              className="mt-2 block break-all text-xs font-semibold text-violet-200 underline"
              href={publication.commitUrl}
              rel="noreferrer"
              target="_blank"
            >
              {publication.repositoryFullName} · {publication.branch} ·{' '}
              {publication.commitSha.slice(0, 10)}
            </a>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              {text.source}
            </p>
            <p className="mt-1 break-all font-mono text-[10px] text-slate-300">
              {publication.sourceSha256}
            </p>
          </div>
          <WebsiteDeploymentGuidePanel publication={publication} />
        </>
      ) : null}

      {message !== undefined ? (
        <p className="mt-4 rounded-xl bg-white/10 px-3 py-2.5 text-xs font-semibold">{message}</p>
      ) : null}
    </section>
  );
}
