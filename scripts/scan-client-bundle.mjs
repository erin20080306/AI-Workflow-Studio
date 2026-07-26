import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';

const DEFAULT_SECRET_ENVIRONMENT_NAMES = [
  'AGENT_TOKEN_PEPPER',
  'ANTHROPIC_API_KEY',
  'APP_ENCRYPTION_KEY',
  'CRON_SECRET',
  'GEMINI_API_KEY',
  'GOOGLE_CLIENT_SECRET',
  'OPENAI_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const FORBIDDEN_PATTERNS = [
  {
    name: 'server-only environment variable name',
    pattern:
      /\b(?:AGENT_TOKEN_PEPPER|ANTHROPIC_API_KEY|APP_ENCRYPTION_KEY|CRON_SECRET|GEMINI_API_KEY|GOOGLE_CLIENT_SECRET|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY)\b/u,
  },
  {
    name: 'private key material',
    pattern: /-----BEGIN (?:EC |OPENSSH |PGP |RSA )?PRIVATE KEY-----/u,
  },
  {
    name: 'provider credential',
    pattern: /\b(?:AIza[-_A-Za-z0-9]{20,}|sk-(?:proj-)?[-_A-Za-z0-9]{24,})\b/u,
  },
  {
    name: 'GitHub credential',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/u,
  },
];

function readOption(argumentsList, name) {
  const index = argumentsList.indexOf(`--${name}`);
  const value = index === -1 ? undefined : argumentsList[index + 1];
  if (value === undefined || value.startsWith('--') || value.trim() === '') {
    throw new Error(`Missing required --${name} option.`);
  }
  return value;
}

async function walkFiles(rootDirectory) {
  const files = [];

  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Client bundle contains a symbolic link: ${fullPath}`);
      }
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  await visit(rootDirectory);
  return files.sort((left, right) => left.localeCompare(right));
}

async function scanFile(filePath, rules) {
  const stream = createReadStream(filePath);
  let overlap = '';

  for await (const chunk of stream) {
    const current = overlap + chunk.toString('utf8');
    for (const rule of rules) {
      if (
        typeof rule.pattern === 'string'
          ? current.includes(rule.pattern)
          : rule.pattern.test(current)
      ) {
        return rule.name;
      }
    }
    overlap = current.slice(-4096);
  }

  return undefined;
}

function secretRules(secretValues) {
  return Object.entries(secretValues)
    .filter(([, value]) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') >= 8)
    .map(([name, value]) => ({
      name: `configured ${name} value`,
      pattern: value,
    }));
}

function environmentSecrets(environment) {
  return Object.fromEntries(
    DEFAULT_SECRET_ENVIRONMENT_NAMES.map((name) => [name, environment[name]]),
  );
}

export async function scanClientBundle({
  directory,
  secretValues = {},
  workspacePath = process.cwd(),
}) {
  const rootDirectory = path.resolve(directory);
  const rules = [...FORBIDDEN_PATTERNS, ...secretRules(secretValues)];
  if (workspacePath !== '') {
    rules.push({
      name: 'local workspace path',
      pattern: path.resolve(workspacePath),
    });
  }

  const violations = [];
  for (const filePath of await walkFiles(rootDirectory)) {
    const violation = await scanFile(filePath, rules);
    if (violation !== undefined) {
      violations.push(`${path.relative(rootDirectory, filePath)}: ${violation}`);
    }
  }

  if (violations.length > 0) {
    throw new Error(`Sensitive material detected in client bundle:\n${violations.join('\n')}`);
  }

  return {
    filesScanned: (await walkFiles(rootDirectory)).length,
  };
}

async function main() {
  const argumentsList = process.argv.slice(2);
  const result = await scanClientBundle({
    directory: readOption(argumentsList, 'directory'),
    secretValues: environmentSecrets(process.env),
    workspacePath: process.cwd(),
  });
  process.stdout.write(`Client bundle scan passed (${result.filesScanned} files).\n`);
}

const entryUrl = process.argv[1] === undefined ? undefined : pathToFileURL(process.argv[1]).href;
if (entryUrl === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
