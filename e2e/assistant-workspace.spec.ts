import { expect, test } from '@playwright/test';

test('streams and restores a tenant-scoped Ask conversation', async ({ page }) => {
  await page.goto('/dashboard/assistant');

  await expect(page.getByRole('heading', { name: '與 AI 對話、釐清並規劃工作' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'AI 工作台' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  const modelSelector = page.getByLabel('模型');
  await expect(modelSelector).toContainText('OpenAI');
  await expect(modelSelector).toContainText('Claude');
  await expect(modelSelector).toContainText('Gemini');
  await expect(modelSelector).toContainText('Mock Studio');
  await expect(page.getByRole('button', { name: '詢問' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('執行 · Phase 20')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('API 金鑰');
  await expect(page.locator('body')).not.toContainText('設定 AI Provider');

  const question = '如何安全設計每日訂單彙整流程？';
  await page.getByLabel('與 AI 對話、釐清並規劃工作').fill(question);
  await page.getByRole('button', { name: '送出' }).click();

  await expect(page.getByText(/我理解你的需求/)).toBeVisible();
  await expect(page.getByText('mock · mock-chat-v1 · completed')).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(question) })).toBeVisible();

  await page.reload();
  const savedConversation = page.getByRole('button', { name: new RegExp(question) });
  await expect(savedConversation).toBeVisible();
  await savedConversation.click();
  await expect(page.getByText(question, { exact: true })).toBeVisible();
  await expect(page.getByText(/我理解你的需求/)).toBeVisible();
});

test('persists a validated Plan conversation', async ({ page }) => {
  await page.goto('/dashboard/assistant');
  await page.getByRole('button', { name: '新增對話' }).click();
  await page.getByRole('button', { name: '規劃' }).click();

  await page
    .getByLabel('與 AI 對話、釐清並規劃工作')
    .fill('每天整理訂單資料夾裡的 Excel，依訂單編號去重，並建立一份新的彙整報表。');
  await page.getByRole('button', { name: '建立計畫' }).click();

  await expect(page.getByText('已建立通過驗證的計畫')).toBeVisible();
  await expect(page.getByRole('heading', { name: '每日訂單彙整' })).toBeVisible();
  await expect(page.getByText('4 個步驟')).toBeVisible();
  await expect(page.getByText('mock · mock-planner-v1 · completed')).toBeVisible();
  await expect(page.getByText('可串流，但沒有工具權限', { exact: true })).toBeVisible();
});
