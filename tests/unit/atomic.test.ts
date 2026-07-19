import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertPathInside,
  readJson,
  writeJsonAtomic,
} from '../../src/main/persistence/atomic';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('atomic persistence', () => {
  it('replaces a JSON file without leaving temporary files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'designx-atomic-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'record.json');

    await writeJsonAtomic(filePath, { schemaVersion: 1, value: 'first' });
    await writeJsonAtomic(filePath, { schemaVersion: 1, value: 'second' });

    await expect(readJson(filePath)).resolves.toEqual({
      schemaVersion: 1,
      value: 'second',
    });
    expect(await readFile(filePath, 'utf8')).toContain('"second"');
  });

  it('rejects paths that escape the workspace', () => {
    const root = join(tmpdir(), 'designx-root');
    expect(() => assertPathInside(root, join(root, 'knowledge', 'a'))).not.toThrow();
    expect(() => assertPathInside(root, join(root, '..', 'outside'))).toThrow(
      /超出了当前工作区/,
    );
  });
});
