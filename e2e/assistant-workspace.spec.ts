import { expect, test } from '@playwright/test';

test('streams and restores a tenant-scoped Ask conversation', async ({ page }) => {
  await page.goto('/dashboard/assistant');

  await expect(page.getByRole('heading', { name: '與 AI 對話、釐清並規劃工作' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'AI 工作台' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  const modelSelector = page.getByLabel('模型');
  await expect(modelSelector).toContainText('Auto');
  await expect(modelSelector).toContainText('OpenAI');
  await expect(modelSelector).toContainText('Claude');
  await expect(modelSelector).toContainText('Gemini');
  await expect(modelSelector).toContainText('Mock Studio');
  await expect(page.locator('body')).not.toContainText('mock-chat-v1');
  await expect(page.locator('body')).not.toContainText('mock-planner-v1');
  await expect(page.getByRole('button', { name: '詢問' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('執行 · 檢視執行')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('API 金鑰');
  await expect(page.locator('body')).not.toContainText('設定 AI Provider');

  const question = '如何安全設計每日訂單彙整流程？';
  await page.getByLabel('與 AI 對話、釐清並規劃工作').fill(question);
  await page.getByRole('button', { name: '送出' }).click();

  await expect(page.getByText(/我理解你的需求/)).toBeVisible();
  await expect(page.locator('body')).not.toContainText('mock · mock-chat-v1 · completed');
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
  await expect(page.locator('body')).not.toContainText('mock · mock-planner-v1 · completed');
  await expect(page.getByText('審閱、要求、核准三段式', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '建立審閱草稿', exact: true }).click();
  await expect(page.getByText('已審閱的 Workflow v1 草稿')).toBeVisible();
  await expect(page.getByText(/sha256:[a-f0-9]{16}/)).toBeVisible();

  await page.getByRole('button', { name: '建立執行要求', exact: true }).click();
  await expect(page.getByText('等待核准後才會派送至 Desktop Agent')).toBeVisible();
  await page.getByRole('link', { name: '開啟執行詳情' }).click();

  await expect(page.getByRole('heading', { name: '執行詳情' })).toBeVisible();
  await expect(page.getByText('等待核准', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '核准並派送' }).click();
  await expect(page.getByText('approval.approved', { exact: true })).toBeVisible();
  await expect(page.getByText('agent_job.queued', { exact: true })).toBeVisible();
});

test('uses an explicit source and creates an auditable Markdown artifact', async ({ page }) => {
  await page.goto('/dashboard/assistant');
  await page.getByRole('button', { name: '新增對話' }).click();

  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from('Order ID,Amount\nA-100,1200\nA-101,800\n'.padEnd(70_000, 'x'), 'utf8'),
    mimeType: 'text/csv',
    name: 'orders.csv',
  });

  const sourceChip = page.getByRole('button', { name: '[S1] orders.csv' });
  await expect(sourceChip).toBeVisible();
  await expect(sourceChip).toHaveAttribute('aria-pressed', 'true');

  await page.getByLabel('與 AI 對話、釐清並規劃工作').fill('請摘要選取的訂單來源');
  await page.getByRole('button', { name: '送出' }).click();

  await expect(page.getByText(/\[S1\] orders\.csv/).first()).toBeVisible();
  await page.getByRole('button', { name: '建立 Markdown' }).click();
  await expect(page.getByText('已建立 Markdown 產出')).toBeVisible();
  await expect(page.getByRole('link', { name: /來源工作區.*\.md/ })).toHaveAttribute(
    'href',
    /\/api\/ai\/artifacts\//,
  );
});
