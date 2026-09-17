/**
 * Shared RAG answer sanitizer (Edge). Keep in sync with
 * refind-demo/src/features/chat/formatAnswerText.js sanitizeRagAnswer.
 */

const CN_NUM = '一二三四五六七八九十百千';
const CN_SECTION_LINE_RE = new RegExp(`^([${CN_NUM}]+)[、.．]\\s*(\\S.*)$`);
const ORDERED_ITEM_START = '[\\u4e00-\\u9fff*·A-Za-z]';
const UNORDERED_LIST_RE = /^(?:[-*]|\u00B7|\u2022|·)\s+\S/;
const HEADING_MD_RE = /^(#{1,3})\s+(\S.*)$/;
const CN_ORDINALS = '一二三四五六七八九十';
const BOLD_SLOT = (i) => `\uE000${i}\uE001`;
const ORDERED_AFTER_RE = new RegExp(`\\d+\\.\\s*${ORDERED_ITEM_START}`);

function canonicalizeAnswerText(text = '') {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u2022/g, '·')
    .replace(/\u00B7/g, '·')
    .trim();
}

function tidyBlankLines(value) {
  return String(value)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sanitizeInlineMarkdown(text = '') {
  const slots = [];
  let value = String(text);

  value = value.replace(/\*\*([^*\[\]\n：:]{1,16})：[^*\[\]\n]{0}\*\*/g, '**$1**：');
  value = value.replace(/\*\*([^*\[\]\n：:]{1,16})：\*\*/g, '**$1**：');

  value = value.replace(/\*\*([^*\[\]\n：:]{1,16})\*\*/g, (_, inner) => {
    const clean = String(inner).trim();
    if (!clean || /[。；！？]/.test(clean)) return clean;
    if (/^\d+\.\s/.test(clean)) return clean;
    const id = slots.length;
    slots.push(clean);
    return BOLD_SLOT(id);
  });

  value = value.replace(/([^\s*：:\[\]\n]{1,16})\*\*\s*[：:]/g, '$1：');
  value = value.replace(/\*\*([^\s*：:\[\]\n]{1,16})\s*[：:]/g, (_, word) => {
    const id = slots.length;
    slots.push(word);
    return `${BOLD_SLOT(id)}：`;
  });

  value = value.replace(/\*{1,2}/g, '');
  value = value.replace(/\uE000(\d+)\uE001/g, (_, n) => `**${slots[Number(n)]}**`);
  return value;
}

export function rewriteParallelSectionTitles(text = '') {
  const lines = String(text || '').split('\n');
  const stripLine = (line) => String(line).replace(/^\*\*([^*]+)\*\*$/, '$1').trim();

  const extractParallelTitle = (line) => {
    const plain = stripLine(line);
    const m = plain.match(/^1\.\s*(.+)$/);
    if (!m) return null;
    let rest = String(m[1] || '').replace(/^\*\*([^*]+)\*\*$/, '$1').trim();
    if (!rest) return null;

    if (/[：:]/.test(rest)) {
      const parts = rest.split(/[：:]/);
      const head = String(parts[0] || '').trim();
      const body = parts.slice(1).join('：').trim();
      if (body.length > 0) return null;
      if (head.length < 2 || head.length > 18) return null;
      if (/[。！？；]/.test(head)) return null;
      return head;
    }

    if (rest.length < 2 || rest.length > 18) return null;
    if (/[。！？；]/.test(rest)) return null;
    if (/^\d+(\.\d+)*$/.test(rest)) return null;
    return rest;
  };

  const isAdvancingOrdered = (line) => {
    const plain = stripLine(line);
    return /^[2-9]\.\s+\S/.test(plain) || /^[1-9]\d+\.\s+\S/.test(plain);
  };

  const out = lines.slice();
  let i = 0;
  while (i < lines.length) {
    if (!extractParallelTitle(lines[i])) {
      i += 1;
      continue;
    }
    const cluster = [i];
    let j = i + 1;
    while (j < lines.length) {
      if (isAdvancingOrdered(lines[j])) break;
      if (extractParallelTitle(lines[j])) cluster.push(j);
      j += 1;
    }

    if (cluster.length >= 2) {
      cluster.forEach((idx, n) => {
        const label = extractParallelTitle(lines[idx]);
        out[idx] = `${n + 1}. ${label}`;
      });
    }
    i = Math.max(j, i + 1);
  }
  return out.join('\n');
}

export function demoteRestartedOrderedItems(text = '') {
  const lines = String(text || '').split('\n');
  let lastOrderedNum = 0;
  const out = lines.map((line) => {
    const plain = String(line).replace(/^\*\*([^*]+)\*\*$/, '$1').trim();
    if (!plain) return line;
    if (UNORDERED_LIST_RE.test(plain)) return line;
    if (CN_SECTION_LINE_RE.test(plain) || HEADING_MD_RE.test(plain)) {
      lastOrderedNum = 0;
      return line;
    }
    const m = plain.match(new RegExp(`^(\\d+)\\.\\s*(${ORDERED_ITEM_START}.*)$`));
    if (!m) {
      lastOrderedNum = 0;
      return line;
    }
    const n = Number(m[1]);
    if (n === 1 && lastOrderedNum >= 2) {
      lastOrderedNum = 0;
      return `· ${m[2]}`;
    }
    lastOrderedNum = n;
    return line;
  });
  return out.join('\n');
}

export function repairAnswerStructure(text = '') {
  let value = canonicalizeAnswerText(text);
  if (!value) return '';

  value = value.replace(/^\s*\*{1,2}\s*$/gm, '');
  value = value.replace(/^\*\*(\d+\.\s*[^*]+)\*\*\s*$/gm, '$1');

  value = value.replace(new RegExp(`^(\\d+)\\.\\s*\\n+(?=${ORDERED_ITEM_START})`, 'gm'), '$1. ');
  value = value.replace(new RegExp(`(\\n)(\\d+)\\.\\s*\\n+(?=${ORDERED_ITEM_START})`, 'g'), '$1$2. ');

  value = value.replace(
    /([。！？；])\s*([一二三四五六七八九十百千]+[、.．])/g,
    '$1\n\n$2',
  );

  value = value.replace(
    new RegExp(
      `([一二三四五六七八九十百千]+[、.．][^\\n]*?)(?=[ \\t]*${ORDERED_AFTER_RE.source})`,
      'g',
    ),
    '$1\n\n',
  );

  value = value.replace(
    /([一二三四五六七八九十百千]+[、.．][^\n]*?)(?=\s*(?:[-·])\s+\S)/g,
    '$1\n\n',
  );

  value = value.replace(
    /(^|\n)([一二三四五六七八九十百千]+[、.．]\s*[^：:\n*·\-]{1,16})[：:]([^\n]{8,})/g,
    '$1$2\n\n$3',
  );

  value = value.replace(
    /(^|\n)([一二三四五六七八九十百千]+[、.．]\s*[^：:\n*·\-]{2,14}?)(?=(?:在整个|是一个|是一项|需要|要求|为了|从以下|通过以下|包括|涵盖|进行))/g,
    '$1$2\n\n',
  );

  value = value.replace(
    new RegExp(`([。！？；：）】」\\u4e00-\\u9fff])[ \\t]*(?=${ORDERED_AFTER_RE.source})`, 'g'),
    '$1\n\n',
  );
  value = value.replace(new RegExp(`(?<=[ \\t])(?=${ORDERED_AFTER_RE.source})`, 'g'), '\n\n');

  value = value.replace(new RegExp(`(^|\\n)(\\d+)\\.(?=${ORDERED_ITEM_START})`, 'g'), '$1$2. ');

  value = rewriteParallelSectionTitles(value);
  value = demoteRestartedOrderedItems(value);

  value = value.replace(/[ \t]*\*{1,2}[ \t]*$/gm, '');
  value = value.replace(/^\s*\*{1,2}\s*$/gm, '');
  return tidyBlankLines(value);
}

export function sanitizeRagAnswer(text = '') {
  let value = canonicalizeAnswerText(text);
  if (!value) return '';
  value = repairAnswerStructure(value);
  value = sanitizeInlineMarkdown(value);
  value = repairAnswerStructure(value);
  value = sanitizeInlineMarkdown(value);
  value = normalizeCitationPlacement(value);
  return tidyBlankLines(value);
}

/** Move [n] clusters to sit after sentence punctuation: "……[1]。" → "……。[1]" */
export function normalizeCitationPlacement(text = '') {
  let value = String(text || '');
  if (!value) return '';
  // [ \t] only — never let \s eat newlines between list / section lines
  value = value.replace(
    /([^\[\]\s。！？])[ \t]*((?:\[\d+][ \t]*)+)[ \t]*([。！？])/g,
    (_, char, cites, punct) => `${char}${punct}${String(cites).replace(/[ \t]+/g, '')}`,
  );
  value = value.replace(
    /([。！？])[ \t]*((?:\[\d+][ \t]*)+)/g,
    (_, punct, cites) => `${punct}${String(cites).replace(/[ \t]+/g, '')}`,
  );
  // "。[1]下一句" → "。[1] 下一句"（同行）
  value = value.replace(/((?:\[\d+\])+)([\u4e00-\u9fffA-Za-z·])/g, '$1 $2');
  return value;
}
