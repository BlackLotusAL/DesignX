import {
  access,
  cp,
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, extname, join, resolve } from 'node:path';
import picomatch from 'picomatch';
import type {
  KnowledgeDraftView,
  KnowledgeImportInput,
  KnowledgePackageRecord,
  KnowledgeReferenceRecord,
  KnowledgeVersionRecord,
  PublishKnowledgeInput,
  SaveKnowledgeDraftInput,
  SelectedKnowledgeFile,
} from '../../../shared/types';
import { DesignXError } from '../../errors';
import { renameImmutableDirectory, writeJsonAtomic } from '../../persistence/atomic';
import type {
  StoredKnowledgeDraft,
  WorkspaceStore,
} from '../../persistence/workspace-store';
import { parseDocument } from './document-service';

export interface LoadedKnowledgeVersion {
  id: string;
  manifest: KnowledgeVersionRecord;
  skillMarkdown: string;
  references: Array<KnowledgeReferenceRecord & { markdown: string }>;
}

function slugify(value: string): string {
  const slug = value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'reference';
}

function uniqueSourceName(index: number, fileName: string): string {
  return `${String(index + 1).padStart(2, '0')}-${basename(fileName).replace(/[^\p{L}\p{N}._-]+/gu, '-')}`;
}

function versionAfter(versions: string[]): string {
  if (versions.length === 0) return 'v1.0';
  const latest = versions
    .map((version) => /^v(\d+)\.(\d+)$/.exec(version))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => ({ major: Number(match[1]), minor: Number(match[2]) }))
    .sort((a, b) => b.major - a.major || b.minor - a.minor)[0];
  return latest ? `v${latest.major}.${latest.minor + 1}` : 'v1.0';
}

function keywordsFor(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}_-]+/u)
        .filter((word) => word.length >= 2)
        .slice(0, 24),
    ),
  ];
}

function referenceMarkdown(reference: KnowledgeReferenceRecord, text: string): string {
  return [
    `# ${reference.title}`,
    '',
    `- 来源：\`${reference.sourcePath}\``,
    `- 位置：${reference.sourceLocation.label}`,
    '',
    text.trim(),
    '',
  ].join('\n');
}

function generateSkill(
  input: Pick<KnowledgeImportInput, 'name' | 'type' | 'scope'>,
  references: KnowledgeReferenceRecord[],
): string {
  return [
    `# ${input.name}`,
    '',
    `类型：${input.type}`,
    `适用范围：\`${input.scope}\``,
    '',
    '## 使用说明',
    '',
    '分析代码变更时，只引用与文件路径、模块和关注点相关的条目。结论必须同时给出代码位置与下列知识来源；证据不足时不要生成正式发现。',
    '',
    '## 约束索引',
    '',
    ...references.map(
      (reference) =>
        `- [${reference.title}](${reference.referencePath}) — ${reference.sourceLocation.label}`,
    ),
    '',
  ].join('\n');
}

export class KnowledgeService {
  private readonly authorizedFiles = new Map<string, number>();

  constructor(private readonly allowUnselectedFiles = false) {}

  authorizeFiles(files: SelectedKnowledgeFile[]): void {
    const expiresAt = Date.now() + 10 * 60_000;
    for (const file of files) this.authorizedFiles.set(resolve(file.path), expiresAt);
  }

  private verifyAuthorized(files: SelectedKnowledgeFile[]): void {
    if (this.allowUnselectedFiles) return;
    for (const file of files) {
      const expiresAt = this.authorizedFiles.get(resolve(file.path));
      if (!expiresAt || expiresAt < Date.now()) {
        throw new DesignXError({
          code: 'FILE_SELECTION_EXPIRED',
          stage: 'knowledge-import',
          message: '文件选择已失效，请重新选择文档。',
          retryable: true,
        });
      }
    }
  }

