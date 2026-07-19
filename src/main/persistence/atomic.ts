import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DesignXError } from '../errors';

export function assertPathInside(root: string, candidate: string): string {
  const absoluteRoot = resolve(root);
  const absoluteCandidate = resolve(candidate);
  const relation = relative(absoluteRoot, absoluteCandidate);
  if (
    relation === '' ||
    (!relation.startsWith('..') && !relation.includes(`..${process.platform === 'win32' ? '\\' : '/'}`))
  ) {
    return absoluteCandidate;
  }
  throw new DesignXError({
    code: 'PATH_ESCAPE',
    stage: 'persistence',
    message: '目标路径超出了当前工作区。',
    retryable: false,
  });
}

export function pathInside(root: string, ...segments: string[]): string {
  return assertPathInside(root, resolve(root, ...segments));
}

export async function validateWritableDirectory(directory: string): Promise<string> {
  const absolute = resolve(directory);
  let metadata;
  try {
    metadata = await stat(absolute);
    await access(absolute, constants.R_OK | constants.W_OK);
  } catch (error) {
    throw new DesignXError(
      {
        code: 'WORKSPACE_UNAVAILABLE',
        stage: 'workspace-validation',
        message: '所选目录不可访问或不可写。',
        retryable: true,
        detail: error instanceof Error ? error.message : undefined,
      },
      { cause: error },
    );
  }
  if (!metadata.isDirectory()) {
    throw new DesignXError({
      code: 'WORKSPACE_NOT_DIRECTORY',
      stage: 'workspace-validation',
      message: '所选路径不是目录。',
      retryable: true,
    });
  }
  return absolute;
}

export async function readJson<T>(filePath: string): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch (error) {
    throw new DesignXError(
      {
        code: 'INVALID_DATA_FILE',
        stage: 'persistence-read',
        message: `无法读取数据文件 ${filePath.split(/[\\/]/).pop() ?? filePath}。`,
        retryable: false,
        detail: error instanceof Error ? error.message : undefined,
      },
      { cause: error },
    );
  }
}

export async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    return await readJson<T>(filePath);
  } catch (error) {
    if (
      error instanceof DesignXError &&
      error.detail?.includes('ENOENT')
    ) {
      return null;
    }
    throw error;
  }
}

export async function writeJsonAtomic(
  filePath: string,
  value: unknown,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rename(temporaryPath, filePath);
      return;
    } catch (error) {
      lastError = error;
      const code =
        error instanceof Error && 'code' in error ? String(error.code) : '';
      if (
        !['EACCES', 'EBUSY', 'EPERM'].includes(code) ||
        attempt === 7
      ) {
        break;
      }
      await new Promise((resolvePromise) =>
        setTimeout(resolvePromise, 15 * (attempt + 1)),
      );
    }
  }
  {
    await rm(temporaryPath, { force: true });
    throw new DesignXError(
      {
        code: 'ATOMIC_WRITE_FAILED',
        stage: 'persistence-write',
        message: '本地数据写入失败，原文件未被修改。',
        retryable: true,
        detail: lastError instanceof Error ? lastError.message : undefined,
      },
      { cause: lastError },
    );
  }
}

export async function renameImmutableDirectory(
  temporaryPath: string,
  finalPath: string,
): Promise<void> {
  try {
    await access(finalPath);
    throw new DesignXError({
      code: 'IMMUTABLE_VERSION_EXISTS',
      stage: 'knowledge-publish',
      message: '目标知识版本已经存在，不能覆盖。',
      retryable: false,
    });
  } catch (error) {
    if (error instanceof DesignXError) throw error;
  }
  await mkdir(dirname(finalPath), { recursive: true });
  await rename(temporaryPath, finalPath);
}
