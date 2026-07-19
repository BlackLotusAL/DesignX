import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceStore } from '../../src/main/persistence/workspace-store';
import { GitService } from '../../src/main/services/git/git-service';

const temporaryDirectories: string[] = [];

function git(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, windowsHide: true, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('GitService', () => {
  it('validates, clones, fast-forwards, and protects a dirty checkout', async () => {
    const root = await mkdtemp(join(tmpdir(), 'designx-git-'));
    temporaryDirectories.push(root);
    const remote = join(root, 'remote.git');
    const seed = join(root, 'seed');
    const workspace = join(root, 'workspace');
    await Promise.all([mkdir(seed), mkdir(workspace)]);
    await git(['init', '--bare', remote]);
    await git(['init'], seed);
    await git(['config', 'user.email', 'designx@example.test'], seed);
    await git(['config', 'user.name', 'DesignX Test'], seed);
    await writeFile(
      join(seed, 'payment.ts'),
      'export function handlePayment(id: string) { return id; }\n',
      'utf8',
    );
    await git(['add', 'payment.ts'], seed);
    await git(['commit', '-m', 'initial'], seed);
    await git(['branch', '-M', 'main'], seed);
    await git(['remote', 'add', 'origin', remote], seed);
    await git(['push', '-u', 'origin', 'main'], seed);

    const store = new WorkspaceStore(workspace);
    await store.initialize();
    const service = new GitService(true);
    const repository = await service.addRepository(store, {
      name: 'payment-service',
      remoteUrl: remote,
      branch: 'main',
    });
    expect(repository.status).toBe('clean');
    expect(repository.commit).toMatch(/^[a-f0-9]{12}$/);

    await writeFile(
      join(seed, 'payment.ts'),
      'export function handlePayment(id: string) { return id.trim(); }\n',
      'utf8',
    );
    await git(['add', 'payment.ts'], seed);
    await git(['commit', '-m', 'update'], seed);
    await git(['push'], seed);
    const synchronized = await service.sync(store, repository.id);
    expect(synchronized.commit).not.toBe(repository.commit);

    await writeFile(
      join(store.repositoryCheckout(repository.id), 'payment.ts'),
      '// local change\n',
      'utf8',
    );
    await expect(service.sync(store, repository.id)).rejects.toMatchObject({
      code: 'GIT_WORKTREE_DIRTY',
    });
    expect((await store.repository(repository.id)).status).toBe('dirty');
  });
});