  async importDraft(
    store: WorkspaceStore,
    input: KnowledgeImportInput,
  ): Promise<KnowledgeDraftView> {
    this.verifyAuthorized(input.files);
    const actualSizes = await Promise.all(
      input.files.map(async (file) => {
        const metadata = await stat(file.path);
        if (!metadata.isFile()) {
          throw new DesignXError({
            code: 'KNOWLEDGE_SOURCE_NOT_FILE',
            stage: 'knowledge-import',
            message: `${file.name} 不是可读取文件。`,
            retryable: true,
          });
        }
        if (metadata.size > 25 * 1024 * 1024) {
          throw new DesignXError({
            code: 'KNOWLEDGE_FILE_LIMIT',
            stage: 'knowledge-import',
            message: `${file.name} 超过 25MB 单文件上限。`,
            retryable: true,
          });
        }
        return metadata.size;
      }),
    );
    if (actualSizes.reduce((total, size) => total + size, 0) > 100 * 1024 * 1024) {
      throw new DesignXError({
        code: 'KNOWLEDGE_BATCH_LIMIT',
        stage: 'knowledge-import',
        message: '本次文档总大小超过 100MB。',
        retryable: true,
      });
    }

    const packageId = randomUUID();
    const temporaryId = `${packageId}.tmp-${randomUUID()}`;
    const temporaryDirectory = store.knowledgePackageDirectory(temporaryId);
    const finalDirectory = store.knowledgePackageDirectory(packageId);
    const draftDirectory = join(temporaryDirectory, 'draft');
    const referencesDirectory = join(draftDirectory, 'references');
    const sourcesDirectory = join(draftDirectory, 'sources');
    try {
      await Promise.all([
        mkdir(referencesDirectory, { recursive: true }),
        mkdir(sourcesDirectory, { recursive: true }),
      ]);
      const references: KnowledgeReferenceRecord[] = [];
      const sourceFiles: string[] = [];
      for (let fileIndex = 0; fileIndex < input.files.length; fileIndex += 1) {
        const file = input.files[fileIndex];
        const sourceName = uniqueSourceName(fileIndex, file.name);
        const sourceRelativePath = `sources/${sourceName}`;
        const sourceTarget = join(sourcesDirectory, sourceName);
        await copyFile(file.path, sourceTarget);
        sourceFiles.push(sourceRelativePath);
        const parsed = await parseDocument(sourceTarget, file.name);
        for (let sectionIndex = 0; sectionIndex < parsed.sections.length; sectionIndex += 1) {
          const section = parsed.sections[sectionIndex];
          const referenceName = `${String(references.length + 1).padStart(3, '0')}-${slugify(section.title)}.md`;
          const reference: KnowledgeReferenceRecord = {
            id: randomUUID(),
            title: section.title,
            referencePath: `references/${referenceName}`,
            sourcePath: sourceRelativePath,
            sourceLocation: section.location,
            excerpt: section.text.slice(0, 2000),
            keywords: keywordsFor(`${section.title} ${section.text}`),
          };
          references.push(reference);
          await writeFile(
            join(referencesDirectory, referenceName),
            referenceMarkdown(reference, section.text),
            'utf8',
          );
        }
      }
      if (references.length === 0) {
        throw new DesignXError({
          code: 'KNOWLEDGE_CONTENT_EMPTY',
          stage: 'knowledge-import',
          message: '所选文档没有可生成知识引用的文本。',
          retryable: true,
        });
      }
      const skillMarkdown = generateSkill(input, references);
      const now = new Date().toISOString();
      const draft: StoredKnowledgeDraft = {
        schemaVersion: 1,
        packageId,
        name: input.name,
        type: input.type,
        scope: input.scope,
        skillMarkdown,
        references,
        sourceFiles,
        versionPreview: 'v1.0',
      };
      const record: KnowledgePackageRecord = {
        schemaVersion: 1,
        id: packageId,
        name: input.name,
        type: input.type,
        version: '草稿',
        status: 'draft',
        scope: input.scope,
        updatedAt: now,
        sourceFiles,
        publishedVersions: [],
        hasDraft: true,
      };
      await Promise.all([
        writeFile(join(draftDirectory, 'SKILL.md'), skillMarkdown, 'utf8'),
        writeJsonAtomic(join(draftDirectory, 'draft.json'), draft),
        writeJsonAtomic(join(temporaryDirectory, 'package.json'), record),
      ]);
      await rename(temporaryDirectory, finalDirectory);
      for (const file of input.files) this.authorizedFiles.delete(resolve(file.path));
      return draft;
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async saveDraft(
    store: WorkspaceStore,
    input: SaveKnowledgeDraftInput,
  ): Promise<KnowledgePackageRecord> {
    const record = await store.knowledgePackage(input.packageId);
    const draft = await store.knowledgeDraft(input.packageId);
    const updatedDraft: StoredKnowledgeDraft = {
      ...draft,
      name: input.name,
      type: input.type,
      scope: input.scope,
      skillMarkdown: input.skillMarkdown,
    };
    await Promise.all([
      writeFile(
        join(store.knowledgeDraftDirectory(input.packageId), 'SKILL.md'),
        input.skillMarkdown,
        'utf8',
      ),
      store.saveKnowledgeDraft(updatedDraft),
    ]);
    const updated: KnowledgePackageRecord = {
      ...record,
      name: input.name,
      type: input.type,
      scope: input.scope,
      version: updatedDraft.versionPreview,
      status: 'draft',
      updatedAt: new Date().toISOString(),
      hasDraft: true,
    };
    await store.saveKnowledgePackage(updated);
    return updated;
  }

  private async validateDraft(
    store: WorkspaceStore,
    input: PublishKnowledgeInput,
  ): Promise<StoredKnowledgeDraft> {
    if (!input.skillMarkdown.trim()) {
      throw new DesignXError({
        code: 'KNOWLEDGE_SKILL_EMPTY',
        stage: 'knowledge-publish',
        message: 'SKILL.md 不能为空。',
        retryable: true,
      });
    }
    try {
      picomatch(input.scope);
    } catch (error) {
      throw new DesignXError(
        {
          code: 'KNOWLEDGE_SCOPE_INVALID',
          stage: 'knowledge-publish',
          message: '适用范围不是有效的 glob 表达式。',
          retryable: true,
          detail: error instanceof Error ? error.message : undefined,
        },
        { cause: error },
      );
    }
    const draft = await store.knowledgeDraft(input.packageId);
    if (draft.references.length === 0 || draft.sourceFiles.length === 0) {
      throw new DesignXError({
        code: 'KNOWLEDGE_MAPPING_EMPTY',
        stage: 'knowledge-publish',
        message: '知识草稿缺少引用或来源映射。',
        retryable: false,
      });
    }
    for (const reference of draft.references) {
      if (
        !reference.referencePath.startsWith('references/') ||
        !reference.sourcePath.startsWith('sources/') ||
        !reference.sourceLocation.label
      ) {
        throw new DesignXError({
          code: 'KNOWLEDGE_MAPPING_INVALID',
          stage: 'knowledge-publish',
          message: `引用 ${reference.title} 的来源映射无效。`,
          retryable: false,
        });
      }
      await Promise.all([
        access(join(store.knowledgeDraftDirectory(input.packageId), reference.referencePath)),
        access(join(store.knowledgeDraftDirectory(input.packageId), reference.sourcePath)),
      ]);
    }
    return {
      ...draft,
      name: input.name,
      type: input.type,
      scope: input.scope,
      skillMarkdown: input.skillMarkdown,
    };
  }

  async publish(
    store: WorkspaceStore,
    input: PublishKnowledgeInput,
  ): Promise<KnowledgePackageRecord> {
    await this.saveDraft(store, input);
    const draft = await this.validateDraft(store, input);
    const record = await store.knowledgePackage(input.packageId);
    const version = versionAfter(record.publishedVersions);
    const versionsDirectory = join(
      store.knowledgePackageDirectory(input.packageId),
      'versions',
    );
    const temporaryDirectory = join(
      versionsDirectory,
      `.${version}.tmp-${randomUUID()}`,
    );
    const finalDirectory = store.knowledgeVersionDirectory(input.packageId, version);
    await mkdir(temporaryDirectory, { recursive: true });
    try {
      await Promise.all([
        cp(
          join(store.knowledgeDraftDirectory(input.packageId), 'references'),
          join(temporaryDirectory, 'references'),
          { recursive: true, errorOnExist: true },
        ),
        cp(
          join(store.knowledgeDraftDirectory(input.packageId), 'sources'),
          join(temporaryDirectory, 'sources'),
          { recursive: true, errorOnExist: true },
        ),
        writeFile(join(temporaryDirectory, 'SKILL.md'), input.skillMarkdown, 'utf8'),
      ]);
      const publishedAt = new Date().toISOString();
      const manifest: KnowledgeVersionRecord = {
        schemaVersion: 1,
        packageId: input.packageId,
        version,
        name: input.name,
        type: input.type,
        scope: input.scope,
        publishedAt,
        skillPath: 'SKILL.md',
        references: draft.references,
        sourceFiles: draft.sourceFiles,
      };
      await writeJsonAtomic(join(temporaryDirectory, 'manifest.json'), manifest);
      await renameImmutableDirectory(temporaryDirectory, finalDirectory);
      const updated: KnowledgePackageRecord = {
        ...record,
        name: input.name,
        type: input.type,
        scope: input.scope,
        version,
        status: 'published',
        updatedAt: publishedAt,
        sourceFiles: draft.sourceFiles,
        publishedVersions: [...record.publishedVersions, version],
        hasDraft: false,
      };
      await store.saveKnowledgePackage(updated);
      return updated;
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async createVersion(
    store: WorkspaceStore,
    packageId: string,
  ): Promise<KnowledgeDraftView> {
    const record = await store.knowledgePackage(packageId);
    if (record.hasDraft) return store.knowledgeDraft(packageId);
    const latest = record.publishedVersions.at(-1);
    if (!latest) {
      throw new DesignXError({
        code: 'KNOWLEDGE_VERSION_REQUIRED',
        stage: 'knowledge-create-version',
        message: '知识包尚未发布首个版本。',
        retryable: false,
      });
    }
    const versionDirectory = store.knowledgeVersionDirectory(packageId, latest);
    const manifest = await store.knowledgeVersion(packageId, latest);
    const skillMarkdown = await readFile(join(versionDirectory, 'SKILL.md'), 'utf8');
    const draftDirectory = store.knowledgeDraftDirectory(packageId);
    await rm(draftDirectory, { recursive: true, force: true });
    await mkdir(draftDirectory, { recursive: true });
    await Promise.all([
      cp(join(versionDirectory, 'references'), join(draftDirectory, 'references'), {
        recursive: true,
      }),
      cp(join(versionDirectory, 'sources'), join(draftDirectory, 'sources'), {
        recursive: true,
      }),
      writeFile(join(draftDirectory, 'SKILL.md'), skillMarkdown, 'utf8'),
    ]);
    const draft: StoredKnowledgeDraft = {
      schemaVersion: 1,
      packageId,
      name: manifest.name,
      type: manifest.type,
      scope: manifest.scope,
      skillMarkdown,
      references: manifest.references,
      sourceFiles: manifest.sourceFiles,
      versionPreview: versionAfter(record.publishedVersions),
    };
    await store.saveKnowledgeDraft(draft);
    await store.saveKnowledgePackage({
      ...record,
      status: 'draft',
      version: draft.versionPreview,
      hasDraft: true,
      updatedAt: new Date().toISOString(),
    });
    return draft;
  }

  async loadVersion(
    store: WorkspaceStore,
    versionId: string,
  ): Promise<LoadedKnowledgeVersion> {
    const manifest = await store.resolveKnowledgeVersionId(versionId);
    const directory = store.knowledgeVersionDirectory(
      manifest.packageId,
      manifest.version,
    );
    const skillMarkdown = await readFile(join(directory, manifest.skillPath), 'utf8');
    const references = await Promise.all(
      manifest.references.map(async (reference) => ({
        ...reference,
        markdown: await readFile(join(directory, reference.referencePath), 'utf8'),
      })),
    );
    return { id: versionId, manifest, skillMarkdown, references };
  }

  async verifyEvidence(
    store: WorkspaceStore,
    evidence: {
      packageId: string;
      version: string;
      referencePath: string;
      sourcePath: string;
      sourceLocation: string;
    },
  ): Promise<KnowledgeVersionRecord | null> {
    try {
      const manifest = await store.knowledgeVersion(
        evidence.packageId,
        evidence.version,
      );
      const reference = manifest.references.find(
        (item) =>
          item.referencePath === evidence.referencePath &&
          item.sourcePath === evidence.sourcePath &&
          item.sourceLocation.label === evidence.sourceLocation,
      );
      if (!reference) return null;
      const directory = store.knowledgeVersionDirectory(
        evidence.packageId,
        evidence.version,
      );
      await Promise.all([
        access(join(directory, reference.referencePath)),
        access(join(directory, reference.sourcePath)),
      ]);
      return manifest;
    } catch {
      return null;
    }
  }
}

export function supportedKnowledgeFile(filePath: string): boolean {
  return ['.md', '.pdf', '.docx'].includes(extname(filePath).toLowerCase());
}
