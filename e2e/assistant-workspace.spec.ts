import { expect, test } from '@playwright/test';

test('creates a validated plan in the multi-model AI workspace', async ({ page }) => {
  await page.goto('/dashboard/assistant');

  await expect(page.getByRole('heading', { name: '用自然語言規劃自動化' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'AI 工作台' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  const modelSelector = page.getByLabel('模型');
  await expect(modelSelector).toContainText('OpenAI');
  await expect(modelSelector).toContainText('Claude');
  await expect(modelSelector).toContainText('Gemini');
  await expect(modelSelector).toContainText('Mock Studio');
  await expect(page.getByText('詢問 · Phase 18')).toBeVisible();
  await expect(page.getByText('執行 · Phase 20')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('API 金鑰');
  await expect(page.locator('body')).not.toContainText('設定 AI Provider');

  await page
    .getByLabel('用自然語言規劃自動化')
    .fill('每天整理訂單資料夾裡的 Excel，依訂單編號去重，並建立一份新的彙整報表。');
  await page.getByRole('button', { name: '建立計畫' }).click();

  await expect(page.getByText('已建立通過驗證的計畫')).toBeVisible();
  await expect(page.getByRole('heading', { name: '每日訂單彙整' })).toBeVisible();
  await expect(page.getByText('4 個步驟')).toBeVisible();
  await expect(page.getByText('mock · mock-planner-v1')).toBeVisible();
  await expect(page.getByText('規劃模式不能執行工具', { exact: true })).toBeVisible();
});
