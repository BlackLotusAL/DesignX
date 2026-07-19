import { z } from 'zod';

const pathText = z.string().trim().min(1).max(4096);
const identifier = z.string().trim().min(1).max(200);

export const addRepositoryInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[\p{L}\p{N}._-]+$/u, '名称只能包含字母、数字、点、横线或下划线'),
  remoteUrl: z.string().trim().min(1).max(2048),
  branch: z.string().trim().min(1).max(200),
});

export const repositoryIdSchema = z.object({ repositoryId: identifier });
export const taskIdSchema = z.object({ taskId: identifier });
export const packageIdSchema = z.object({ packageId: identifier });
export const workspacePathSchema = z.object({ path: pathText });

export const selectedKnowledgeFileSchema = z.object({
  path: pathText,
  name: z.string().trim().min(1).max(260),
  extension: z.enum(['.md', '.pdf', '.docx']),
  size: z.number().int().nonnegative().max(25 * 1024 * 1024),
});

export const knowledgeTypeSchema = z.enum(['业务需求', '系统设计', '编程规范']);

export const knowledgeImportInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: knowledgeTypeSchema,
  scope: z.string().trim().min(1).max(500),
  files: z
    .array(selectedKnowledgeFileSchema)
    .min(1)
    .max(20)
    .refine(
      (files) => files.reduce((total, file) => total + file.size, 0) <= 100 * 1024 * 1024,
      '一次导入的文件总大小不能超过 100MB',
    ),
});

export const saveKnowledgeDraftInputSchema = z.object({
  packageId: identifier,
  name: z.string().trim().min(1).max(120),
  type: knowledgeTypeSchema,
  scope: z.string().trim().min(1).max(500),
  skillMarkdown: z.string().trim().min(1).max(2_000_000),
});

export const publishKnowledgeInputSchema = saveKnowledgeDraftInputSchema;

export const startAnalysisInputSchema = z.object({
  repositoryId: identifier,
  knowledgeVersionIds: z.array(identifier).min(1).max(20),
  range: z.enum(['baseline', 'current', 'recent10']),
  focus: z.string().trim().max(4000),
});

export const ignoreFindingInputSchema = z.object({
  findingId: identifier,
  reason: z.string().trim().max(2000),
});

export const saveSettingsInputSchema = z.object({
  apiUrl: z.string().trim().min(1).max(2048),
  model: z.string().trim().min(1).max(200),
  timeout: z.number().int().min(10).max(600),
  credential: z.string().max(20_000).optional(),
  clearCredential: z.boolean().optional(),
});

export const testModelInputSchema = saveSettingsInputSchema;

export const modelKnowledgeEvidenceSchema = z.object({
  packageId: identifier,
  version: z.string().trim().regex(/^v\d+\.\d+$/),
  section: z.string().trim().min(1).max(500),
  referencePath: pathText,
  sourcePath: pathText,
  sourceLocation: z.string().trim().min(1).max(200),
  excerpt: z.string().trim().min(1).max(10_000),
});

export const modelFindingSchema = z.object({
  title: z.string().trim().min(1).max(500),
  type: z.enum(['代码质量', '编程规范', '业务需求一致性', '系统设计一致性']),
  severity: z.enum(['high', 'medium', 'low']),
  confidence: z.number().int().min(0).max(100),
  file: pathText,
  line: z.number().int().positive(),
  symbol: z.string().trim().max(500),
  knownFact: z.string().trim().min(1).max(20_000),
  inference: z.string().trim().min(1).max(20_000),
  knowledge: modelKnowledgeEvidenceSchema,
  suggestions: z.array(z.string().trim().min(1).max(5000)).min(1).max(10),
});

export const modelFindingEnvelopeSchema = z.object({
  findings: z.array(modelFindingSchema).max(200),
});

export const modelFindingJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      maxItems: 200,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'type',
          'severity',
          'confidence',
          'file',
          'line',
          'symbol',
          'knownFact',
          'inference',
          'knowledge',
          'suggestions',
        ],
        properties: {
          title: { type: 'string' },
          type: {
            type: 'string',
            enum: ['代码质量', '编程规范', '业务需求一致性', '系统设计一致性'],
          },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          confidence: { type: 'integer', minimum: 0, maximum: 100 },
          file: { type: 'string' },
          line: { type: 'integer', minimum: 1 },
          symbol: { type: 'string' },
          knownFact: { type: 'string' },
          inference: { type: 'string' },
          knowledge: {
            type: 'object',
            additionalProperties: false,
            required: [
              'packageId',
              'version',
              'section',
              'referencePath',
              'sourcePath',
              'sourceLocation',
              'excerpt',
            ],
            properties: {
              packageId: { type: 'string' },
              version: { type: 'string' },
              section: { type: 'string' },
              referencePath: { type: 'string' },
              sourcePath: { type: 'string' },
              sourceLocation: { type: 'string' },
              excerpt: { type: 'string' },
            },
          },
          suggestions: {
            type: 'array',
            minItems: 1,
            maxItems: 10,
            items: { type: 'string' },
          },
        },
      },
    },
  },
} as const;
