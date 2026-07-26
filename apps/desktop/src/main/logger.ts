import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { LogEntry } from '../shared/contracts';

const TOKEN_PATTERNS = [
  /\b(?:dvt|clm)_[A-Za-z0-9_-]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~-]{12,}\b/gi,
  /\b(?:sk|AIza)[-_A-Za-z0-9]{12,}\b/g,
];
const LOCAL_PATH_PATTERNS = [/(?:\/Users|\/home)\/[^\s"',;]+/g, /[A-Za-z]:\\Users\\[^\s"',;]+/g];

function redactString(value: string): string {
  let redacted = value.slice(0, 2_000);
  for (const pattern of TOKEN_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED_TOKEN]');
  }
  for (const pattern of LOCAL_PATH_PATTERNS) {
    redacted = redacted.replace(pattern, '[LOCAL_PATH]');
  }
  return redacted;
}

export function redactLogValue(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return '[REDACTED_DEPTH]';
  }
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    value === undefined
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactLogValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 30)
        .map(([key, item]) => {
          const sensitiveKey = /(?:authorization|content|credential|path|prompt|row|secret|token)/i;
          return [key, sensitiveKey.test(key) ? '[REDACTED]' : redactLogValue(item, depth + 1)];
        }),
    );
  }
  return String(value);
}

export type LogListener = (entry: LogEntry) => void;

export class StructuredLogger {
  private readonly entries: LogEntry[] = [];
  private readonly listeners = new Set<LogListener>();

  constructor(private readonly filePath: string) {}

  error(code: string, message: string, metadata: Readonly<Record<string, unknown>> = {}): void {
    this.record('error', code, message, metadata);
  }

  info(code: string, message: string, metadata: Readonly<Record<string, unknown>> = {}): void {
    this.record('info', code, message, metadata);
  }

  list(): readonly LogEntry[] {
    return structuredClone(this.entries);
  }

  onEntry(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async restore(): Promise<void> {
    try {
      const content = await readFile(this.filePath, 'utf8');
      const lines = content.split('\n').filter(Boolean).slice(-200);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as LogEntry;
          this.entries.push(parsed);
        } catch {
          // A malformed historical line is ignored without exposing it.
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  warn(code: string, message: string, metadata: Readonly<Record<string, unknown>> = {}): void {
    this.record('warn', code, message, metadata);
  }

  private record(
    level: LogEntry['level'],
    code: string,
    message: string,
    metadata: Readonly<Record<string, unknown>>,
  ): void {
    const safeEntry: LogEntry = {
      code: redactString(code).slice(0, 120),
      level,
      message: redactString(message).slice(0, 500),
      metadata: redactLogValue(metadata) as Readonly<Record<string, unknown>>,
      occurredAt: new Date().toISOString(),
    };
    this.entries.push(safeEntry);
    if (this.entries.length > 200) {
      this.entries.shift();
    }
    for (const listener of this.listeners) {
      listener(structuredClone(safeEntry));
    }
    void this.append(safeEntry);
  }

  private async append(entry: LogEntry): Promise<void> {
    try {
      await mkdir(dirname(this.filePath), { mode: 0o700, recursive: true });
      await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
    } catch {
      // Logging failures must never recursively log or crash the Agent UI.
    }
  }
}
