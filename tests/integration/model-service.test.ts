import { createServer, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ModelService,
  type ModelConnection,
} from '../../src/main/services/model/model-service';

const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
});

function chatResponse(content: unknown) {
  return JSON.stringify({
    choices: [{ message: { content: JSON.stringify(content) } }],
  });
}

async function localhostServer(
  handler: (
    body: Record<string, unknown>,
    response: ServerResponse,
    requestNumber: number,
  ) => void,
) {
  let requestNumber = 0;
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      requestNumber += 1;
      handler(JSON.parse(body) as Record<string, unknown>, response, requestNumber);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  return {
    url: `http://127.0.0.1:${address.port}`,
    get requestCount() {
      return requestNumber;
    },
  };
}

function connection(baseUrl: string): ModelConnection {
  return {
    baseUrl,
    model: 'test-model',
    credential: 'test-key',
    timeoutSeconds: 2,
  };
}

describe('ModelService localhost integration', () => {
  it('falls back from json_schema and caches json_object capability', async () => {
    const formats: unknown[] = [];
    const endpoint = await localhostServer((body, response, requestNumber) => {
      formats.push(body.response_format);
      if (requestNumber === 1) {
        response.statusCode = 400;
        response.end('response_format json_schema is unsupported');
        return;
      }
      response.setHeader('Content-Type', 'application/json');
      response.end(chatResponse({ findings: [] }));
    });
    const service = new ModelService({
      fetch,
      allowLocalhostHttp: true,
    });
    await expect(service.analyze(connection(endpoint.url), 'test')).resolves.toEqual({
      findings: [],
    });
    await service.analyze(connection(endpoint.url), 'second');
    expect(endpoint.requestCount).toBe(3);
    expect(formats[0]).toMatchObject({ type: 'json_schema' });
    expect(formats[1]).toEqual({ type: 'json_object' });
    expect(formats[2]).toEqual({ type: 'json_object' });
  });

  it('performs one local-schema repair request', async () => {
    const endpoint = await localhostServer((_body, response, requestNumber) => {
      response.setHeader('Content-Type', 'application/json');
      response.end(
        requestNumber === 1
          ? chatResponse({ findings: [{ title: 'incomplete' }] })
          : chatResponse({ findings: [] }),
      );
    });
    const service = new ModelService({ fetch, allowLocalhostHttp: true });
    await expect(service.analyze(connection(endpoint.url), 'test')).resolves.toEqual({
      findings: [],
    });
    expect(endpoint.requestCount).toBe(2);
  });

  it.each([
    [401, 'MODEL_AUTH_FAILED'],
    [500, 'MODEL_HTTP_500'],
  ])('maps HTTP %s to an actionable error', async (status, code) => {
    const endpoint = await localhostServer((_body, response) => {
      response.statusCode = status;
      response.end('failure');
    });
    const service = new ModelService({ fetch, allowLocalhostHttp: true });
    await expect(service.analyze(connection(endpoint.url), 'test')).rejects.toMatchObject({
      code,
    });
  });

  it('aborts a timed-out request', async () => {
    const endpoint = await localhostServer((_body, response) => {
      setTimeout(() => {
        if (!response.destroyed) response.end(chatResponse({ findings: [] }));
      }, 150);
    });
    const service = new ModelService({ fetch, allowLocalhostHttp: true });
    await expect(
      service.analyze(
        { ...connection(endpoint.url), timeoutSeconds: 0.02 },
        'test',
      ),
    ).rejects.toMatchObject({ code: 'MODEL_TIMEOUT' });
  });
});
