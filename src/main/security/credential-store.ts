import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { SafeStorage } from 'electron';
import { DesignXError } from '../errors';
import { writeJsonAtomic } from '../persistence/atomic';

interface CredentialFile {
  schemaVersion: 1;
  apiKey: string;
}

export class CredentialStore {
  private readonly filePath: string;

  constructor(
    userDataPath: string,
    private readonly safeStorage: Pick<
      SafeStorage,
      'isEncryptionAvailable' | 'encryptString' | 'decryptString'
    >,
    private readonly developmentCredential?: string,
  ) {
    this.filePath = join(userDataPath, 'credentials.json');
  }

  async isConfigured(): Promise<boolean> {
    if (this.developmentCredential) return true;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as CredentialFile;
      return parsed.schemaVersion === 1 && Boolean(parsed.apiKey);
    } catch {
      return false;
    }
  }

  async get(): Promise<string | null> {
    if (this.developmentCredential) return this.developmentCredential;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as CredentialFile;
      if (parsed.schemaVersion !== 1 || !parsed.apiKey) return null;
      return this.safeStorage.decryptString(Buffer.from(parsed.apiKey, 'base64'));
    } catch (error) {
      throw new DesignXError(
        {
          code: 'CREDENTIAL_READ_FAILED',
          stage: 'credential-read',
          message: '无法读取已保存的模型凭据，请重新保存凭据。',
          retryable: true,
          detail: error instanceof Error ? error.message : undefined,
        },
        { cause: error },
      );
    }
  }

  async set(value: string): Promise<void> {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new DesignXError({
        code: 'CREDENTIAL_ENCRYPTION_UNAVAILABLE',
        stage: 'credential-save',
        message: 'Windows 凭据加密当前不可用，凭据未保存。',
        retryable: true,
      });
    }
    await mkdir(dirname(this.filePath), { recursive: true });
    const encrypted = this.safeStorage.encryptString(value);
    await writeJsonAtomic(this.filePath, {
      schemaVersion: 1,
      apiKey: encrypted.toString('base64'),
    } satisfies CredentialFile);
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
}
