import { expect, test } from '@playwright/test';

test('creates, refines, previews, and explicitly publishes a website from one prompt', async ({
  page,
}) => {
  await page.goto('/dashboard/sites');
  await expect(page.getByRole('heading', { name: '說出你的網站，透過對話完成它。' })).toBeVisible();

  const description = `建立專業的雙語自動化顧問網站 ${Date.now()}，說明服務價值並引導訪客聯絡。`;
  await page.getByLabel('用幾句話描述想建立的網站').fill(description);
  await page.getByRole('button', { name: '讓 AI 開始追問' }).click();

  await expect(page.getByText(/AI 需求追問|需求已完整。你可以先檢查內容/).first()).toBeVisible();
  if (!(await page.getByText('需求已完整。你可以先檢查內容').isVisible())) {
    const questions = await page.locator('textarea').all();
    for (const question of questions) {
      if (await question.isVisible()) {
        await question.fill('需要建立專業網站、清楚介紹服務並取得詢問名單的台灣中小企業經營者。');
      }
    }
    await page.getByRole('button', { name: '送出全部回答' }).click();
  }
  await expect(
    page.getByText('需求已完整。你可以先檢查內容，或立即建立已驗證的 Canvas 預覽。'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '已準備建立 Canvas' })).toBeVisible();
  await expect(page.getByText('AI 需求摘要')).toBeVisible();

  await page.getByRole('button', { name: '建立 Canvas 預覽' }).click();
  await expect(page.getByRole('heading', { name: '網站預覽 Canvas' })).toBeVisible();
  const preview = page.frameLocator('[data-testid="website-preview-frame"]');
  await expect(preview.getByRole('heading', { name: '首頁' })).toBeVisible();

  await page.getByLabel('自然語言修改').fill('把首頁主標題改得更有行動力，但保留所有頁面。');
  await page.getByRole('button', { name: '套用已驗證 AI 修改' }).click();
  await expect(page.getByText(/v2/).first()).toBeVisible();

  await page.getByRole('button', { name: /檢查並發布/ }).click();
  await page.getByText('我已檢查此 Canvas，並同意公開這個確切版本。').click();
  await page.getByRole('button', { name: /發布版本 v2/ }).click();
  const publicLink = page.getByRole('link', { name: '開啟公開網站' });
  await expect(publicLink).toBeVisible();
  const publicPath = await publicLink.getAttribute('href');
  expect(publicPath).toMatch(
    /^(?:\/s\/[a-z0-9-]+|https:\/\/[a-z0-9-]+\.sites\.erin-aiworkflowstudio\.com)$/u,
  );
  const publicRequestPath = publicPath!.startsWith('/')
    ? publicPath!
    : `/s/${new URL(publicPath!).hostname.split('.')[0]}`;
  const publicResponse = await page.request.get(publicRequestPath);
  expect(publicResponse.ok()).toBe(true);
  expect(await publicResponse.text()).toContain('index,follow');

  await expect(page.getByRole('heading', { name: '這個網站要如何正式上線？' })).toBeVisible();
  await expect(page.getByRole('button', { name: /平台子網域（推薦）/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: /GitHub／自行部署/ }).click();
  await expect(page.getByRole('heading', { name: '將網站程式碼推送到你的 GitHub' })).toBeVisible();
  await expect(page.getByText('virtual-automation-team · Organization')).toBeVisible();
  await page.getByLabel('GitHub 儲存庫網址').fill('https://github.com/not-authorized/example');
  await expect(page.getByText(/此儲存庫尚未授權/)).toBeVisible();
  await page
    .getByLabel('GitHub 儲存庫網址')
    .fill('https://github.com/virtual-automation-team/operations-showcase');
  await expect(page.getByText(/此儲存庫已授權/)).toBeVisible();
  await page.getByLabel('不可變更的網站版本').selectOption('2');
  await page.getByText('我同意將這個確切網站版本寫入所選的儲存庫。').click();
  await page.getByRole('button', { name: '將確切版本推送到 GitHub' }).click();
  await expect(page.getByText(/網站程式碼已推送 · v2/)).toBeVisible();
  await expect(page.getByText('確定性來源 SHA-256')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI 部署引導' })).toBeVisible();
  await expect(page.getByLabel('部署服務')).toHaveValue('vercel');
  await expect(page.getByText(/ai-workflow-studio\//).last()).toBeVisible();
  await page.getByLabel('部署服務').selectOption('cloudflare-pages');
  await expect(page.getByRole('link', { name: /開啟 Cloudflare Pages/ })).toHaveAttribute(
    'href',
    /dash\.cloudflare\.com/,
  );
});

test('collects every guided decision before creating a locked website draft', async ({ page }) => {
  await page.goto('/dashboard/sites');
  await expect(page.getByRole('heading', { name: '說出你的網站，透過對話完成它。' })).toBeVisible();
  await expect(page.getByRole('link', { name: '網站工作室' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.locator('body')).not.toContainText('API 金鑰');

  const projectName = `產品網站 ${Date.now()}`;
  await page.getByText('進階手動建立').click();
  await page.getByLabel('專案名稱').fill(projectName);
  await page.getByRole('button', { name: '建立專案', exact: true }).click();
  await expect(page.getByRole('heading', { name: projectName })).toBeVisible();
  await page.getByText('進階六步驟需求設定').click();
  await expect(page.getByRole('button', { name: '建立已驗證網站草稿' })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: '建立 Canvas 版本後即可確認發布。' }),
  ).toBeDisabled();

  await page
    .getByLabel('這個網站最重要的目的為何？')
    .fill('建立專業產品網站，清楚說明安全自動化價值並取得合格註冊名單。');
  await page.getByRole('button', { name: '儲存並繼續' }).click();

  await page
    .getByLabel('這個網站最需要幫助誰？')
    .fill('需要整理 Excel 與 Google Sheets 的營運團隊、中小企業負責人與流程管理者。');
  await page.getByRole('button', { name: '儲存並繼續' }).click();

  await page.getByRole('button', { name: '新增頁面' }).click();
  await page.getByLabel('頁面名稱').fill('產品首頁');
  await page.getByLabel('網址代稱').fill('home');
  await page.getByLabel('頁面任務').fill('說明產品價值並引導訪客免費開始。');
  await page.getByRole('button', { name: '儲存並繼續' }).click();

  await page
    .getByLabel('品牌應該讓人感覺如何？')
    .fill('專業、清楚、可信任，以深藍與薄荷綠呈現安全且現代的科技感。');
  await page.getByRole('button', { name: '儲存並繼續' }).click();

  await page
    .getByLabel('目前有哪些內容、還需要哪些內容？')
    .fill('已有產品定位與方案費率，需要功能介紹、安全說明、客戶案例、常見問題與聯絡資訊。');
  await page.getByRole('button', { name: '儲存並繼續' }).click();

  await page.getByLabel('最重要的行動呼籲是什麼？').fill('免費開始\n預約產品導覽');
  await page.getByRole('button', { name: '儲存此步驟' }).click();

  await expect(page.getByText('六項必要決策已完整。')).toBeVisible();
  await page.getByRole('button', { name: '建立已驗證網站草稿' }).click();
  await expect(page.getByText('已建立通過驗證的網站草稿。')).toBeVisible();
  await expect(page.getByText('草稿已鎖定', { exact: true })).toBeVisible();
  await expect(page.getByText('需求草稿已鎖定；下方視覺編輯會建立可復原的新版本。')).toBeVisible();
  await expect(page.getByRole('heading', { name: '將需求轉成安全的網站結構' })).toBeVisible();
  await expect(page.getByLabel('模型')).toContainText('Mock Studio');
  await expect(page.getByLabel('效能等級')).toContainText('gpt-5.6-luna');
  await expect(page.getByLabel('效能等級')).toContainText('claude-haiku-4-5-20251001');
  await expect(page.getByLabel('效能等級')).toContainText('gemini-3.5-flash-lite');
  await expect(page.locator('body')).not.toContainText('mock-website-spec-v1');
  await page.getByRole('button', { name: '產生已驗證網站規格' }).click();
  await expect(page.getByText('網站規格已通過驗證')).toBeVisible();
  await expect(page.getByRole('heading', { name: '視覺編輯與版本' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '網站預覽 Canvas' })).toBeVisible();
  await expect(page.getByRole('button', { name: /桌機 1440 × 900/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const preview = page.frameLocator('[data-testid="website-preview-frame"]');
  await expect(preview.getByText(projectName, { exact: true }).first()).toBeVisible();
  await expect(preview.getByRole('heading', { name: '產品首頁' })).toBeVisible();
  await page.getByRole('button', { name: /平板 768 × 1024/ }).click();
  await expect(page.getByRole('button', { name: /平板 768 × 1024/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: /手機 390 × 844/ }).click();
  await expect(page.getByRole('button', { name: /手機 390 × 844/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('縮放').fill('50');
  await expect(page.getByText('50%')).toBeVisible();

  await page.getByLabel('版本名稱').fill('首頁標題更新');
  await page.getByLabel('屬性').selectOption('title');
  await page.getByLabel('區塊文案').fill('更清楚的安全網站工作流程');
  await page.getByRole('button', { name: '區塊文案' }).click();
  await expect(page.getByText('v2 · 首頁標題更新').first()).toBeVisible();
  await expect(preview.getByRole('heading', { name: '更清楚的安全網站工作流程' })).toBeVisible();
  await expect(page.getByRole('paragraph').filter({ hasText: 'v1 · 初始版本' })).toBeVisible();

  await page.getByRole('button', { name: /復原/ }).click();
  await expect(page.getByText('v3 · Undo to v1').first()).toBeVisible();
  await expect(preview.getByRole('heading', { name: '產品首頁' })).toBeVisible();
  await page.getByRole('button', { name: /重做/ }).click();
  await expect(page.getByText('v4 · Redo v2').first()).toBeVisible();
  await expect(preview.getByRole('heading', { name: '更清楚的安全網站工作流程' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'AI 網站圖片' })).toBeVisible();
  await expect(page.getByLabel('圖片模型供應商')).toContainText('gpt-image-2');
  await expect(page.getByLabel('圖片品質與成本等級')).toContainText('gemini-3.1-flash-lite-image');
  await page.getByLabel('版本名稱').fill('首頁 AI 主視覺');
  await page
    .getByLabel('圖片描述')
    .fill('專業的自動化工作空間，深海軍藍與薄荷綠點綴，柔和自然光，不含文字與浮水印。');
  await page.getByLabel('無障礙替代文字').fill('專業安全自動化工作空間');
  await page.getByRole('button', { name: '產生並套用圖片' }).click();
  await expect(page.getByText('v5 · 首頁 AI 主視覺').first()).toBeVisible({ timeout: 20_000 });
  await expect(preview.getByRole('img', { name: '專業安全自動化工作空間' })).toBeVisible();
  await expect(page.getByText(/mock · mock-image-v1/)).toBeVisible();

  const projectId = new URL(page.url()).pathname.split('/').at(-1);
  expect(projectId).toBeDefined();
  const response = await page.request.get(`/api/websites/${projectId!}`);
  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as {
    readonly project: {
      readonly completedSteps: number;
      readonly status: string;
    };
  };
  expect(payload.project).toMatchObject({ completedSteps: 6, status: 'draft' });

  const generatedAgain = await page.request.post(`/api/websites/${projectId!}/spec`, {
    data: { locale: 'zh-Hant', model: 'mock' },
  });
  expect(generatedAgain.status()).toBe(201);
  const generatedPayload = (await generatedAgain.json()) as {
    readonly generation: {
      readonly model?: string;
      readonly spec: {
        readonly pages: readonly {
          readonly sections: readonly { readonly type: string }[];
        }[];
        readonly schemaVersion: number;
      };
      readonly version: number;
    };
  };
  expect(generatedPayload.generation.model).toBeUndefined();
  expect(generatedPayload.generation.version).toBe(5);
  expect(generatedPayload.generation.spec.schemaVersion).toBe(1);
  expect(
    generatedPayload.generation.spec.pages.flatMap((generatedPage) =>
      generatedPage.sections.map((section) => section.type),
    ),
  ).toEqual(['hero', 'feature-grid', 'cta', 'footer']);

  const lockedUpdate = await page.request.patch(`/api/websites/${projectId!}`, {
    data: { purpose: 'This update must remain locked after draft creation.' },
  });
  expect(lockedUpdate.status()).toBe(409);
});
