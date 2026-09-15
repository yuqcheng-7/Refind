/**
 * Soft-normalize model answers, then split into readable blocks.
 */

/** Strip markdown ornaments so answers read like spoken Chinese. */
export function stripMarkdownForReading(text = '') {
  let value = String(text).replace(/\r\n/g, '\n');
  if (!value.trim()) return '';

  value = value.replace(/^#{1,6}\s+/gm, '');
  value = value.replace(/^\s*[-*_]{3,}\s*$/gm, '');
  value = value.replace(/\*\*([^*]+)\*\*/g, '$1');
  value = value.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');
  value = value.replace(/__([^_]+)__/g, '$1');
  value = value.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1');
  value = value.replace(/`+/g, '');
  // Leftover bold markers from broken model output: "准备阶段**" or lone "**"
  value = value.replace(/\*{1,2}/g, '');
  value = value.replace(/^(\d+)\.\s*\n+(?=\S)/gm, '$1. ');
  value = value.replace(/(\n)(\d+)\.\s*\n+(?=\S)/g, '$1$2. ');
  value = value.replace(/[ \t]+\n/g, '\n');
  value = value.replace(/\n{3,}/g, '\n\n');
  return value.trim();
}

export function normalizeAnswerText(text = '', { conversational = false } = {}) {
  let value = conversational
    ? stripMarkdownForReading(text)
    : String(text).replace(/\r\n/g, '\n').trim();
  if (!value) return '';

  value = value.replace(/^(\d+)\.\s*\n+(?=\S)/gm, '$1. ');
  value = value.replace(/(\n)(\d+)\.\s*\n+(?=\S)/g, '$1$2. ');
  value = value.replace(/(?<![\n\d])(?=\d+\.\s+\S)/g, '\n\n');
  value = value.replace(/\n{3,}/g, '\n\n');
  return value.trim();
}

/**
 * @returns {Array<{ type: 'text' | 'bold' | 'citation', value?: string, order?: number }>}
 */
export function tokenizeInline(text = '', { allowMarkdown = true } = {}) {
  const tokens = [];
  const re = allowMarkdown ? /(\*\*([^*]+)\*\*|\[(\d+)\])/g : /(\[(\d+)\])/g;
  let last = 0;
  let match;
  while ((match = re.exec(text))) {
    if (match.index > last) {
      tokens.push({ type: 'text', value: text.slice(last, match.index) });
    }
    if (allowMarkdown && match[2] != null && match[0].startsWith('**')) {
      tokens.push({ type: 'bold', value: match[2] });
    } else {
      const order = Number(allowMarkdown ? match[3] : match[2]);
      if (Number.isFinite(order) && order >= 1) {
        tokens.push({ type: 'citation', order });
      } else {
        tokens.push({ type: 'text', value: match[0] });
      }
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    tokens.push({ type: 'text', value: text.slice(last) });
  }
  return tokens;
}

function isListLine(line) {
  return /^\d+\.\s+\S/.test(line) || /^[-*]\s+\S/.test(line);
}

function stripListMarker(line) {
  return line.replace(/^(\d+\.\s+|[-*]\s+)/, '');
}

export function splitAnswerBlocks(text = '', options = {}) {
  const normalized = normalizeAnswerText(text, options);
  if (!normalized) return [];

  const blocks = [];
  for (const raw of normalized.split(/\n{2,}/)) {
    const block = raw.trim();
    if (!block) continue;

    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const listLines = lines.filter(isListLine);
    if (listLines.length > 0 && listLines.length === lines.length) {
      blocks.push({
        type: 'list',
        items: listLines.map(stripListMarker).filter(Boolean),
      });
      continue;
    }

    blocks.push({ type: 'paragraph', text: lines.join('\n') });
  }

  const merged = [];
  for (const block of blocks) {
    if (block.type === 'list' && !block.items.length) continue;
    const prev = merged[merged.length - 1];
    if (block.type === 'list' && prev?.type === 'list') {
      prev.items.push(...block.items);
    } else {
      merged.push(block.type === 'list' ? { type: 'list', items: [...block.items] } : block);
    }
  }
  return merged;
}

export function citationByOrder(citations = [], order) {
  return citations.find((item) => Number(item.order) === Number(order)) || null;
}
