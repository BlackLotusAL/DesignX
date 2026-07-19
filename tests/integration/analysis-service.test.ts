import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceStore } from '../../src/main/persistence/workspace-store';
import { AnalysisService } from '../../src/main/services/analysis/analysis-service';
import { GitService } from '../../src/main/services/git/git-service';
import { KnowledgeService } from '../../src/main/services/knowledge/knowledge-service';
import { LogService } from '../../src/main/services/logging/log-service';
import { ModelService } from '../../src/main/services/model/model-service';

const temporaryDirectories: string[] = [];

function git(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      'git',
      args,
      { cwd, windowsHide: true, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error) reject(new Error(stderr || error.message));
        else resolvePromise(stdout.trim());
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

describe('AnalysisService pipeline', () => {
  it('persists valid findings, records insufficient evidence, and updates baseline', async () => {
    const root = await mkdtemp(join(tmpdir(), 'designx-analysis-'));
    temporaryDirectories.push(root);
    const remote = join(root, 'remote.git');
    const seed = join(root, 'seed');
    const workspace = join(root, 'workspace');
    await Promise.all([mkdir(seed), mkdir(workspace)]);
    await git(['init', '--bare', remote]);
    await git(['init'], seed);
    await git(['config', 'user.email', 'designx@example.test'], seed);
    await git(['config', 'user.name', 'DesignX Test'], seed);
    await mkdir(join(seed, 'src'));
    await writeFile(
      join(seed, 'src', 'payment.ts'),
      [
        'export function handlePayment(id: string) {',
        '  savePayment(id);',
        '}',
        'function savePayment(_id: string) {}',
        '',
      ].join('\n'),
      'utf8',
    );
    await git(['add', '.'], seed);
    await git(['commit', '-m', 'initial'], seed);
    await git(['branch', '-M', 'main'], seed);
    await git(['remote', 'add', 'origin', remote], seed);
    await git(['push', '-u', 'origin', 'main'], seed);

    const store = new WorkspaceStore(workspace);
    await store.initialize();
    const gitService = new GitService(true);
    const repository = await gitService.addRepository(store, {
      name: 'payment',
      remoteUrl: remote,
      branch: 'main',
    });
    const knowledgeService = new KnowledgeService(true);
    const markdownPath = resolve('tests/fixtures/knowledge/sample.md');
    const draft = await knowledgeService.importDraft(store, {
      name: '支付约束',
      type: '系统设计',
      scope: 'src/**',
      files: [
        {
          path: markdownPath,
          name: 'sample.md',
          extension: '.md',
          size: (await stat(markdownPath)).size,
        },
      ],
    });
    const knowledgePackage = await knowledgeService.publish(store, {
      packageId: draft.packageId,
      name: draft.name,
      type: draft.type,
      scope: draft.scope,
      skillMarkdown: draft.skillMarkdown,
    });
    const reference = draft.references.find((item) => item.title === '幂等约束');
    if (!reference) throw new Error('Missing reference fixture');

    const model = new ModelService({
      allowLocalhostHttp: true,
      fetch: async () => {
        const baseFinding = {
          title: '支付回调缺少幂等校验',
          type: '系统设计一致性',
          severity: 'high',
          confidence: 96,
          file: 'src/payment.ts',
          line: 2,
          symbol: 'handlePayment',
          knownFact: '当前实现直接执行写入。',
          inference: '重复回调可能造成重复写入。',
          knowledge: {
            packageId: draft.packageId,
            version: 'v1.0',
            section: reference.title,
            referencePath: reference.referencePath,
            sourcePath: reference.sourcePath,
            sourceLocation: reference.sourceLocation.label,
            excerpt: reference.excerpt,
          },
          suggestions: ['写入前按唯一业务键检查处理状态。'],
        };
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    findings: [
                      baseFinding,
                      {
                        ...baseFinding,
                        title: '伪造来源应被过滤',
                        knowledge: {
                          ...baseFinding.knowledge,
                          referencePath: 'references/missing.md',
                        },
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      },
    });
    const analysis = new AnalysisService({
      git: gitService,
      knowledge: knowledgeService,
      model,
      connection: async () => ({
        baseUrl: 'http://127.0.0.1:12345',
        model: 'test-model',
        credential: 'test-key',
        timeoutSeconds: 2,
      }),
      log: () => new LogService(store.designxDirectory),
    });
    const task = await analysis.start(store, {
      repositoryId: repository.id,
      knowledgeVersionIds: [`${draft.packageId}@${knowledgePackage.version}`],
      range: 'current',
      focus: '支付回调幂等',
    });

    let completed = await store.task(task.id);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (completed.status !== 'queued' && completed.status !== 'running') break;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
      completed = await store.task(task.id);
    }

    expect(completed.status).toBe('completed');
    expect(completed.findingCount).toBe(1);
    expect(completed.diagnostics.some((item) => item.code === 'EVIDENCE_INSUFFICIENT')).toBe(
      true,
    );
    const findings = await store.findingsForTask(task.id);
    expect(findings).toHaveLength(1);
    expect(findings[0].commit).toMatch(/^[a-f0-9]{40}$/);
    expect(findings[0].knowledge.sourceLocation).toBe(
      reference.sourceLocation.label,
    );
    expect((await store.repository(repository.id)).lastAnalysisCommit).toBe(
      findings[0].commit,
    );
  });
});
