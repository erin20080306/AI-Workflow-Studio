import { expect, test } from '@playwright/test';

test('streams and restores a tenant-scoped Ask conversation', async ({ page }) => {
  await page.goto('/dashboard/assistant');

  await expect(page.getByRole('heading', { name: '告訴 Work 你要的成果' })).toBeVisible();
  await expect(page.getByRole('link', { exact: true, name: '工作' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('heading', { name: '進度' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '產出' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '存取與核准' })).toBeVisible();

  const modelSelector = page.getByLabel('模型');
  await expect(modelSelector).toContainText('自動 · 依任務、額度與成本選擇');
  await expect(modelSelector).toContainText('OpenAI');
  await expect(modelSelector).toContainText('Claude');
  await expect(modelSelector).toContainText('Gemini');
  await expect(modelSelector).toContainText('Mock Studio');
  await expect(modelSelector).toContainText('gpt-5.6-luna');
  await expect(modelSelector).toContainText('claude-haiku-4-5-20251001');
  await expect(modelSelector).toContainText('gemini-3.5-flash-lite');
  await expect(modelSelector).toContainText('gpt-5.6-terra');
  await expect(modelSelector).toContainText('claude-sonnet-5');
  await expect(modelSelector).toContainText('gemini-3.6-flash');
  await expect(page.getByRole('button', { name: '經濟' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '標準' })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('mock-chat-v1');
  await expect(page.locator('body')).not.toContainText('mock-planner-v1');
  await expect(page.getByRole('button', { exact: true, name: '規劃' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('body')).not.toContainText('API 金鑰');
  await expect(page.locator('body')).not.toContainText('設定 AI Provider');

  await page.getByRole('button', { exact: true, name: '詢問' }).click();
  const question = '如何安全設計每日訂單彙整流程？';
  await page.getByLabel('告訴 Work 你要的成果').fill(question);
  await page.getByRole('button', { name: '送出' }).click();

  await expect(page.getByText(/我理解你的需求/)).toBeVisible();
  await expect(page.locator('body')).not.toContainText('mock · mock-chat-v1 · completed');
  await expect(page.getByRole('button', { exact: true, name: `${question} 詢問` })).toBeVisible();

  await page.reload();
  const savedConversation = page.getByRole('button', {
    exact: true,
    name: `${question} 詢問`,
  });
  await expect(savedConversation).toBeVisible();
  await savedConversation.click();
  await expect(page.getByText(question, { exact: true })).toBeVisible();
  await expect(page.getByText(/我理解你的需求/)).toBeVisible();
});

test('persists a validated Plan conversation', async ({ page }) => {
  await page.goto('/dashboard/assistant');
  await page.getByRole('button', { name: '新增工作' }).click();
  await expect(page.getByRole('button', { exact: true, name: '規劃' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page
    .getByLabel('告訴 Work 你要的成果')
    .fill('每天整理訂單資料夾裡的 Excel，依訂單編號去重，並建立一份新的彙整報表。');
  await page.getByRole('button', { name: '建立計畫' }).click();

  await expect(page.getByText('已建立通過驗證的步驟')).toBeVisible();
  await expect(page.getByRole('heading', { name: '本機 Excel 智慧彙整' })).toBeVisible();
  await expect(page.getByText('4 個步驟')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('mock · mock-planner-v1 · completed');
  await expect(page.getByRole('heading', { name: '存取與核准' })).toBeVisible();

  await page.getByRole('button', { name: '建立審閱草稿', exact: true }).click();
  await expect(page.getByText('已審閱的 Workflow v1 草稿')).toBeVisible();
  await expect(page.getByText(/sha256:[a-f0-9]{16}/)).toBeVisible();

  await page.getByRole('button', { name: '建立執行要求', exact: true }).click();
  await expect(page.getByText('第一次對外或寫入動作需要核准')).toBeVisible();
  await page.getByRole('link', { name: '開啟執行詳情' }).click();

  await expect(page.getByRole('heading', { name: '執行詳情' })).toBeVisible();
  await expect(page.getByText('等待核准', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '核准並派送' }).click();
  await expect(page.getByText('已核准執行', { exact: true })).toBeVisible();
  await expect(page.getByText('桌面工作已進入佇列', { exact: true })).toBeVisible();
});

test('generates a private image in chat and deletes the conversation after confirmation', async ({
  page,
}) => {
  await page.goto('/dashboard/assistant');
  await page.getByRole('button', { name: '新增工作' }).click();
  await page.getByRole('button', { name: '圖片' }).click();

  const prompt = '產生一張時尚專業的 AI 自動化工作流程主視覺';
  await page.getByLabel('告訴 Work 你要的成果').fill(prompt);
  await page.getByRole('button', { name: '產生圖片' }).click();

  await expect(page.getByRole('img', { name: prompt })).toBeVisible();
  const savedConversation = page.getByRole('button', {
    exact: true,
    name: `${prompt} 圖片`,
  });
  await expect(savedConversation).toBeVisible();

  await page.getByRole('button', { name: `刪除：${prompt}` }).click();
  await expect(page.getByRole('heading', { name: '確定刪除這個對話？' })).toBeVisible();
  await page.getByRole('button', { name: '刪除對話' }).click();
  await expect(page.getByRole('button', { exact: true, name: `${prompt} 圖片` })).toHaveCount(0);
  await expect(page.getByRole('img', { name: prompt })).toHaveCount(0);
});

test('uses an explicit source and creates an auditable Markdown artifact', async ({ page }) => {
  await page.goto('/dashboard/assistant');
  await page.getByRole('button', { name: '新增工作' }).click();
  await page.getByRole('button', { exact: true, name: '詢問' }).click();

  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from('Order ID,Amount\nA-100,1200\nA-101,800\n'.padEnd(70_000, 'x'), 'utf8'),
    mimeType: 'text/csv',
    name: 'orders.csv',
  });

  const sourceChip = page.getByRole('button', { name: '[S1] orders.csv' });
  await expect(sourceChip).toBeVisible();
  await expect(sourceChip).toHaveAttribute('aria-pressed', 'true');

  await page.getByLabel('告訴 Work 你要的成果').fill('請摘要選取的訂單來源');
  await page.getByRole('button', { name: '送出' }).click();

  await expect(page.getByText(/\[S1\] orders\.csv/).first()).toBeVisible();
  await page.getByRole('button', { name: '建立 Markdown' }).click();
  await expect(page.getByText('已建立 Markdown 產出')).toBeVisible();
  await expect(page.getByRole('link', { name: /來源工作區.*\.md/ })).toHaveAttribute(
    'href',
    /\/api\/ai\/artifacts\//,
  );
});
