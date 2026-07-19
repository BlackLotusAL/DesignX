import { appendFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

export interface LogRecord {
  taskId?: string;
  repositoryId?: string;
  stage: string;
  durationMs?: number;
  errorCode?: string;
  level?: 'info' | 'warn' | 'error';
}

export class LogService {
  private readonly directory: string;

  constructor(designxDirectory: string) {
    this.directory = join(designxDirectory, 'logs');
  }

  async append(record: LogRecord): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    await appendFile(
      join(this.directory, `${day}.jsonl`),
      `${JSON.stringify({
        timestamp: now.toISOString(),
        level: record.level ?? 'info',
        taskId: record.taskId,
        repositoryId: record.repositoryId,
        stage: record.stage,
        durationMs: record.durationMs,
        errorCode: record.errorCode,
      })}\n`,
      'utf8',
    );
  }

  async prune(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 7);
    const cutoffDay = cutoff.toISOString().slice(0, 10);
    const files = await readdir(this.directory);
    await Promise.all(
      files
        .filter((file) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file))
        .filter((file) => file.slice(0, 10) < cutoffDay)
        .map((file) => rm(join(this.directory, file), { force: true })),
    );
  }
}
