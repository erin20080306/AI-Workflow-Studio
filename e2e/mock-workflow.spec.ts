import { expect, test } from '@playwright/test';

test('creates, reviews, and dry-runs a safe Mock Workflow', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('電子郵件').fill('erin@example.test');
  await page.getByLabel('密碼').fill('safe-mock-password');
  await page.getByRole('button', { name: '進入 Mock 控制台' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('link', { name: '建立工作流' }).click();
  await expect(page.getByRole('heading', { name: '描述你想自動化的工作' })).toBeVisible();
  await expect(page.getByText('Erin’s MacBook Air')).toBeVisible();
  await expect(page.getByText('訂單匯入資料夾')).toBeVisible();

  await page
    .getByLabel('自然語言需求')
    .fill('每天整理訂單資料夾裡的 Excel，依訂單編號去重，並建立一份新的彙整報表。');
  await page.getByRole('button', { name: '產生安全預覽' }).click();

  await expect(page.getByText('安全檢查通過')).toBeVisible();
  await expect(page.getByText('4 個節點')).toBeVisible();
  await page.getByRole('button', { name: /建立 Excel 報表/ }).click();
  await expect(page.getByRole('heading', { name: '建立 Excel 報表' })).toBeVisible();
  await expect(page.getByText('首次執行需核准')).toBeVisible();

  await page.getByRole('button', { name: '執行 Dry Run' }).click();
  await expect(page.getByText('Dry Run 完成')).toBeVisible();
  await expect(page.getByText('4 / 4 個步驟已規劃')).toBeVisible();

  await page.getByRole('button', { name: '儲存草稿' }).click();
  await expect(page.getByText('草稿已儲存於 Mock 工作區')).toBeVisible();

  await page.goto('/dashboard/settings/ai-models');
  await expect(page.getByRole('heading', { name: 'AI 模型與 Provider' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mock Planner' })).toBeVisible();
  await expect(page.getByText('gpt-5.6-sol')).toBeVisible();
  await expect(page.getByText('API keys 永遠不送到瀏覽器')).toBeVisible();
  await page.getByRole('button', { name: '儲存 Mock 設定' }).click();
  await expect(page.getByText('Mock 偏好已更新；未寫入任何金鑰。')).toBeVisible();
});
