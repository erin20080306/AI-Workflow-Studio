import type { WorkflowNodeType } from './node-configs';

export type RiskLevel = 'destructive' | 'external' | 'read' | 'write';
export type ApprovalMode = 'always' | 'first_run' | 'none';
export type ExecutionLocation = 'cloud' | 'desktop' | 'either';

export interface NodeCatalogEntry {
  readonly approvalMode: ApprovalMode;
  readonly description: string;
  readonly executionLocation: ExecutionLocation;
  readonly riskLevel: RiskLevel;
  readonly type: WorkflowNodeType;
  readonly version: 1;
}

const entry = (
  type: WorkflowNodeType,
  riskLevel: RiskLevel,
  approvalMode: ApprovalMode,
  executionLocation: ExecutionLocation,
  description: string,
): NodeCatalogEntry => ({
  approvalMode,
  description,
  executionLocation,
  riskLevel,
  type,
  version: 1,
});

export const NODE_CATALOG = [
  entry('manual.trigger', 'read', 'none', 'either', 'Start a workflow manually.'),
  entry('schedule.trigger', 'read', 'none', 'either', 'Start on a validated schedule.'),
  entry('folder.file_created', 'read', 'none', 'desktop', 'Watch for newly created files.'),
  entry('folder.file_changed', 'read', 'none', 'desktop', 'Watch for changed files.'),
  entry('folder.list_files', 'read', 'none', 'desktop', 'List files in an approved folder.'),
  entry('folder.move_file', 'destructive', 'always', 'desktop', 'Move a source file.'),
  entry('folder.rename_file', 'destructive', 'always', 'desktop', 'Rename a source file.'),
  entry('folder.archive_file', 'destructive', 'always', 'desktop', 'Archive a source file.'),
  entry('excel.read', 'read', 'none', 'desktop', 'Read bounded spreadsheet data.'),
  entry('excel.merge', 'read', 'none', 'desktop', 'Merge in-memory spreadsheet data.'),
  entry('excel.write', 'write', 'first_run', 'desktop', 'Write a new Excel file.'),
  entry('excel.create_report', 'write', 'first_run', 'desktop', 'Create a new Excel report.'),
  entry('excel.split_by_field', 'write', 'first_run', 'desktop', 'Create split Excel outputs.'),
  entry('data.map_columns', 'read', 'none', 'either', 'Map columns deterministically.'),
  entry('data.filter', 'read', 'none', 'either', 'Filter rows deterministically.'),
  entry('data.sort', 'read', 'none', 'either', 'Sort rows deterministically.'),
  entry('data.group', 'read', 'none', 'either', 'Group rows deterministically.'),
  entry('data.aggregate', 'read', 'none', 'either', 'Aggregate rows deterministically.'),
  entry('data.deduplicate', 'read', 'none', 'either', 'Remove duplicate rows.'),
  entry('data.validate', 'read', 'none', 'either', 'Validate data rules.'),
  entry('google_sheets.read', 'read', 'none', 'cloud', 'Read a connected Google Sheet.'),
  entry(
    'google_sheets.append',
    'external',
    'always',
    'cloud',
    'Append approved data to Google Sheets.',
  ),
  entry(
    'google_sheets.update',
    'external',
    'always',
    'cloud',
    'Update approved Google Sheets rows.',
  ),
  entry(
    'google_sheets.sync',
    'external',
    'always',
    'cloud',
    'Synchronize approved data with Google Sheets.',
  ),
  entry('notification.desktop', 'write', 'first_run', 'desktop', 'Display a desktop notification.'),
  entry('webhook.call', 'external', 'always', 'cloud', 'Call an allowlisted webhook endpoint.'),
] as const satisfies readonly NodeCatalogEntry[];

export const NODE_CATALOG_BY_TYPE: ReadonlyMap<WorkflowNodeType, NodeCatalogEntry> = new Map(
  NODE_CATALOG.map((definition) => [definition.type, definition]),
);
