/**
 * Build preview markdown + OCR appendix for persisted inline images.
 */

const OCR_APPENDIX_HEADER = '【文内图片识别】';
const STORAGE_IMAGE_RE = /!\[[^\]]*]\(storage:([^)\s]+)\)/g;

export function storageMarkdownForKey(objectKey) {
  const key = String(objectKey || '').trim();
  if (!key) return '';
  return `![](storage:${key})`;
}

export function buildInlineImageMarkdown(persisted = []) {
  const lines = [];
  for (const item of persisted || []) {
    const md = storageMarkdownForKey(item?.objectKey);
    if (md) lines.push(md);
  }
  return lines.join('\n\n');
}

export function buildInlineImageOcrAppendix(ocrBlocks = []) {
  const blocks = [];
  for (const block of ocrBlocks || []) {
    const index = Number(block?.index);
    const body = String(block?.text || '').trim();
    if (!body || !Number.isFinite(index) || index < 1) continue;
    blocks.push(`【图${index}】\n${body}`);
  }
  if (!blocks.length) return '';
  return `${OCR_APPENDIX_HEADER}\n\n${blocks.join('\n\n')}`;
}

/**
 * Strip prior inline markdown / OCR appendix so deferred jobs can rebuild cleanly.
 */
export function stripInlineImageEnrichment(text = '') {
  let value = String(text || '');
  const appendixAt = value.indexOf(OCR_APPENDIX_HEADER);
  if (appendixAt >= 0) {
    value = value.slice(0, appendixAt).trimEnd();
  }
  value = value.replace(STORAGE_IMAGE_RE, '').replace(/\n{3,}/g, '\n\n').trim();
  return value;
}

/**
 * @param {{ baseText?: string, persisted?: Array<{ objectKey: string }>, ocrBlocks?: Array<{ index: number, text: string }> }} args
 */
export function enrichContentWithInlineImages({
  baseText = '',
  persisted = [],
  ocrBlocks = [],
} = {}) {
  const base = stripInlineImageEnrichment(baseText);
  const markdown = buildInlineImageMarkdown(persisted);
  const appendix = buildInlineImageOcrAppendix(ocrBlocks);
  return [base, markdown, appendix].filter(Boolean).join('\n\n').trim();
}

/**
 * OCR already-persisted inline image bytes.
 */
export async function buildOcrBlocksFromPersisted({
  persisted = [],
  extractImageContent,
  dashscopeKey = '',
  fetchImpl = fetch,
} = {}) {
  if (!persisted?.length || typeof extractImageContent !== 'function') return [];

  const blocks = [];
  for (const item of persisted) {
    try {
      if (!item?.bytes?.byteLength) continue;
      const extracted = await extractImageContent({
        bytes: item.bytes,
        fileName: String(item.objectKey || '').split('/').pop() || `inline-${item.index}.jpg`,
        mimeType: item.mimeType || 'image/jpeg',
        dashscopeKey,
        fetchImpl,
      });
      const text = String(extracted?.content_text || '').trim();
      if (!text) continue;
      blocks.push({ index: item.index, text });
    } catch {
      // Soft-fail per image.
    }
  }
  return blocks;
}

export { OCR_APPENDIX_HEADER };
