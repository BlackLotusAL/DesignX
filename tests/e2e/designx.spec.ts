import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import {
  mkdtemp,
  mkdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import type {
  KnowledgeDraftView,
  WorkspaceSnapshot,
} from '../../src/shared/types';

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

function environment(overrides: Record<string, string>) {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    ),
    ...overrides,
  };
}

async function snapshot(page: Page) {
  return page.evaluate(async (): Promise<WorkspaceSnapshot> => {
    const result = await window.designx!.workspace.getSnapshot();
    if (!result.ok) throw new Error(result.error.message);
    return result.data;
  });
}

async function captureDesktop(
  app: ElectronApplication,
  page: Page,
  name: string,
  width: number,
  height: number,
) {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) throw new Error('DesignX window is unavailable');
      window.setBounds({ ...window.getBounds(), ...size });
    },
    { width, height },
  );
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => {
        const bounds = BrowserWindow.getAllWindows()[0]?.getBounds();
        return bounds ? { width: bounds.width, height: bounds.height } : null;
      }),
    )
    .toEqual({ width, height });
  await page.evaluate(
    () =>
      new Promise<void>((resolvePromise) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolvePromise())),
      ),
  );

  const layout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    viewportHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.viewportHeight);

  const output = process.env.DESIGNX_VISUAL_OUTPUT;
  if (!output) return;
  await mkdir(output, { recursive: true });
  await page.screenshot({
    path: join(output, `${name}-${width}x${height}.png`),
  });
}

