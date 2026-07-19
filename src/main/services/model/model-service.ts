import {
  modelFindingEnvelopeSchema,
  modelFindingJsonSchema,
} from '../../../shared/schemas';
import type { ModelFindingEnvelope } from '../../../shared/types';
import { DesignXError } from '../../errors';

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface ModelConnection {
  baseUrl: string;
  model: string;
  credential: string;
  timeoutSeconds: number;
  cachedMode?: 'json_schema' | 'json_object';
}

interface ModelServiceOptions {
  fetch: FetchLike;
  allowLocalhostHttp: boolean;
  cacheMode?: (
    normalizedBaseUrl: string,
    mode: 'json_schema' | 'json_object',
  ) => Promise<void>;
}

class ModelHttpError extends DesignXError {
  constructor(
    readonly status: number,
    readonly responseBody: string,
  ) {
    const unauthorized = status === 401 || status === 403;
    super({
      code: unauthorized ? 'MODEL_AUTH_FAILED' : `MODEL_HTTP_${status}`,
      stage: '模型分析',
      message: unauthorized
        ? '模型凭据无效或无权访问该模型。'
        : `模型服务返回 HTTP ${status}。`,
      retryable: !unauthorized,
      detail: responseBody.slice(0, 1000),
    });
  }
}

export function normalizeModelBaseUrl(
  rawValue: string,
  allowLocalhostHttp: boolean,
): string {
  let url: URL;
  try {
    url = new URL(rawValue.trim());
  } catch (error) {
    throw new DesignXError(
      {
        code: 'MODEL_URL_INVALID',
        stage: 'model-settings',
        message: '模型 API 地址不是有效 URL。',
        retryable: true,
      },
      { cause: error },
    );
  }
  const localhost =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]' ||
    url.hostname === '::1';
  if (url.protocol !== 'https:' && !(allowLocalhostHttp && localhost && url.protocol === 'http:')) {
    throw new DesignXError({
      code: 'MODEL_URL_HTTPS_REQUIRED',
      stage: 'model-settings',
      message: '模型 API 地址必须使用 HTTPS；开发与测试仅允许 localhost 使用 HTTP。',
      retryable: true,
    });
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new DesignXError({
      code: 'MODEL_URL_UNSUPPORTED',
      stage: 'model-settings',
      message: '模型 API 地址不能包含凭据、查询参数或片段。',
      retryable: true,
    });
  }
  const normalizedPath = url.pathname
    .replace(/\/+$/, '')
    .replace(/\/v1$/i, '');
  return `${url.origin}${normalizedPath}`;
}

function parseAssistantJson(content: string): unknown {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  try {
    return JSON.parse(withoutFence);
  } catch (error) {
    throw new DesignXError(
      {
        code: 'MODEL_OUTPUT_NOT_JSON',
        stage: '结构校验',
        message: '模型输出不是有效 JSON。',
        retryable: true,
      },
      { cause: error },
    );
  }
}

export class ModelService {
  private readonly modeCache = new Map<
    string,
    'json_schema' | 'json_object'
  >();

  constructor(private readonly options: ModelServiceOptions) {}

