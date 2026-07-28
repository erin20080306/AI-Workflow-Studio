import type { WebsiteStaticSource } from '@/lib/website-static-export';

const TEXT_PATH = /\.(?:html|json|md|sha256|txt)$/i;
const FORBIDDEN_TEXT_PATTERNS: readonly RegExp[] = [
  /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/i,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bAIza[A-Za-z0-9_-]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /\bSUPABASE_SERVICE_ROLE_KEY\b/,
  /(?:^|[\s"'(])\/Users\/[^/\s]+(?:\/|[\s"')])/m,
  /(?:^|[\s"'(])[A-Za-z]:\\Users\\[^\\\s]+(?:\\|[\s"')])/m,
];

export function assertWebsiteGithubSourceSafe(source: WebsiteStaticSource): void {
  for (const file of source.files) {
    if (
      file.path.startsWith('/') ||
      file.path.includes('\\') ||
      file.path.split('/').some((part) => part === '' || part === '.' || part === '..')
    ) {
      throw new Error('GitHub website source contains an unsafe path.');
    }
    if (!TEXT_PATH.test(file.path)) continue;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
    if (FORBIDDEN_TEXT_PATTERNS.some((pattern) => pattern.test(text))) {
      throw new Error('GitHub website source contains forbidden sensitive content.');
    }
  }
}
