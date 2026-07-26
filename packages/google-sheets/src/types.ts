export type GoogleCell = boolean | null | number | string;
export type GoogleValueRows = readonly (readonly GoogleCell[])[];

export type GoogleFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface GoogleOAuthTokens {
  readonly accessToken: string;
  readonly expiresAt: string;
  readonly refreshToken?: string;
  readonly scopes: readonly string[];
}

export interface GoogleSpreadsheetSummary {
  readonly id: string;
  readonly modifiedTime?: string;
  readonly name: string;
}

export interface GoogleSheetSummary {
  readonly columnCount: number;
  readonly rowCount: number;
  readonly sheetId: number;
  readonly title: string;
}

export interface GoogleReadResult {
  readonly range: string;
  readonly values: GoogleValueRows;
}

export interface GoogleWriteResult {
  readonly spreadsheetId: string;
  readonly updatedCells: number;
  readonly updatedColumns: number;
  readonly updatedRows: number;
}

export interface GoogleOperationResult {
  readonly result: GoogleWriteResult;
  readonly status: 'completed';
}

export interface GoogleOperationStore {
  claim(
    connectionId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<'claimed' | 'conflict' | GoogleOperationResult>;
  complete(
    connectionId: string,
    idempotencyKey: string,
    requestHash: string,
    result: GoogleWriteResult,
  ): Promise<void>;
  markAmbiguous(connectionId: string, idempotencyKey: string, requestHash: string): Promise<void>;
  release(connectionId: string, idempotencyKey: string, requestHash: string): Promise<void>;
}
