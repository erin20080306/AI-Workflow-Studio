import { lstat, mkdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { FolderGrantView, FolderPermissionInput } from '../shared/contracts';
import { readPrivateFile, writePrivateFile } from './private-files';

const PermissionSchema = z
  .object({
    read: z.boolean(),
    watch: z.boolean(),
    write: z.boolean(),
  })
  .strict()
  .refine((value) => value.read || value.write || value.watch, {
    message: 'At least one folder permission is required.',
  });

const FolderGrantSchema = z
  .object({
    canonicalPath: z.string().min(1).max(4_096),
    createdAt: z.iso.datetime({ offset: true }),
    deviceId: z.string().uuid(),
    displayName: z.string().min(1).max(120),
    folderAliasId: z.string().uuid(),
    permissions: PermissionSchema,
  })
  .strict();

const FolderGrantListSchema = z.array(FolderGrantSchema).max(200);
type LocalFolderGrant = z.infer<typeof FolderGrantSchema>;

export class FolderAuthorizationError extends Error {
  readonly code:
    | 'FOLDER_ALIAS_NOT_FOUND'
    | 'FOLDER_NOT_DIRECTORY'
    | 'FOLDER_PERMISSION_DENIED'
    | 'FOLDER_TRAVERSAL_REJECTED';

  constructor(code: FolderAuthorizationError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'FolderAuthorizationError';
  }
}

function toView(grant: LocalFolderGrant): FolderGrantView {
  return {
    createdAt: grant.createdAt,
    displayName: grant.displayName,
    folderAliasId: grant.folderAliasId,
    permissions: grant.permissions,
  };
}

export class FolderGrantStore {
  constructor(private readonly filePath: string) {}

  async authorize(
    selectedPath: string,
    deviceId: string,
    permissionsInput: FolderPermissionInput,
  ): Promise<FolderGrantView> {
    const permissions = PermissionSchema.parse(permissionsInput);
    const canonicalPath = await realpath(selectedPath);
    if (!(await stat(canonicalPath)).isDirectory()) {
      throw new FolderAuthorizationError(
        'FOLDER_NOT_DIRECTORY',
        'The selected item is not a directory.',
      );
    }
    const grants = await this.load();
    const existing = grants.find(
      (grant) => grant.deviceId === deviceId && grant.canonicalPath === canonicalPath,
    );
    if (existing !== undefined) {
      existing.permissions = permissions;
      await this.save(grants);
      return toView(existing);
    }
    const grant = FolderGrantSchema.parse({
      canonicalPath,
      createdAt: new Date().toISOString(),
      deviceId,
      displayName: basename(canonicalPath),
      folderAliasId: randomUUID(),
      permissions,
    });
    grants.push(grant);
    await this.save(grants);
    return toView(grant);
  }

  async list(deviceId: string): Promise<readonly FolderGrantView[]> {
    return (await this.load()).filter((grant) => grant.deviceId === deviceId).map(toView);
  }

  async remove(folderAliasId: string, deviceId: string): Promise<readonly FolderGrantView[]> {
    const grants = await this.load();
    const next = grants.filter(
      (grant) => !(grant.folderAliasId === folderAliasId && grant.deviceId === deviceId),
    );
    if (next.length === grants.length) {
      throw new FolderAuthorizationError(
        'FOLDER_ALIAS_NOT_FOUND',
        'The folder permission was not found.',
      );
    }
    await this.save(next);
    return next.filter((grant) => grant.deviceId === deviceId).map(toView);
  }

  async resolveAuthorizedPath(
    folderAliasId: string,
    deviceId: string,
    relativePath: string,
    requiredPermission: keyof FolderPermissionInput,
  ): Promise<string> {
    this.assertSafeRelativePath(relativePath);
    const root = await this.resolveAuthorizedRoot(folderAliasId, deviceId, requiredPermission);
    const unresolvedTarget = resolve(root, relativePath);
    this.assertContained(root, unresolvedTarget);
    const target = await realpath(unresolvedTarget);
    this.assertContained(root, target);
    return target;
  }

  async resolveAuthorizedOutputPath(
    folderAliasId: string,
    deviceId: string,
    relativePath: string,
  ): Promise<string> {
    this.assertSafeRelativePath(relativePath);
    const root = await this.resolveAuthorizedRoot(folderAliasId, deviceId, 'write');
    const target = resolve(root, relativePath);
    this.assertContained(root, target);
    const canonicalParent = await realpath(dirname(target));
    this.assertContained(root, canonicalParent);
    try {
      const targetStat = await lstat(target);
      if (targetStat.isSymbolicLink()) {
        throw new FolderAuthorizationError(
          'FOLDER_TRAVERSAL_REJECTED',
          'A spreadsheet output cannot replace a symbolic link.',
        );
      }
      this.assertContained(root, await realpath(target));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    return target;
  }

  async resolveAuthorizedWorkDirectory(
    folderAliasId: string,
    deviceId: string,
    jobId: string,
  ): Promise<{ readonly absolutePath: string; readonly relativePath: string }> {
    const safeJobId = z.string().uuid().parse(jobId);
    const root = await this.resolveAuthorizedRoot(folderAliasId, deviceId, 'write');
    const relativePath = `.ai-workflow-studio/jobs/${safeJobId}`;
    let canonicalTarget = root;
    for (const name of ['.ai-workflow-studio', 'jobs', safeJobId]) {
      const segment = resolve(canonicalTarget, name);
      this.assertContained(root, segment);
      try {
        await mkdir(segment, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      const segmentStat = await lstat(segment);
      if (segmentStat.isSymbolicLink() || !segmentStat.isDirectory()) {
        throw new FolderAuthorizationError(
          'FOLDER_TRAVERSAL_REJECTED',
          'A Desktop Agent work directory must be a real directory.',
        );
      }
      canonicalTarget = await realpath(segment);
      this.assertContained(root, canonicalTarget);
    }
    return { absolutePath: canonicalTarget, relativePath };
  }

  async resolveAuthorizedRoot(
    folderAliasId: string,
    deviceId: string,
    requiredPermission: keyof FolderPermissionInput,
  ): Promise<string> {
    const grant = (await this.load()).find(
      (candidate) => candidate.folderAliasId === folderAliasId && candidate.deviceId === deviceId,
    );
    if (grant === undefined) {
      throw new FolderAuthorizationError(
        'FOLDER_ALIAS_NOT_FOUND',
        'The folder permission was not found.',
      );
    }
    if (!grant.permissions[requiredPermission]) {
      throw new FolderAuthorizationError(
        'FOLDER_PERMISSION_DENIED',
        'The requested folder operation is not permitted.',
      );
    }
    const root = await realpath(grant.canonicalPath);
    if (!(await stat(root)).isDirectory()) {
      throw new FolderAuthorizationError(
        'FOLDER_NOT_DIRECTORY',
        'The authorized local root is no longer a directory.',
      );
    }
    return root;
  }

  private assertContained(root: string, target: string): void {
    const containment = relative(root, target);
    if (
      containment === '..' ||
      containment.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
      isAbsolute(containment)
    ) {
      throw new FolderAuthorizationError(
        'FOLDER_TRAVERSAL_REJECTED',
        'The requested path is outside the authorized folder.',
      );
    }
  }

  private assertSafeRelativePath(relativePath: string): void {
    const segments = relativePath.split(/[\\/]/u);
    if (
      relativePath.length === 0 ||
      relativePath.length > 1_024 ||
      relativePath.includes('\0') ||
      isAbsolute(relativePath) ||
      segments.some((segment) => segment === '' || segment === '.' || segment === '..')
    ) {
      throw new FolderAuthorizationError(
        'FOLDER_TRAVERSAL_REJECTED',
        'The requested path is not a safe relative path.',
      );
    }
  }

  private async load(): Promise<LocalFolderGrant[]> {
    const content = await readPrivateFile(this.filePath);
    return content === undefined ? [] : FolderGrantListSchema.parse(JSON.parse(content) as unknown);
  }

  private async save(grants: readonly LocalFolderGrant[]): Promise<void> {
    const validated = FolderGrantListSchema.parse(grants);
    await writePrivateFile(this.filePath, JSON.stringify(validated));
  }
}
