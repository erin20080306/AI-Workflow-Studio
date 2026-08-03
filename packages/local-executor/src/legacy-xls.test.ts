import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { utils, write as writeWorkbook, type WorkSheet } from 'xlsx';
import { afterEach, describe, expect, it } from 'vitest';

import { hashFile } from './hash';
import { readSpreadsheet } from './read';

const temporaryDirectories: string[] = [];
// LibreOffice-generated BIFF8 fixture with a cached `10*2` formula in Orders!C4.
const LEGACY_FORMULA_XLS_GZIP_BASE64 =
  'H4sICOt9b2oCA2Zvcm11bGEueGxzAO1XXWxURRQ+c/end5fS3haqWKReUWyhxYCaWKPYLS1iTUkJIhJDItvtba1su812m0Bi4yLyJonKgy8khqQvRONPTPRBE9s3HzQaDA/6VHwxRiOLgRgS2ut3zp273W66ye5iiD89N+fOzHdn7pyZOX/z3bcN8+c/br5MRfQ4BWjRjVC4AFNg029YRIbGFl3X9WF3lf5VtKBLPsMgzi8E5jOv0eca0eUq/TfpAKXwZMimPTSOMk0nqBK6AxpT+L9yxiyW2a9cWp2/+vnZf7MfD4CL7Z99Pdt/FLwGXAteC64D13shgBrAjeB14PXgJtEJojvBG8B3gZvBG8F3gzfp+e/RJfNm1O/T7S2r/ua2UsTEKYZD9Pnar/nI5ewvQyM+Cs6JXvwEPkITrBs98WTCvl20W2SIK5ZhFkq6CzVF54DW0YeCfiHvXaJ9oBjZnVqjDxsxkf2MvDfLu454/Gcy5kdBdtJDlBMtf1MbQYPqp1F4wSk6Dn/I9UFy4BEzgjrA9mJUM33FNveqjGKLUd3oM0pxSt7i15Zl8iiqUT3yheXgXi3BWpphy9zrjDvpeHJeLG6Grrt2gXXP2ozzLwS/Vh5uVIjT/w6fwd6ttM/tXv9cMb61BN5RAt9WAo+siId8ecwl/KwBK82Sy6WVDUjZkA1L2ZgNSrkuWyPl+mzIPSrWcBq2IakfbH8gPeSkJ9+AtR/CM6dMMNHBM4p+pRfY5+cOyFzhHPt2dgr+HaCQH6Y1ObbKLyGcSScVYog5q2J4x6jlquVFERPRxESUMP9EILlJz4jnCXuRpN8ZiSdO2CmWxk47E6l0BssU4ey+XlR7piYzqTEnjf7dY6mp8QzCV/f2nZCnOzHmuIhYJr0d9CJWwmwCL51bky4NDmue+7OWub9aLGoIi2WH0SALtPC7mxeuXtw3uL/rRcGzS/tOWwzZPXUSX+aC22REu7xfk75+WDwl2OvyfgDjr/zO9HNXa0G9DfXvW6cvtk5f6dpaUD8PNxaBVLzBCn/oUB1qQ2341NzR+S6/VPQcvpg0Lcsm1ROp1yutI31aOtCbhqVdZYfniFS9YF5jOeYlB8uxQBG2ICmCv7XcMqSl8i2FlpFvGWgFdCsgPYP5Fvf0kpBNaBmk10CPxLyyhlqi1GJQ6Dfaz4eUe9o7oJyptY//VU+B3A7JUoK5NsEjOWuFTMigqIzjMTzpk0YjfRr2wgnRE7LhnLPUi5j+BKARqO6IWfgj5Wdf0YpyN4VsJxD1cjjLNDxL9j49xTnTvtFEOjWZGs7Ye44nnKT92KPbD8YHnWTSEV3dPTo83HkruaPyTLhqWnRJFHKF/9L86Xf/uDHwkvXeWya1t37yA5/IK9rI+Hunzi9jetf6dZ55WOeaQzrfnNA56i8LhBjp1XfocT6VU69EfkaMS99cOvfgRuvsO5C/48YHvRyxi7AjOs/1fZ9VIGsp/J9Ef+f9T9ZZpMMrjWFbyka8+vOYPU3HkOGwHMcqlr9R3Inn3NwK7lWHanw97cG8Y9CxAcjwclXzBwruYOWMYR3uy9vJADI8p+rzY3da6f3P1nc1yUDpWeS7Y3jicvZ90IJhORNGOPNNASlNbXr+UAX7fy/4/fz8vZghITI4ooGVydNZxfrvB2dW7/9CfwGAoblCABYAAA==';

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'aiws-legacy-xls-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeLegacyWorkbook(
  filePath: string,
  sheets: readonly { readonly name: string; readonly worksheet: WorkSheet }[],
): Promise<void> {
  const workbook = utils.book_new();
  for (const sheet of sheets) {
    utils.book_append_sheet(workbook, sheet.worksheet, sheet.name);
  }
  const output: unknown = writeWorkbook(workbook, { bookType: 'biff8', type: 'buffer' });
  if (!Buffer.isBuffer(output)) throw new Error('The XLS test fixture was not a Buffer.');
  await writeFile(filePath, output);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('legacy XLS reader', () => {
  it('reads cached formula values without exposing formulas and detects a shifted header', async () => {
    const directory = await temporaryDirectory();
    const sourcePath = join(directory, 'legacy-orders.xls');
    await writeFile(sourcePath, gunzipSync(Buffer.from(LEGACY_FORMULA_XLS_GZIP_BASE64, 'base64')));

    const document = await readSpreadsheet(sourcePath, {
      maxColumns: 10,
      maxFileSizeBytes: 1_000_000,
      maxRows: 10,
      maxSheets: 2,
    });

    expect(document.source).toMatchObject({
      fileHash: await hashFile(sourcePath),
      format: 'xls',
      formulaCellCount: 1,
    });
    expect(document.sheets).toEqual([
      {
        columns: ['Order ID', 'Customer', 'Amount'],
        headerRow: 3,
        name: 'Orders',
        rows: [{ Amount: 20, Customer: 'Acme', 'Order ID': 'A-1' }],
      },
    ]);
    expect(JSON.stringify(document)).not.toContain('10*2');
  });

  it('rejects disguised and malformed OLE files before releasing spreadsheet data', async () => {
    const directory = await temporaryDirectory();
    const disguisedPath = join(directory, 'disguised.xls');
    const malformedPath = join(directory, 'malformed.xls');
    await writeFile(disguisedPath, '<html><body>not a workbook</body></html>', 'utf8');
    await writeFile(
      malformedPath,
      Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.alloc(504)]),
    );

    await expect(readSpreadsheet(disguisedPath)).rejects.toMatchObject({
      code: 'FILE_UNSAFE_CONTENT',
    });
    await expect(readSpreadsheet(malformedPath)).rejects.toMatchObject({
      code: 'FILE_UNSAFE_CONTENT',
    });
  });

  it('preserves Traditional Chinese labels and values locally', async () => {
    const directory = await temporaryDirectory();
    const sourcePath = join(directory, 'traditional-chinese.xls');
    await writeLegacyWorkbook(sourcePath, [
      {
        name: '營運資料',
        worksheet: utils.aoa_to_sheet([
          ['客戶', '金額'],
          ['台北公司', 320],
        ]),
      },
    ]);

    const document = await readSpreadsheet(sourcePath, { maxRows: 5, maxSheets: 2 });

    expect(document.sheets[0]).toMatchObject({
      columns: ['客戶', '金額'],
      name: '營運資料',
      rows: [{ 客戶: '台北公司', 金額: 320 }],
    });
  });

  it('uses tokenized header detection so Paid is not mistaken for an ID header', async () => {
    const directory = await temporaryDirectory();
    const sourcePath = join(directory, 'tokenized-header.xls');
    await writeLegacyWorkbook(sourcePath, [
      {
        name: 'Orders',
        worksheet: utils.aoa_to_sheet([
          ['Paid', 'Invalid', 'Candidate'],
          ['Order ID', 'Amount', 'Status'],
          ['A-1', 200, 'Paid'],
        ]),
      },
    ]);

    const document = await readSpreadsheet(sourcePath, { maxRows: 5, maxSheets: 2 });

    expect(document.sheets[0]).toMatchObject({
      columns: ['Order ID', 'Amount', 'Status'],
      headerRow: 2,
      rows: [{ Amount: 200, 'Order ID': 'A-1', Status: 'Paid' }],
    });
  });

  it('keeps the caller event loop responsive while a worker parses a legacy workbook', async () => {
    const directory = await temporaryDirectory();
    const sourcePath = join(directory, 'responsive.xls');
    await writeLegacyWorkbook(sourcePath, [
      {
        name: 'Rows',
        worksheet: utils.aoa_to_sheet([
          ['Order ID', 'Amount', 'Status'],
          ...Array.from({ length: 5_000 }, (_, index) => [
            `A-${index + 1}`,
            index + 1,
            index % 2 === 0 ? 'Paid' : 'Pending',
          ]),
        ]),
      },
    ]);

    let completed = false;
    let ticksWhilePending = 0;
    const interval = setInterval(() => {
      if (!completed) ticksWhilePending += 1;
    }, 1);
    try {
      const document = await readSpreadsheet(sourcePath, { maxRows: 5_000, maxSheets: 1 });
      completed = true;
      expect(document.sheets[0]?.rows).toHaveLength(5_000);
    } finally {
      completed = true;
      clearInterval(interval);
    }

    expect(ticksWhilePending).toBeGreaterThan(2);
  });

  it('terminates a slow worker at the explicit timeout and releases the parser slot', async () => {
    const directory = await temporaryDirectory();
    const sourcePath = join(directory, 'timeout.xls');
    await writeLegacyWorkbook(sourcePath, [
      {
        name: 'Rows',
        worksheet: utils.aoa_to_sheet([
          ['Order ID', 'Amount'],
          ['A-1', 100],
        ]),
      },
    ]);

    await expect(
      readSpreadsheet(sourcePath, { maxRows: 5, maxSheets: 1 }, { legacyXlsTimeoutMs: 1 }),
    ).rejects.toMatchObject({ code: 'FILE_UNSAFE_CONTENT' });

    const controller = new AbortController();
    const cancelled = readSpreadsheet(
      sourcePath,
      { maxRows: 5, maxSheets: 1 },
      { signal: controller.signal },
    );
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });

    const document = await readSpreadsheet(sourcePath, { maxRows: 5, maxSheets: 1 });
    expect(document.sheets[0]?.rows).toEqual([{ Amount: 100, 'Order ID': 'A-1' }]);
  });

  it('enforces file, row, sheet, and column limits for legacy workbooks', async () => {
    const directory = await temporaryDirectory();
    const sourcePath = join(directory, 'bounded.xls');
    await writeLegacyWorkbook(sourcePath, [
      {
        name: 'First',
        worksheet: utils.aoa_to_sheet([
          ['A', 'B', 'C'],
          [1, 2, 3],
          [4, 5, 6],
        ]),
      },
      {
        name: 'Second',
        worksheet: utils.aoa_to_sheet([
          ['A', 'B'],
          [7, 8],
        ]),
      },
    ]);

    await expect(readSpreadsheet(sourcePath, { maxFileSizeBytes: 100 })).rejects.toMatchObject({
      code: 'FILE_LIMIT_EXCEEDED',
    });
    await expect(readSpreadsheet(sourcePath, { maxRows: 1 })).rejects.toMatchObject({
      code: 'FILE_LIMIT_EXCEEDED',
    });
    await expect(readSpreadsheet(sourcePath, { maxSheets: 1 })).rejects.toMatchObject({
      code: 'FILE_LIMIT_EXCEEDED',
    });
    await expect(readSpreadsheet(sourcePath, { maxColumns: 2 })).rejects.toMatchObject({
      code: 'FILE_LIMIT_EXCEEDED',
    });
  });
});
