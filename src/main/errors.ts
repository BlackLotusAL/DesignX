import { ZodError } from 'zod';
import type { AppError, Result } from '../shared/types';

export class DesignXError extends Error {
  readonly code: string;
  readonly stage: string;
  readonly retryable: boolean;
  readonly detail?: string;

  constructor(input: AppError, options?: ErrorOptions) {
    super(input.message, options);
    this.name = 'DesignXError';
    this.code = input.code;
    this.stage = input.stage;
    this.retryable = input.retryable;
    this.detail = input.detail;
  }

  toAppError(): AppError {
    return {
      code: this.code,
      stage: this.stage,
      message: this.message,
      retryable: this.retryable,
      ...(this.detail ? { detail: this.detail } : {}),
    };
  }
}

export function toAppError(error: unknown, fallbackStage = 'unknown'): AppError {
  if (error instanceof DesignXError) return error.toAppError();
  if (error instanceof ZodError) {
    return {
      code: 'INVALID_INPUT',
      stage: fallbackStage,
      message: '输入内容不符合要求。',
      retryable: true,
      detail: error.issues.map((issue) => issue.message).join('；'),
    };
  }
  if (error instanceof Error) {
    return {
      code: 'UNEXPECTED_ERROR',
      stage: fallbackStage,
      message: error.message || '发生未预期错误。',
      retryable: true,
    };
  }
  return {
    code: 'UNEXPECTED_ERROR',
    stage: fallbackStage,
    message: '发生未预期错误。',
    retryable: true,
  };
}

export async function asResult<T>(
  stage: string,
  operation: () => Promise<T>,
): Promise<Result<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    return { ok: false, error: toAppError(error, stage) };
  }
}
