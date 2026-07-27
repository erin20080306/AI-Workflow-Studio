import { expect, test } from '@playwright/test';

test('shows tenant allowances without exposing provider or Store credentials', async ({ page }) => {
  await page.goto('/dashboard/usage');

  await expect(page.getByRole('heading', { level: 1, name: '用量與額度' })).toBeVisible();
  await expect(page.getByRole('link', { name: '用量額度' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByText('目前用量在每月安全額度內。')).toBeVisible();
  await expect(page.getByText('本期共 10.0 GB')).toBeVisible();
  await expect(page.getByText('本期共 10,000 次')).toBeVisible();
  await expect(page.getByText('單一付費來源')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('MICROSOFT_STORE_CLIENT_SECRET');
  await expect(page.locator('body')).not.toContainText('待管理者設定');
  await expect(page.locator('body')).not.toContainText('已就緒');
  await expect(page.locator('body')).not.toContainText('API 金鑰');
});
