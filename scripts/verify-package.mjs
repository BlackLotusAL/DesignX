import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { _electron as electron } from '@playwright/test';

const packageMetadata = JSON.parse(
  await readFile(resolve('package.json'), 'utf8'),
);
const { version } = packageMetadata;
if (typeof version !== 'string' || version.length === 0) {
  throw new Error('Package version is missing');
}

const artifacts = [
  resolve(`release/DesignX-Setup-${version}-x64.exe`),
  resolve(`release/DesignX-Portable-${version}-x64.exe`),
  resolve('release/win-unpacked/DesignX.exe'),
];

for (const artifact of artifacts) {
  const metadata = await stat(artifact);
  if (!metadata.isFile() || metadata.size === 0) {
    throw new Error(`Package artifact is empty: ${artifact}`);
  }
}

async function verifyExecutable(executablePath, label) {
  const userData = await mkdtemp(join(tmpdir(), `designx-${label}-`));
  const application = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${userData}`],
    timeout: 45_000,
  });
  try {
    const page = await application.firstWindow();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.getByRole('heading', { name: '选择本地工作区' }).waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    if (errors.length > 0) {
      throw new Error(`${label} renderer errors: ${errors.join('; ')}`);
    }
  } finally {
    await application.close();
    await rm(userData, { recursive: true, force: true });
  }
}

async function verifyPortable(executablePath) {
  const userData = await mkdtemp(join(tmpdir(), 'designx-portable-'));
  try {
    const exitCode = await new Promise((resolvePromise, reject) => {
      const child = spawn(
        executablePath,
        [
          '--designx-package-verify',
          `--user-data-dir=${userData}`,
        ],
        {
          windowsHide: true,
          stdio: 'ignore',
        },
      );
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('Portable package did not finish launch verification'));
      }, 45_000);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        resolvePromise(code);
      });
    });
    if (exitCode !== 0) {
      throw new Error(`Portable package exited with code ${exitCode}`);
    }
  } finally {
    await rm(userData, { recursive: true, force: true });
  }
}

await verifyExecutable(artifacts[2], 'unpacked');
await verifyPortable(artifacts[1]);