  private async send(
    connection: ModelConnection,
    normalizedBaseUrl: string,
    mode: 'json_schema' | 'json_object',
    messages: Array<{ role: 'system' | 'user'; content: string }>,
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      connection.timeoutSeconds * 1000,
    );
    try {
      const response = await this.options.fetch(
        `${normalizedBaseUrl}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${connection.credential}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: connection.model,
            messages,
            temperature: 0,
            response_format:
              mode === 'json_schema'
                ? {
                    type: 'json_schema',
                    json_schema: {
                      name: 'designx_findings',
                      strict: true,
                      schema: modelFindingJsonSchema,
                    },
                  }
                : { type: 'json_object' },
          }),
          signal: controller.signal,
        },
      );
      const body = await response.text();
      if (!response.ok) throw new ModelHttpError(response.status, body);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch (error) {
        throw new DesignXError(
          {
            code: 'MODEL_RESPONSE_INVALID',
            stage: '模型分析',
            message: '模型服务响应不是有效 JSON。',
            retryable: true,
          },
          { cause: error },
        );
      }
      const content =
        typeof parsed === 'object' &&
        parsed !== null &&
        'choices' in parsed &&
        Array.isArray(parsed.choices) &&
        typeof parsed.choices[0]?.message?.content === 'string'
          ? parsed.choices[0].message.content
          : null;
      if (!content) {
        throw new DesignXError({
          code: 'MODEL_RESPONSE_EMPTY',
          stage: '模型分析',
          message: '模型服务没有返回可解析内容。',
          retryable: true,
        });
      }
      return content;
    } catch (error) {
      if (error instanceof ModelHttpError || error instanceof DesignXError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new DesignXError({
          code: 'MODEL_TIMEOUT',
          stage: '模型分析',
          message: `模型请求超过 ${connection.timeoutSeconds} 秒，已停止等待。`,
          retryable: true,
        });
      }
      throw new DesignXError(
        {
          code: 'MODEL_NETWORK_FAILED',
          stage: '模型分析',
          message: '无法连接模型服务，请检查地址、系统代理和企业网络。',
          retryable: true,
          detail: error instanceof Error ? error.message : undefined,
        },
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private isUnsupportedSchema(error: unknown): boolean {
    return (
      error instanceof ModelHttpError &&
      [400, 404, 422].includes(error.status) &&
      /response[_ -]?format|json[_ -]?schema|structured/i.test(error.responseBody)
    );
  }

  async analyze(
    connection: ModelConnection,
    prompt: string,
  ): Promise<ModelFindingEnvelope> {
    if (!connection.credential) {
      throw new DesignXError({
        code: 'MODEL_CREDENTIAL_REQUIRED',
        stage: '模型分析',
        message: '尚未配置模型 API 凭据。',
        retryable: true,
      });
    }
    const normalizedBaseUrl = normalizeModelBaseUrl(
      connection.baseUrl,
      this.options.allowLocalhostHttp,
    );
    let mode =
      connection.cachedMode ??
      this.modeCache.get(normalizedBaseUrl) ??
      'json_schema';
    const systemMessage = [
      '你是 DesignX 一致性分析器。',
      '只输出符合指定结构的 JSON。',
      '每条发现必须引用输入中真实存在的代码文件、行号、Commit、知识 packageId、version、referencePath、sourcePath 和 sourceLocation。',
      '缺少任一侧证据时不要输出正式发现。',
      '将已知事实与模型推断分开，修改建议必须可执行。',
    ].join('\n');

    let content: string;
    try {
      content = await this.send(connection, normalizedBaseUrl, mode, [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt },
      ]);
    } catch (error) {
      if (mode !== 'json_schema' || !this.isUnsupportedSchema(error)) throw error;
      mode = 'json_object';
      this.modeCache.set(normalizedBaseUrl, mode);
      await this.options.cacheMode?.(normalizedBaseUrl, mode);
      content = await this.send(connection, normalizedBaseUrl, mode, [
        {
          role: 'system',
          content: `${systemMessage}\n根对象必须是 {"findings": [...]}。`,
        },
        { role: 'user', content: prompt },
      ]);
    }

    let parsed = modelFindingEnvelopeSchema.safeParse(parseAssistantJson(content));
    if (!parsed.success) {
      const repaired = await this.send(connection, normalizedBaseUrl, mode, [
        {
          role: 'system',
          content: `${systemMessage}\n修复下列 JSON，使其严格符合 findings 结构；不要添加输入中没有的证据。`,
        },
        {
          role: 'user',
          content: `校验错误：${parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ')}\n待修复输出：\n${content}`,
        },
      ]);
      parsed = modelFindingEnvelopeSchema.safeParse(parseAssistantJson(repaired));
    }
    if (!parsed.success) {
      throw new DesignXError({
        code: 'MODEL_OUTPUT_SCHEMA_INVALID',
        stage: '结构校验',
        message: '模型输出在一次修复后仍不符合发现结构。',
        retryable: true,
        detail: parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('；')
          .slice(0, 2000),
      });
    }
    if (mode === 'json_schema' && connection.cachedMode !== 'json_schema') {
      this.modeCache.set(normalizedBaseUrl, mode);
      await this.options.cacheMode?.(normalizedBaseUrl, mode);
    }
    return parsed.data;
  }

  async testConnection(
    connection: ModelConnection,
  ): Promise<{ latencyMs: number; model: string }> {
    const startedAt = Date.now();
    await this.analyze(
      connection,
      '这是连接测试。不要生成发现，返回 {"findings":[]}。',
    );
    return { latencyMs: Date.now() - startedAt, model: connection.model };
  }
}
