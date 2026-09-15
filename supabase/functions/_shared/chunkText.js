/** Sentence-aware chunking for RAG citations (short passages, not whole docs). */

export const DEFAULT_CHUNK_TARGET = 280;
export const DEFAULT_CHUNK_OVERLAP = 40;
export const DEFAULT_CHUNK_HARD_MAX = 420;

function normalizeSpace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/** Split into sentence-like units. */
export function splitPassageUnits(text) {
  const value = normalizeSpace(text);
  if (!value) return [];
  const units = value
    .split(/(?<=[。！？；.!?;])\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  return units.length ? units : [value];
}

function hardSplit(content, target, baseStart) {
  const chunks = [];
  for (let i = 0; i < content.length; i += target) {
    const slice = content.slice(i, i + target).trim();
    if (!slice) continue;
    chunks.push({
      content: slice,
      source_start: baseStart + i,
      source_end: baseStart + i + slice.length,
    });
  }
  return chunks;
}

/**
 * Build overlapping chunks sized for citation popovers.
 * Offsets refer to positions in the whitespace-normalized full text.
 */
export function chunkText(
  text,
  {
    target = DEFAULT_CHUNK_TARGET,
    overlap = DEFAULT_CHUNK_OVERLAP,
    hardMax = DEFAULT_CHUNK_HARD_MAX,
  } = {},
) {
  const normalized = normalizeSpace(text);
  if (!normalized) return [];

  const units = splitPassageUnits(normalized);
  const chunks = [];
  let index = 0;

  while (index < units.length) {
    let content = units[index];
    let end = index + 1;

    if (content.length > hardMax) {
      const baseStart = normalized.indexOf(content);
      chunks.push(...hardSplit(content, target, Math.max(0, baseStart)));
      index += 1;
      continue;
    }

    while (end < units.length) {
      const candidate = `${content} ${units[end]}`;
      if (candidate.length > target) break;
      content = candidate;
      end += 1;
    }

    const sourceStart = normalized.indexOf(content);
    const start = sourceStart >= 0 ? sourceStart : 0;
    chunks.push({
      content,
      source_start: start,
      source_end: start + content.length,
    });

    if (end >= units.length) break;

    // Advance with character overlap, but always move forward by ≥1 unit.
    let next = end;
    if (overlap > 0) {
      let tail = '';
      for (let back = end - 1; back > index; back -= 1) {
        const piece = units[back];
        const nextTail = tail ? `${piece} ${tail}` : piece;
        if (nextTail.length > overlap) break;
        tail = nextTail;
        next = back;
      }
    }
    index = Math.max(index + 1, next);
  }

  return chunks;
}

/**
 * Prefer 1–2 complete sentences near the answer context for citation cards.
 */
export function focusExcerpt(chunkContent, {
  answer = '',
  order = 0,
  max = 160,
} = {}) {
  const text = normalizeSpace(chunkContent);
  if (!text) return '';

  const sentences = text
    .split(/(?<=[。！？.!?])\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const pool = sentences.length ? sentences : [text];

  let hint = '';
  if (answer && order > 0) {
    const marker = `[${order}]`;
    const at = answer.indexOf(marker);
    if (at > 0) {
      hint = answer.slice(Math.max(0, at - 48), at).replace(/\s+/g, '');
    }
  }

  let best = pool[0];
  let bestScore = -1;
  if (hint) {
    for (const sentence of pool) {
      let score = 0;
      if (hint && sentence.includes(hint)) {
        score = 1000;
      } else {
        for (let len = 4; len >= 2; len -= 1) {
          for (let i = 0; i <= hint.length - len; i += 1) {
            const frag = hint.slice(i, i + len);
            if (frag.length < 2) continue;
            if (sentence.includes(frag)) score += len;
          }
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = sentence;
      }
    }
  }

  let out = best;
  const bestIndex = pool.indexOf(best);
  if (bestIndex >= 0 && bestIndex + 1 < pool.length) {
    const withNext = `${best} ${pool[bestIndex + 1]}`;
    if (withNext.length <= max) out = withNext;
  }

  if (out.length <= max) return out;
  return `${out.slice(0, max).trim()}…`;
}
