import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceStore } from '../../src/main/persistence/workspace-store';
import type { AnalysisTaskRecord } from '../../src/shared/types';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('workspace task recovery', () => {
  it('marks queued and running tasks as interrupted on startup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'designx-workspace-'));
    temporaryDirectories.push(root);
    const store = new WorkspaceStore(root);
    await store.initialize();
    const task: AnalysisTaskRecord = {
      schemaVersion: 1,
      id: 'task-1',
      repositoryId: 'repo-1',
      repositoryName: 'repo',
      branch: 'main',
      range: 'current',
      rangeLabel: '当前代码基线',
      knowledge: ['规范 v1.0'],
      knowledgeVersionIds: ['knowledge@v1.0'],
      status: 'running',
      stage: '模型分析',
      progress: 60,
      findingCount: null,
      duration: '< 1m',
      startedAt: new Date().toISOString(),
      focus: '',
      diagnostics: [],
    };
    await store.saveTask(task);

    await store.markInterruptedTasks();
    const recovered = await store.task(task.id);

    expect(recovered.status).toBe('failed');
    expect(recovered.error).toContain('重新运行');
    expect(recovered.diagnostics.at(-1)?.code).toBe('APP_EXIT_INTERRUPTED');
  });
});