async function waitForTask(
  page: Page,
  taskId: string,
  expected: 'completed' | 'failed',
) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const current = await snapshot(page);
    const task = current.tasks.find((item) => item.id === taskId);
    if (task?.status === expected) return;
    if (
      task &&
      ['completed', 'partial', 'failed'].includes(task.status)
    ) {
      throw new Error(
        `Task reached ${task.status}, expected ${expected}: ${JSON.stringify({
          stage: task.stage,
          error: task.error,
          diagnostics: task.diagnostics,
        })}`,
      );
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Task ${taskId} did not reach ${expected} within 30 seconds`);
}

test('first launch validates a workspace before switching', async () => {
  const root = await mkdtemp(join(tmpdir(), 'designx-e2e-first-'));
  const userData = join(root, 'user-data');
  const workspace = join(root, 'workspace');
  await Promise.all([mkdir(userData), mkdir(workspace)]);
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: environment({
      DESIGNX_DEV_WORKSPACE: '',
      DESIGNX_E2E: '1',
      NODE_ENV: 'test',
    }),
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: '选择本地工作区' })).toBeVisible();
    const invalid = await page.evaluate(async (path) => {
      return window.designx!.workspace.switch({ path });
    }, join(root, 'missing'));
    expect(invalid.ok).toBe(false);
    expect((await snapshot(page)).workspacePath).toBeNull();

    const valid = await page.evaluate(async (path) => {
      return window.designx!.workspace.switch({ path });
    }, workspace);
    expect(valid.ok).toBe(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: '新建分析' })).toBeVisible();
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('real repository, knowledge, analysis, ignore, retry and restart loop', async () => {
  test.setTimeout(120_000);
  const root = await mkdtemp(join(tmpdir(), 'designx-e2e-loop-'));
  const userData = join(root, 'user-data');
  const workspace = join(root, 'workspace');
  const remote = join(root, 'remote.git');
  const seed = join(root, 'seed');
  await Promise.all([
    mkdir(userData),
    mkdir(workspace),
    mkdir(seed),
  ]);
  await git(['init', '--bare', remote]);
  await git(['init'], seed);
  await git(['config', 'user.email', 'designx@example.test'], seed);
  await git(['config', 'user.name', 'DesignX E2E'], seed);
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

  let evidence: KnowledgeDraftView['references'][number] | null = null;
  let packageId = '';
  let modelMode: 'success' | 'fail' = 'success';
  const modelServer = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      if (modelMode === 'fail') {
        response.statusCode = 500;
        response.end('temporary model failure');
        return;
      }
      const output =
        evidence && packageId
          ? {
              findings: [
                {
                  title: '支付回调缺少幂等校验',
                  type: '系统设计一致性',
                  severity: 'high',
                  confidence: 96,
                  file: 'src/payment.ts',
                  line: 2,
                  symbol: 'handlePayment',
                  knownFact: '当前实现直接执行支付写入。',
                  inference: '重复回调可能造成重复业务写操作。',
                  knowledge: {
                    packageId,
                    version: 'v1.0',
                    section: evidence.title,
                    referencePath: evidence.referencePath,
                    sourcePath: evidence.sourcePath,
                    sourceLocation: evidence.sourceLocation.label,
                    excerpt: evidence.excerpt,
                  },
                  suggestions: ['写入前按唯一业务键检查处理状态。'],
                },
              ],
            }
          : { findings: [] };
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(output) } }],
        }),
      );
    });
  });
  await new Promise<void>((resolvePromise) =>
    modelServer.listen(0, '127.0.0.1', () => resolvePromise()),
  );
  const address = modelServer.address();
  if (!address || typeof address === 'string') throw new Error('No model address');
  const modelUrl = `http://127.0.0.1:${address.port}`;
  const markdownPath = resolve('tests/fixtures/knowledge/sample.md');
  const markdownSize = (await stat(markdownPath)).size;
  const launch = () =>
    electron.launch({
      args: ['.', `--user-data-dir=${userData}`],
      env: environment({
        DESIGNX_DEV_WORKSPACE: workspace,
        DESIGNX_MODEL_BASE_URL: modelUrl,
        DESIGNX_MODEL_NAME: 'e2e-model',
        DESIGNX_MODEL_API_KEY: 'e2e-key',
        DESIGNX_E2E: '1',
        NODE_ENV: 'test',
      }),
    });
  const rendererProblems: string[] = [];
  const monitorRenderer = (page: Page) => {
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        rendererProblems.push(`${message.type()}: ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => rendererProblems.push(`pageerror: ${error.message}`));
  };

  let app = await launch();
  try {
    let page = await app.firstWindow();
    monitorRenderer(page);
    await expect(page.getByRole('heading', { name: '新建分析' })).toBeVisible();
    const repositoryResult = await page.evaluate(async ({ remoteUrl }) => {
      return window.designx!.repositories.add({
        name: 'payment-service',
        remoteUrl,
        branch: 'main',
      });
    }, { remoteUrl: remote });
    if (!repositoryResult.ok) throw new Error(repositoryResult.error.message);
    const repositoryId = repositoryResult.data.id;

    const draftResult = await page.evaluate(
      async ({ path, size }) =>
        window.designx!.knowledge.import({
          name: '支付域设计',
          type: '系统设计',
          scope: 'src/**',
          files: [
            {
              path,
              name: 'sample.md',
              extension: '.md',
              size,
            },
          ],
        }),
      { path: markdownPath, size: markdownSize },
    );
    if (!draftResult.ok) throw new Error(draftResult.error.message);
    packageId = draftResult.data.packageId;
    evidence =
      draftResult.data.references.find((item) => item.title === '幂等约束') ??
      draftResult.data.references[0];
    await page.reload();
    await page.getByRole('button', { name: '知识库' }).click();
    await page
      .getByRole('button', { name: '继续草稿 支付域设计' })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await captureDesktop(app, page, 'knowledge', 1586, 992);
    await page.getByRole('button', { name: '关闭' }).click();
    const publishResult = await page.evaluate(
      async (draft) =>
        window.designx!.knowledge.publish({
          packageId: draft.packageId,
          name: draft.name,
          type: draft.type,
          scope: draft.scope,
          skillMarkdown: draft.skillMarkdown,
        }),
      draftResult.data,
    );
    if (!publishResult.ok) throw new Error(publishResult.error.message);
    await page.reload();

    const firstTaskResult = await page.evaluate(
      async ({ repositoryId, knowledgeVersionId }) =>
        window.designx!.analysis.start({
          repositoryId,
          knowledgeVersionIds: [knowledgeVersionId],
          range: 'current',
          focus: '支付回调幂等',
        }),
      {
        repositoryId,
        knowledgeVersionId: `${packageId}@v1.0`,
      },
    );
    if (!firstTaskResult.ok) throw new Error(firstTaskResult.error.message);
    await waitForTask(page, firstTaskResult.data.id, 'completed');
    const firstSnapshot = await snapshot(page);
    expect(
      firstSnapshot.tasks.find((task) => task.id === firstTaskResult.data.id)
        ?.findingCount,
    ).toBe(1);
    await captureDesktop(app, page, 'analysis', 1586, 992);
    await captureDesktop(app, page, 'analysis', 1440, 900);
    await captureDesktop(app, page, 'analysis', 1280, 720);

    await page.getByRole('button', { name: '发现' }).click();
    await expect(
      page.getByRole('heading', { name: '支付回调缺少幂等校验' }),
    ).toBeVisible();
    await captureDesktop(app, page, 'findings', 1586, 992);
    await page.getByRole('button', { name: '忽略发现' }).click();
    await page
      .getByPlaceholder('例如：兼容旧版本协议，已纳入下一迭代…')
      .fill('E2E 验证忽略状态');
    await page.getByRole('button', { name: '确认忽略' }).click();
    await expect
      .poll(async () => (await snapshot(page)).findings[0]?.status)
      .toBe('ignored');

    const zeroResult = await page.evaluate(
      async ({ repositoryId, knowledgeVersionId }) =>
        window.designx!.analysis.start({
          repositoryId,
          knowledgeVersionIds: [knowledgeVersionId],
          range: 'baseline',
          focus: '',
        }),
      {
        repositoryId,
        knowledgeVersionId: `${packageId}@v1.0`,
      },
    );
    if (!zeroResult.ok) throw new Error(zeroResult.error.message);
    await waitForTask(page, zeroResult.data.id, 'completed');
    expect(
      (await snapshot(page)).tasks.find((task) => task.id === zeroResult.data.id)
        ?.findingCount,
    ).toBe(0);

    await writeFile(
      join(seed, 'src', 'payment.ts'),
      [
        'export function handlePayment(id: string) {',
        '  savePayment(id.trim());',
        '}',
        'function savePayment(_id: string) {}',
        '',
      ].join('\n'),
      'utf8',
    );
    await git(['add', '.'], seed);
    await git(['commit', '-m', 'change payment'], seed);
    await git(['push'], seed);
    const syncResult = await page.evaluate(
      async (id) => window.designx!.repositories.sync({ repositoryId: id }),
      repositoryId,
    );
    if (!syncResult.ok) throw new Error(syncResult.error.message);
    modelMode = 'fail';
    const failedResult = await page.evaluate(
      async ({ repositoryId, knowledgeVersionId }) =>
        window.designx!.analysis.start({
          repositoryId,
          knowledgeVersionIds: [knowledgeVersionId],
          range: 'baseline',
          focus: '支付变更',
        }),
      {
        repositoryId,
        knowledgeVersionId: `${packageId}@v1.0`,
      },
    );
    if (!failedResult.ok) throw new Error(failedResult.error.message);
    await waitForTask(page, failedResult.data.id, 'failed');
    modelMode = 'success';
    const retryResult = await page.evaluate(
      async (taskId) => window.designx!.analysis.retry({ taskId }),
      failedResult.data.id,
    );
    if (!retryResult.ok) throw new Error(retryResult.error.message);
    await waitForTask(page, failedResult.data.id, 'completed');

    await app.close();
    app = await launch();
    page = await app.firstWindow();
    monitorRenderer(page);
    await expect(page.getByRole('heading', { name: '新建分析' })).toBeVisible();
    const restored = await snapshot(page);
    expect(restored.repositories).toHaveLength(1);
    expect(restored.knowledgePackages[0]?.version).toBe('v1.0');
    expect(restored.findings.some((finding) => finding.status === 'ignored')).toBe(
      true,
    );
    expect(
      restored.tasks.some(
        (task) =>
          task.id === failedResult.data.id && task.status === 'completed',
      ),
    ).toBe(true);
    expect(rendererProblems).toEqual([]);
  } finally {
    await app.close().catch(() => undefined);
    await new Promise<void>((resolvePromise) =>
      modelServer.close(() => resolvePromise()),
    );
    await rm(root, { recursive: true, force: true });
  }
});
