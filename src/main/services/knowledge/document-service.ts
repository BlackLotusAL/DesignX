import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import mammoth from 'mammoth';
import type { SourceLocation } from '../../../shared/types';
import { DesignXError } from '../../errors';

export interface ParsedSection {
  title: string;
  text: string;
  location: SourceLocation;
}

export interface ParsedDocument {
  fileName: string;
  sections: ParsedSection[];
  plainText: string;
}

function compactText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseMarkdown(fileName: string, markdown: string): ParsedDocument {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const headings = lines
    .map((line, index) => {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      return match
        ? { line: index + 1, level: match[1].length, title: match[2].trim() }
        : null;
    })
    .filter((heading): heading is NonNullable<typeof heading> => Boolean(heading));
  const sections: ParsedSection[] = [];
  if (headings.length === 0) {
    const text = compactText(markdown);
    if (text) {
      sections.push({
        title: fileName,
        text,
        location: {
          kind: 'lines',
          start: 1,
          end: Math.max(1, lines.length),
          label: `第 1–${Math.max(1, lines.length)} 行`,
        },
      });
    }
  } else {
    for (let index = 0; index < headings.length; index += 1) {
      const heading = headings[index];
      const next = headings[index + 1];
      const end = next ? next.line - 1 : lines.length;
      const text = compactText(lines.slice(heading.line - 1, end).join('\n'));
      if (!text) continue;
      sections.push({
        title: heading.title,
        text,
        location: {
          kind: 'lines',
          start: heading.line,
          end,
          label: `第 ${heading.line}–${end} 行`,
        },
      });
    }
  }
  return { fileName, sections, plainText: compactText(markdown) };
}

async function parsePdf(filePath: string, fileName: string): Promise<ParsedDocument> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(await readFile(filePath));
  const document = await pdfjs.getDocument({
    data,
    useWorkerFetch: false,
  }).promise;
  const sections: ParsedSection[] = [];
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = compactText(
      textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' '),
    );
    pages.push(text);
    if (text) {
      const firstSentence = text.split(/[。！？.!?]\s*/)[0]?.slice(0, 80);
      sections.push({
        title: firstSentence || `${fileName} 第 ${pageNumber} 页`,
        text,
        location: {
          kind: 'pages',
          start: pageNumber,
          end: pageNumber,
          label: `第 ${pageNumber} 页`,
        },
      });
    }
  }
  const plainText = compactText(pages.join('\n\n'));
  if (!plainText) {
    throw new DesignXError({
      code: 'PDF_TEXT_NOT_FOUND',
      stage: 'knowledge-parse',
      message: `${fileName} 没有可提取文本；扫描型 PDF 暂不支持 OCR。`,
      retryable: true,
    });
  }
  return { fileName, sections, plainText };
}

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

async function parseDocx(filePath: string, fileName: string): Promise<ParsedDocument> {
  const [{ value: html }, { value: rawText }] = await Promise.all([
    mammoth.convertToHtml({ path: filePath }),
    mammoth.extractRawText({ path: filePath }),
  ]);
  const blocks = [...html.matchAll(/<(h[1-6]|p)[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => ({
      tag: match[1].toLowerCase(),
      text: decodeHtml(match[2]),
    }))
    .filter((block) => block.text);
  const sections: ParsedSection[] = [];
  let currentTitle = fileName;
  let paragraphStart = 1;
  let paragraphs: string[] = [];
  let paragraphNumber = 0;

  const flush = () => {
    if (paragraphs.length === 0) return;
    sections.push({
      title: currentTitle,
      text: compactText(paragraphs.join('\n\n')),
      location: {
        kind: 'paragraphs',
        start: paragraphStart,
        end: paragraphNumber,
        label: `第 ${paragraphStart}–${paragraphNumber} 段`,
      },
    });
    paragraphs = [];
  };

  for (const block of blocks) {
    if (block.tag.startsWith('h')) {
      flush();
      currentTitle = block.text;
      paragraphStart = paragraphNumber + 1;
      continue;
    }
    paragraphNumber += 1;
    if (paragraphs.length === 0) paragraphStart = paragraphNumber;
    paragraphs.push(block.text);
  }
  flush();
  const plainText = compactText(rawText);
  if (!plainText) {
    throw new DesignXError({
      code: 'DOCX_TEXT_NOT_FOUND',
      stage: 'knowledge-parse',
      message: `${fileName} 没有可提取文本。`,
      retryable: true,
    });
  }
  if (sections.length === 0) {
    sections.push({
      title: fileName,
      text: plainText,
      location: {
        kind: 'paragraphs',
        start: 1,
        end: Math.max(1, paragraphNumber),
        label: `第 1–${Math.max(1, paragraphNumber)} 段`,
      },
    });
  }
  return { fileName, sections, plainText };
}

export async function parseDocument(
  filePath: string,
  fileName: string,
): Promise<ParsedDocument> {
  const extension = extname(fileName).toLowerCase();
  try {
    if (extension === '.md') {
      return parseMarkdown(fileName, await readFile(filePath, 'utf8'));
    }
    if (extension === '.pdf') return await parsePdf(filePath, fileName);
    if (extension === '.docx') return await parseDocx(filePath, fileName);
    throw new DesignXError({
      code: 'UNSUPPORTED_DOCUMENT',
      stage: 'knowledge-parse',
      message: `不支持 ${extension || '未知'} 格式。`,
      retryable: true,
    });
  } catch (error) {
    if (error instanceof DesignXError) throw error;
    throw new DesignXError(
      {
        code: 'DOCUMENT_PARSE_FAILED',
        stage: 'knowledge-parse',
        message: `${fileName} 解析失败。`,
        retryable: true,
        detail: error instanceof Error ? error.message : undefined,
      },
      { cause: error },
    );
  }
}
