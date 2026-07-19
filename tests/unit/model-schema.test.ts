import { describe, expect, it } from 'vitest';
import { modelFindingEnvelopeSchema } from '../../src/shared/schemas';
import { normalizeModelBaseUrl } from '../../src/main/services/model/model-service';

describe('model schema and endpoint policy', () => {
  it('normalizes base URLs without duplicating /v1', () => {
    expect(normalizeModelBaseUrl('https://model.example/v1/', false)).toBe(
      'https://model.example',
    );
    expect(normalizeModelBaseUrl('http://127.0.0.1:4010/v1', true)).toBe(
      'http://127.0.0.1:4010',
    );
  });

  it('rejects insecure non-local endpoints', () => {
    expect(() =>
      normalizeModelBaseUrl('http://model.internal.example', true),
    ).toThrow(/必须使用 HTTPS/);
  });

  it('rejects findings without complete evidence', () => {
    const result = modelFindingEnvelopeSchema.safeParse({
      findings: [
        {
          title: '缺少知识证据',
          type: '系统设计一致性',
          severity: 'high',
          confidence: 90,
          file: 'src/a.ts',
          line: 10,
          symbol: 'run',
          knownFact: '事实',
          inference: '推断',
          suggestions: ['修复'],
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
