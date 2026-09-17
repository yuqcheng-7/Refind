/**
 * Global answer format pipeline.
 *
 * Strategy (RAG): structure first (一、/1./·/[n]), then keep only safe short **labels**,
 * strip every leftover * so broken model Markdown never reaches the UI.
 */

const CN_NUM = '一二三四五六七八九十百千';
const CN_SECTION_LINE_RE = new RegExp(`^([${CN_NUM}]+)[、.．]\\s*(\\S.*)$`);
/** Real list body after "N. " — CJK / Latin / bold / ·; excludes version "1.0" */
const ORDERED_ITEM_START = '[\\u4e00-\\u9fff*·A-Za-z]';
const ORDERED_LIST_RE = new RegExp(`^\\d+\\.\\s*${ORDERED_ITEM_START}`);
const UNORDERED_LIST_RE = /^(?:[-*]|\u00B7|\u2022|·)\s+\S/;
const HEADING_MD_RE = /^(#{1,3})\s+(\S.*)$/;
const HR_RE = /^\s*([-_*])(?:\s*\1){2,}\s*$/;
const MAX_CN_HEADING_LEN = 18;
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

/**
 * List-item lead label: short title + colon, body follows (bold title only in UI).
 * Title length 2–12 (aligned with prompt); not a full sentence.
 * Examples: "精准问答与答案溯源：正文…" / "模型选择与优化\n端侧要选…"
 */
export function parseListItemLead(text = '') {
  let value = String(text || '');
  if (!value) return null;
  // Normalize **短标题：** / **短标题**： → 短标题：
  value = value.replace(/^\*\*([^*\[\]\n]{2,12})：\*\*/, '$1：');
  value = value.replace(/^\*\*([^*\[\]\n]{2,12})\*\*([：:])/, '$1$2');

  const sameLine = value.match(/^([^\n\[*]{2,12})([：:])([ \t]*)([\s\S]*)$/);
  if (sameLine) {
    const title = sameLine[1].trim();
    if (!title || /[。！？；]/.test(title)) return null;
    if (/^(?:[-·*]|\d+\.)/.test(title)) return null;
    return {
      title,
      colon: sameLine[2],
      rest: `${sameLine[3] || ''}${sameLine[4] || ''}`,
    };
  }

  const nl = value.indexOf('\n');
  if (nl > 0) {
    const first = value.slice(0, nl).trim();
    const rest = value.slice(nl);
    const titled = first.match(/^([^\n\[*]{2,12})([：:])\s*$/);
    if (titled && !/[。！？；]/.test(titled[1])) {
      return { title: titled[1].trim(), colon: titled[2], rest };
    }
    if (
      first.length >= 2
      && first.length <= 12
      && !/[。！？；：:]/.test(first)
      && !/^(?:[-·*]|\d+\.)/.test(first)
    ) {
      return { title: first, colon: '：', rest };
    }
  }
  return null;
}

/**
 * Keep only well-formed short **labels**; delete every other asterisk.
 * This is the global guarantee that raw * / ** never show in the UI.
 */
export function sanitizeInlineMarkdown(text = '') {
  const slots = [];
  let value = String(text);

  // Prefer **标签** without colon inside; normalize **标签：** → **标签**：
  value = value.replace(/\*\*([^*\[\]\n：:]{1,16})：[^*\[\]\n]{0}\*\*/g, '**$1**：');
  value = value.replace(/\*\*([^*\[\]\n：:]{1,16})：\*\*/g, '**$1**：');

  // Park valid short bold (no brackets/newlines/colon; not a whole sentence / list marker)
  value = value.replace(/\*\*([^*\[\]\n：:]{1,16})\*\*/g, (_, inner) => {
    const clean = String(inner).trim();
    if (!clean || /[。；！？]/.test(clean)) return clean;
    // Never keep "**1. decoder-only**" as bold — looks like a false heading
    if (/^\d+\.\s/.test(clean)) return clean;
    const id = slots.length;
    slots.push(clean);
    return BOLD_SLOT(id);
  });

  // Broken closer before colon: 分析**： → 分析：
  value = value.replace(/([^\s*：:\[\]\n]{1,16})\*\*\s*[：:]/g, '$1：');
  // Broken opener without close: **分析： → park as label
  value = value.replace(/\*\*([^\s*：:\[\]\n]{1,16})\s*[：:]/g, (_, word) => {
    const id = slots.length;
    slots.push(word);
    return `${BOLD_SLOT(id)}：`;
  });

  // Drop every remaining asterisk
  value = value.replace(/\*{1,2}/g, '');

  // Restore safe bold
  value = value.replace(/\uE000(\d+)\uE001/g, (_, n) => `**${slots[Number(n)]}**`);
  return value;
}

/**
 * Under a 大标题, parallel small titles often all restart at "1.".
 * Renumber each local cluster to 1. 2. 3. 4. (Arabic) — never promote to 「一、二、三、」.
 */
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

/**
 * After a real 1.2.3. run, a restarted "1." is usually parallel content → 「· 」.
 */
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

/**
 * Structural repairs that do not depend on Markdown quality.
 */
export function repairAnswerStructure(text = '') {
  let value = canonicalizeAnswerText(text);
  if (!value) return '';

  value = value.replace(/^\s*\*{1,2}\s*$/gm, '');
  // Unwrap whole-line bold list markers: **1. decoder-only** → 1. decoder-only
  value = value.replace(/^\*\*(\d+\.\s*[^*]+)\*\*\s*$/gm, '$1');

  // Join orphaned "1.\n正文" only when next line starts like real list content
  value = value.replace(new RegExp(`^(\\d+)\\.\\s*\\n+(?=${ORDERED_ITEM_START})`, 'gm'), '$1. ');
  value = value.replace(new RegExp(`(\\n)(\\d+)\\.\\s*\\n+(?=${ORDERED_ITEM_START})`, 'g'), '$1$2. ');

  // "……。二、标题"
  value = value.replace(
    /([。！？；])\s*([一二三四五六七八九十百千]+[、.．])/g,
    '$1\n\n$2',
  );

  // "一、标题" then real list "1. 中文/Latin" — never split V1.0 / 1.1
  value = value.replace(
    new RegExp(
      `([一二三四五六七八九十百千]+[、.．][^\\n]*?)(?=[ \\t]*${ORDERED_AFTER_RE.source})`,
      'g',
    ),
    '$1\n\n',
  );

  // "一、标题 · …"
  value = value.replace(
    /([一二三四五六七八九十百千]+[、.．][^\n]*?)(?=\s*(?:[-·])\s+\S)/g,
    '$1\n\n',
  );

  // "一、短题：超长正文"
  value = value.replace(
    /(^|\n)([一二三四五六七八九十百千]+[、.．]\s*[^：:\n*·\-]{1,16})[：:]([^\n]{8,})/g,
    '$1$2\n\n$3',
  );

  // "三、短标题正文" — multi-char phrases only (never single 能/在/是)
  value = value.replace(
    /(^|\n)([一二三四五六七八九十百千]+[、.．]\s*[^：:\n*·\-]{2,14}?)(?=(?:在整个|是一个|是一项|需要|要求|为了|从以下|通过以下|包括|涵盖|进行))/g,
    '$1$2\n\n',
  );

  // Jammed real lists on the SAME line only (do not eat newlines between 1./2./3.)
  value = value.replace(
    new RegExp(`([。！？；：）】」\\u4e00-\\u9fff])[ \\t]*(?=${ORDERED_AFTER_RE.source})`, 'g'),
    '$1\n\n',
  );
  // Also allow "说明A 2. 中文" — only after horizontal space (never break V1.0 or \n2.)
  value = value.replace(new RegExp(`(?<=[ \\t])(?=${ORDERED_AFTER_RE.source})`, 'g'), '\n\n');

  // "1.需求" → "1. 需求"；不碰 1.0 / 1.1
  value = value.replace(new RegExp(`(^|\\n)(\\d+)\\.(?=${ORDERED_ITEM_START})`, 'g'), '$1$2. ');

  value = rewriteParallelSectionTitles(value);
  value = demoteRestartedOrderedItems(value);

  value = value.replace(/[ \t]*\*{1,2}[ \t]*$/gm, '');
  value = value.replace(/^\s*\*{1,2}\s*$/gm, '');

  return tidyBlankLines(value);
}

/**
 * Single RAG entry: structure → safe bold only → no raw asterisks.
 */
export function sanitizeRagAnswer(text = '') {
  let value = canonicalizeAnswerText(text);
  if (!value) return '';
  value = repairAnswerStructure(value);
  value = sanitizeInlineMarkdown(value);
  // Structure again after bold cleanup (may expose "。二、" etc.)
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

/** @deprecated alias */
export function repairBrokenMarkdown(text = '') {
  return sanitizeRagAnswer(text);
}

/** @deprecated alias */
export function repairSectionStructure(text = '') {
  return repairAnswerStructure(text);
}

/** Conversational: strip all markdown ornaments, keep structure. */
export function stripMarkdownForReading(text = '') {
  let value = canonicalizeAnswerText(text);
  if (!value) return '';
  value = value.replace(/^#{1,6}\s+/gm, '');
  value = value.replace(/^\s*[-*_]{3,}\s*$/gm, '');
  value = value.replace(/\*\*([^*]+)\*\*/g, '$1');
  value = value.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');
  value = value.replace(/__([^_]+)__/g, '$1');
  value = value.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1');
  value = value.replace(/`+/g, '');
  value = value.replace(/\*{1,2}/g, '');
  value = repairAnswerStructure(value);
  return tidyBlankLines(value);
}

export function normalizeAnswerText(text = '', { conversational = false } = {}) {
  return conversational ? stripMarkdownForReading(text) : sanitizeRagAnswer(text);
}

/**
 * Inline tokens. Bold/italic children may include citations.
 */
export function tokenizeInline(text = '', { allowMarkdown = true } = {}) {
  const tokens = [];
  const re = allowMarkdown
    ? /(\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|\[(\d+)\])/g
    : /(\[(\d+)\])/g;
  let last = 0;
  let match;
  while ((match = re.exec(text))) {
    if (match.index > last) {
      tokens.push({ type: 'text', value: text.slice(last, match.index) });
    }
    if (allowMarkdown && match[2] != null) {
      tokens.push({
        type: 'bold',
        children: tokenizeInline(match[2], { allowMarkdown: false }),
      });
    } else if (allowMarkdown && match[3] != null) {
      tokens.push({
        type: 'italic',
        children: tokenizeInline(match[3], { allowMarkdown: false }),
      });
    } else if (allowMarkdown && match[4] != null) {
      tokens.push({ type: 'code', value: match[4] });
    } else {
      const order = Number(allowMarkdown ? match[5] : match[2]);
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

function isOrderedListLine(line) {
  return ORDERED_LIST_RE.test(line);
}

function isUnorderedListLine(line) {
  return UNORDERED_LIST_RE.test(line);
}

function isListLine(line) {
  return isOrderedListLine(line) || isUnorderedListLine(line);
}

function stripListMarker(line) {
  return line.replace(/^(\d+\.\s*|[·*-]\s+)/, '');
}

function listKind(line) {
  return isOrderedListLine(line) ? 'ordered' : 'unordered';
}

function parseHeadingLine(line) {
  const plain = String(line).replace(/^\*\*([^*]+)\*\*$/, '$1').trim();
  const md = plain.match(HEADING_MD_RE);
  if (md) {
    const text = md[2].trim();
    if (text.length > 24) return null;
    return { type: 'heading', level: Math.min(md[1].length, 3), text };
  }
  const cn = plain.match(CN_SECTION_LINE_RE);
  if (cn) {
    const title = cn[2].trim();
    if (title.length > MAX_CN_HEADING_LEN) return null;
    return { type: 'heading', level: 2, text: `${cn[1]}、${title}` };
  }
  return null;
}

export function splitAnswerBlocks(text = '', options = {}) {
  const normalized = normalizeAnswerText(text, options);
  if (!normalized) return [];

  const lines = normalized.split('\n').map((line) => line.trim());
  const blocks = [];
  let paragraphBuf = [];
  let listBuf = null;

  const flushParagraph = () => {
    if (!paragraphBuf.length) return;
    const textBlock = paragraphBuf.join('\n').trim();
    paragraphBuf = [];
    if (!textBlock) return;
    blocks.push({ type: 'paragraph', text: textBlock });
  };

  const flushList = () => {
    if (!listBuf?.items?.length) {
      listBuf = null;
      return;
    }
    blocks.push({
      type: 'list',
      ordered: Boolean(listBuf.ordered),
      items: [...listBuf.items],
    });
    listBuf = null;
  };

  const appendToCurrentItem = (line) => {
    if (!listBuf?.items?.length) return false;
    const sep = listBuf.pendingBlank ? '\n\n' : '\n';
    listBuf.pendingBlank = false;
    listBuf.items[listBuf.items.length - 1] += `${sep}${line}`;
    return true;
  };

  for (const line of lines) {
    if (!line) {
      if (listBuf?.items?.length) {
        listBuf.pendingBlank = true;
        continue;
      }
      flushParagraph();
      continue;
    }
    if (HR_RE.test(line)) {
      flushList();
      flushParagraph();
      blocks.push({ type: 'hr' });
      continue;
    }
    const heading = parseHeadingLine(line);
    if (heading) {
      flushList();
      flushParagraph();
      blocks.push(heading);
      continue;
    }
    if (isListLine(line)) {
      flushParagraph();
      const ordered = listKind(line) === 'ordered';
      const item = stripListMarker(line);
      // · under ordered title (no blank between) stays in the same item
      if (listBuf?.ordered && !ordered) {
        if (listBuf.pendingBlank) {
          flushList();
          if (!item) continue;
          listBuf = { ordered: false, items: [item], pendingBlank: false };
        } else {
          appendToCurrentItem(line);
        }
        continue;
      }
      if (!item) continue;
      if (!listBuf || listBuf.ordered !== ordered) {
        flushList();
        listBuf = { ordered, items: [item], pendingBlank: false };
      } else {
        listBuf.pendingBlank = false;
        listBuf.items.push(item);
      }
      continue;
    }
    if (listBuf?.items?.length) {
      appendToCurrentItem(line);
      continue;
    }
    paragraphBuf.push(line);
  }

  flushList();
  flushParagraph();
  return blocks;
}

export function citationByOrder(citations = [], order) {
  return citations.find((item) => Number(item.order) === Number(order)) || null;
}
