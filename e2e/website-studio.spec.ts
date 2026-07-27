import { expect, test } from '@playwright/test';

test('collects every guided decision before creating a locked website draft', async ({ page }) => {
  await page.goto('/dashboard/sites');
  await expect(page.getByRole('heading', { name: '先把網站想清楚，再開始生成。' })).toBeVisible();
  await expect(page.getByRole('link', { name: '網站工作室' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.locator('body')).not.toContainText('API 金鑰');

  const projectName = `產品網站 ${Date.now()}`;
  await page.getByLabel('專案名稱').fill(projectName);
  await page.getByRole('button', { name: '建立專案', exact: true }).click();
  await expect(page.getByRole('heading', { name: projectName })).toBeVisible();
  await expect(page.getByRole('button', { name: '建立已驗證網站草稿' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '發布功能將於 Phase 28 開放' })).toBeDisabled();

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
  await expect(page.getByText('已建立通過驗證的網站草稿；發布功能仍維持鎖定。')).toBeVisible();
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
  expect(generatedPayload.generation.version).toBe(4);
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
