import { expect, test } from '@playwright/test';

test('creates, reviews, and dry-runs a safe Mock Workflow', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: '用一句話，讓工作流理解你的需求。' }),
  ).toBeVisible();
  await page.getByRole('button', { exact: true, name: 'EN' }).click();
  await expect(
    page.getByRole('heading', { name: 'Workflows that understand your words.' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Workflows that understand your words.' }),
  ).toBeVisible();
  await page.getByRole('button', { exact: true, name: '中文' }).click();

  await page.goto('/login');
  await page.getByLabel('電子郵件').fill('erin@example.test');
  await page.getByLabel('密碼').fill('safe-mock-password');
  await page.getByRole('button', { name: '進入 Mock 控制台' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/devices');
  await expect(page.getByRole('heading', { exact: true, name: '裝置' })).toBeVisible();
  await page.getByLabel('裝置名稱').fill('E2E Desktop Agent');
  await page.getByRole('button', { name: '產生配對碼' }).click();
  await expect(page.getByText('配對碼已建立')).toBeVisible();
  await expect(page.getByText(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/)).toBeVisible();

  await page.goto('/dashboard');
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
  await expect(page.getByText('API 金鑰永遠不送到瀏覽器')).toBeVisible();
  await page.getByRole('button', { name: '儲存 Mock 設定' }).click();
  await expect(page.getByText('Mock 偏好已更新；未寫入任何金鑰。')).toBeVisible();

  await page.goto('/dashboard/settings/connections');
  await expect(page.getByRole('heading', { name: '外部服務連線' })).toBeVisible();
  await expect(page.getByText('營運報表（Mock）')).toBeVisible();
  await expect(page.getByText('Server OAuth 尚未設定')).toBeVisible();
  await page.getByRole('button', { name: '健康檢查' }).click();
  await expect(page.getByText('Google Sheets 連線正常，試算表清單已更新。')).toBeVisible();
  await expect(page.getByText('每日訂單彙整')).toBeVisible();
  await expect(page.getByText('營運追蹤')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('refresh-token-fixture');
  await expect(page.locator('body')).not.toContainText('access-token-fixture');

  const runStart = await page.request.post('/api/runs', {
    data: {
      deviceId: '00000000-0000-4000-8000-000000000501',
      idempotencyKey: 'browser-run-approval-e2e',
      requiresApproval: true,
      timeoutSeconds: 300,
    },
  });
  expect(runStart.ok()).toBe(true);
  const runPayload = (await runStart.json()) as {
    readonly run: { readonly id: string };
  };
  await page.goto(`/dashboard/runs/${runPayload.run.id}`);
  await expect(page.getByRole('heading', { name: '執行詳情' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '需要執行核准' })).toBeVisible();
  await page.getByRole('button', { name: '核准並派送' }).click();
  await expect(page.getByText('佇列中', { exact: true })).toBeVisible();
  await expect(page.getByText('approval.approved', { exact: true })).toBeVisible();
  await expect(page.getByText('agent_job.queued', { exact: true })).toBeVisible();
});
