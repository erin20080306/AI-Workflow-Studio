import { expect, test } from '@playwright/test';

test('creates, pauses, resumes, and safely triggers a recurring schedule', async ({ page }) => {
  await page.goto('/dashboard/schedules');
  await expect(page.getByRole('heading', { level: 1, name: '排程與連接器' })).toBeVisible();
  await expect(page.getByRole('heading', { exact: true, name: 'Google Sheets' })).toBeVisible();
  await expect(page.getByText(/Server-only OAuth/)).toBeVisible();

  await page.getByLabel('執行頻率').selectOption('every_15_minutes');
  await page.getByRole('button', { exact: true, name: '建立排程' }).click();
  await expect(page.getByText('排程已建立；首次到期執行不會略過核准。')).toBeVisible();

  const stateResponse = await page.request.get('/api/schedules');
  expect(stateResponse.ok()).toBe(true);
  const state = (await stateResponse.json()) as {
    readonly schedules: readonly {
      readonly id: string;
      readonly nextRunAt: string;
    }[];
  };
  const schedule = state.schedules.at(-1);
  expect(schedule).toBeDefined();

  const tickResponse = await page.request.get(
    `/api/internal/schedules/tick?at=${encodeURIComponent(schedule!.nextRunAt)}`,
    {
      headers: {
        authorization: 'Bearer mock-only-schedule-cron-secret-v1',
      },
    },
  );
  expect(tickResponse.ok()).toBe(true);
  const tick = (await tickResponse.json()) as {
    readonly fires: readonly { readonly runId?: string }[];
    readonly runCount: number;
  };
  expect(tick.runCount).toBe(1);
  const runId = tick.fires[0]?.runId;
  expect(runId).toBeDefined();

  await page.goto(`/dashboard/runs/${runId!}`);
  await expect(page.getByRole('heading', { name: '需要執行核准' })).toBeVisible();

  await page.goto('/dashboard/schedules');
  const row = page.locator('article').filter({ hasText: '每日訂單彙整' }).last();
  await row.getByRole('button', { name: '暫停' }).click();
  await expect(row.getByText('已暫停', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: '恢復' }).click();
  await expect(row.getByText('執行中', { exact: true })).toBeVisible();
});
