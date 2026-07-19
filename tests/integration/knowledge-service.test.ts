import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
} from 'docx';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceStore } from '../../src/main/persistence/workspace-store';
import { KnowledgeService } from '../../src/main/services/knowledge/knowledge-service';
import type { SelectedKnowledgeFile } from '../../src/shared/types';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function selectedFile(
  path: string,
  extension: SelectedKnowledgeFile['extension'],
): Promise<SelectedKnowledgeFile> {
  return {
    path,
    name: path.split(/[\\/]/).at(-1) ?? path,
    extension,
    size: (await stat(path)).size,
  };
}

describe('KnowledgeService', () => {
  it('imports MD/PDF/DOCX and publishes immutable minor versions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'designx-knowledge-'));
    temporaryDirectories.push(root);
    const store = new WorkspaceStore(root);
    await store.initialize();
    const sourceDirectory = join(root, 'sources');
    const markdownPath = resolve('tests/fixtures/knowledge/sample.md');
    const pdfPath = join(sourceDirectory, 'idempotency.pdf');
    const docxPath = join(sourceDirectory, 'design.docx');
    await import('node:fs/promises').then(({ mkdir }) =>
      mkdir(sourceDirectory, { recursive: true }),
    );

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([600, 800]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText('Payment callbacks require a unique idempotency key.', {
      x: 50,
      y: 740,
      size: 12,
      font,
    });
    await writeFile(pdfPath, await pdf.save());

    const document = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: 'Payment module design',
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph('Every callback state must remain traceable.'),
          ],
        },
      ],
    });
    await writeFile(docxPath, await Packer.toBuffer(document));

    const service = new KnowledgeService(true);
    const draft = await service.importDraft(store, {
      name: '支付域设计',
      type: '系统设计',
      scope: '**/*.ts',
      files: [
        await selectedFile(markdownPath, '.md'),
        await selectedFile(pdfPath, '.pdf'),
        await selectedFile(docxPath, '.docx'),
      ],
    });
    expect(draft.references.length).toBeGreaterThanOrEqual(4);
    expect(draft.references.some((item) => item.sourceLocation.kind === 'pages')).toBe(
      true,
    );
    expect(
      draft.references.some((item) => item.sourceLocation.kind === 'paragraphs'),
    ).toBe(true);

    const first = await service.publish(store, {
      packageId: draft.packageId,
      name: draft.name,
      type: draft.type,
      scope: draft.scope,
      skillMarkdown: draft.skillMarkdown,
    });
    expect(first.version).toBe('v1.0');
    const firstSkill = await readFile(
      join(store.knowledgeVersionDirectory(draft.packageId, 'v1.0'), 'SKILL.md'),
      'utf8',
    );

    const nextDraft = await service.createVersion(store, draft.packageId);
    expect(nextDraft.versionPreview).toBe('v1.1');
    const second = await service.publish(store, {
      packageId: nextDraft.packageId,
      name: nextDraft.name,
      type: nextDraft.type,
      scope: nextDraft.scope,
      skillMarkdown: `${nextDraft.skillMarkdown}\n## 新约束\n\n不得重复写入。\n`,
    });
    expect(second.publishedVersions).toEqual(['v1.0', 'v1.1']);
    await expect(
      readFile(
        join(store.knowledgeVersionDirectory(draft.packageId, 'v1.0'), 'SKILL.md'),
        'utf8',
      ),
    ).resolves.toBe(firstSkill);
  });
});
