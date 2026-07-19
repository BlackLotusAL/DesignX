import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../src/main/services/knowledge/document-service';

describe('Markdown document parser', () => {
  it('preserves heading sections and line locations', async () => {
    const path = resolve('tests/fixtures/knowledge/sample.md');
    const parsed = await parseDocument(path, 'sample.md');

    expect(await readFile(path, 'utf8')).toContain('幂等约束');
    expect(parsed.sections.map((section) => section.title)).toContain('幂等约束');
    const section = parsed.sections.find((item) => item.title === '幂等约束');
    expect(section?.location.kind).toBe('lines');
    expect(section?.location.start).toBeGreaterThan(1);
    expect(section?.text).toContain('唯一业务键');
  });
});
