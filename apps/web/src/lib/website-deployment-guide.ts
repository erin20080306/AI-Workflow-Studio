import { z } from 'zod';

import type { WebsiteGithubPublication } from '@/lib/website-github-schema';

export const WebsiteDeploymentProviderSchema = z.enum([
  'cloudflare-pages',
  'github-pages',
  'vercel',
]);

export type WebsiteDeploymentProvider = z.infer<typeof WebsiteDeploymentProviderSchema>;

export type WebsiteDeploymentGuide = Readonly<{
  actionLabel: string;
  actionUrl: string;
  note: string;
  providerLabel: string;
  steps: readonly string[];
}>;

export function websiteDeploymentGuide(
  provider: WebsiteDeploymentProvider,
  publication: WebsiteGithubPublication,
  locale: 'en' | 'zh-Hant',
): WebsiteDeploymentGuide {
  const repositoryUrl = `https://github.com/${publication.repositoryFullName}`;
  const branch = publication.branch;
  const isEnglish = locale === 'en';

  switch (provider) {
    case 'vercel':
      return {
        actionLabel: isEnglish ? 'Open Vercel import' : '開啟 Vercel 匯入',
        actionUrl: 'https://vercel.com/new',
        note: isEnglish
          ? 'No API key or environment variable is required for this validated static export.'
          : '這份已驗證靜態網站不需要 API Key 或環境變數。',
        providerLabel: 'Vercel',
        steps: isEnglish
          ? [
              `Import ${repositoryUrl} from GitHub.`,
              `Select the production branch "${branch}".`,
              'Use Other as the framework, leave the build command empty, and use "." as the output directory.',
              'Review the preview URL, then confirm the production deployment.',
            ]
          : [
              `從 GitHub 匯入 ${repositoryUrl}。`,
              `將 Production Branch 設為「${branch}」。`,
              'Framework 選 Other、Build Command 留空、Output Directory 填入「.」。',
              '先檢查預覽網址，再確認正式部署。',
            ],
      };
    case 'cloudflare-pages':
      return {
        actionLabel: isEnglish ? 'Open Cloudflare Pages' : '開啟 Cloudflare Pages',
        actionUrl: 'https://dash.cloudflare.com/?to=/:account/workers-and-pages/create/pages',
        note: isEnglish
          ? 'Connect through Cloudflare Git integration. Do not paste a GitHub token into this platform.'
          : '請使用 Cloudflare 的 Git 整合授權，不要把 GitHub Token 貼到本平台。',
        providerLabel: 'Cloudflare Pages',
        steps: isEnglish
          ? [
              'Choose Connect to Git and authorize only the intended repository.',
              `Select ${publication.repositoryFullName} and branch "${branch}".`,
              'Use no framework preset, leave the build command empty, and use "." as the output directory.',
              'Deploy, open every generated page, and keep the assigned Pages URL.',
            ]
          : [
              '選擇 Connect to Git，並只授權預定的儲存庫。',
              `選擇 ${publication.repositoryFullName} 與分支「${branch}」。`,
              'Framework 不選、Build Command 留空、Output Directory 填入「.」。',
              '完成部署後逐頁開啟確認，並保留系統配發的 Pages 網址。',
            ],
      };
    case 'github-pages':
      return {
        actionLabel: isEnglish ? 'Open repository Pages settings' : '開啟儲存庫 Pages 設定',
        actionUrl: `${repositoryUrl}/settings/pages`,
        note: isEnglish
          ? 'GitHub Pages availability for private repositories depends on the customer’s GitHub plan.'
          : '私人儲存庫是否能使用 GitHub Pages，取決於客戶自己的 GitHub 方案。',
        providerLabel: 'GitHub Pages',
        steps: isEnglish
          ? [
              'Under Build and deployment, choose Deploy from a branch.',
              `Select branch "${branch}" and folder "/ (root)".`,
              'Save, wait for the Pages workflow to complete, then open the generated URL.',
              'Verify every page and navigation link before sharing it.',
            ]
          : [
              '在 Build and deployment 選擇 Deploy from a branch。',
              `選擇分支「${branch}」與資料夾「/ (root)」。`,
              '儲存後等待 Pages 工作完成，再開啟系統產生的網址。',
              '逐頁確認內容與導覽連結後再對外分享。',
            ],
      };
  }
}
