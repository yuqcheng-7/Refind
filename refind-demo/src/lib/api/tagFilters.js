export function resolveTagFilterIds(selectedNames, availableTags) {
  const byName = new Map(availableTags.map((t) => [t.name, t.id]));
  return selectedNames.map((name) => byName.get(name)).filter(Boolean);
}

/** Drop selected tag names that no longer exist in the live tag catalog. */
export function pruneSelectedTagNames(selectedNames = [], availableTags = []) {
  const names = new Set((availableTags || []).map((tag) => tag?.name).filter(Boolean));
  return (selectedNames || []).filter((name) => names.has(name));
}

/** Match a trailing #tag token before the caret (or end of string). */
export function matchHashTagQuery(text = '', caret = null) {
  const value = String(text || '');
  const end = caret == null
    ? value.length
    : Math.max(0, Math.min(Number(caret) || 0, value.length));
  const before = value.slice(0, end);
  const match = /#([^\s#]*)$/.exec(before);
  if (!match) return null;
  return {
    query: match[1] || '',
    start: match.index,
    end,
  };
}

/** Replace the active #token before caret with `#tag `, keep text after caret. */
export function replaceHashTagToken(text = '', tagName, caret = null, { remove = false } = {}) {
  const value = String(text || '');
  const end = caret == null
    ? value.length
    : Math.max(0, Math.min(Number(caret) || 0, value.length));
  const before = value.slice(0, end);
  const after = value.slice(end);
  const match = /#([^\s#]*)$/.exec(before);
  const name = String(tagName || '').trim();
  if (!match) {
    if (remove || !name) return value;
    const prefix = before && !/\s$/.test(before) ? `${before} ` : before;
    return `${prefix}#${name} ${after}`;
  }
  const head = before.slice(0, match.index);
  if (remove) {
    return `${head}${after}`.replace(/[ \t]{2,}/g, ' ');
  }
  return `${head}#${name} ${after}`;
}

/** Format selected tags back into a composer prompt prefix (`#a #b `). */
export function formatSelectedTagsPrompt(selectedNames = []) {
  const tags = (selectedNames || []).map((name) => String(name || '').trim()).filter(Boolean);
  if (!tags.length) return '';
  return `${tags.map((name) => `#${name}`).join(' ')} `;
}

/** Remove selected #tags from the prompt so they do not pollute retrieval text. */
export function stripSelectedTagsFromPrompt(prompt = '', selectedNames = []) {
  let value = String(prompt || '');
  for (const name of selectedNames || []) {
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    value = value.replace(new RegExp(`#${escaped}(?=\\s|$)`, 'g'), '');
  }
  return value.replace(/[ \t]{2,}/g, ' ').replace(/\s+$/g, '').replace(/^\s+/g, '').trim();
}

/** Pull #tag mentions from the prompt that exist in the live catalog (longest first). */
export function extractTagNamesFromPrompt(prompt = '', availableTags = []) {
  const names = (availableTags || [])
    .map((tag) => tag?.name)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const text = String(prompt || '');
  const found = [];
  for (const name of names) {
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`#${escaped}(?=\\s|$)`).test(text)) found.push(name);
  }
  return found;
}

export function mergeSelectedTagNames(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    for (const name of list || []) {
      const value = String(name || '').trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

/**
 * True when leftover ask text is too vague for embedding without a tag topic.
 * Tag UUID filters already scope materials; substantive asks should stay clean.
 */
export function isWeakRagAsk(text = '') {
  const q = String(text || '').trim();
  if (!q) return true;
  if (/^(是怎么|怎么做|为什么|为何|怎样|如何|对吗|是吗)/.test(q)) return true;
  if (/^(那|所以|然后|还有|继续)/.test(q) && q.length <= 12) return true;
  // Tiny fragments like「呢」「吗」「为什么」already covered; keep ≤2 as empty-ish.
  if (q.length <= 2) return true;
  return false;
}

/** Show `#tag` in the sent bubble even if the ask text was typed without hashes. */
export function formatDisplayAskPrompt(prompt = '', selectedNames = []) {
  const tags = (selectedNames || []).map((name) => String(name || '').trim()).filter(Boolean);
  const raw = String(prompt || '').trim();
  if (!tags.length) return raw;
  const cleaned = stripSelectedTagsFromPrompt(raw, tags);
  const alreadyHasAll = tags.every((name) => {
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`#${escaped}(?=\\s|$)`).test(raw);
  });
  if (alreadyHasAll) return raw;
  const hashPrefix = tags.map((name) => `#${name}`).join(' ');
  return cleaned ? `${hashPrefix} ${cleaned}` : hashPrefix;
}

/**
 * Build the text sent to RAG embedding / rewrite.
 * Tag UUID filters scope materials; still prepend tag names so the query
 * stays on-topic inside that scope (and if filters miss, soft-fallback can help).
 */
export function buildRagAskText(prompt = '', selectedNames = []) {
  const tags = (selectedNames || []).map((name) => String(name || '').trim()).filter(Boolean);
  const cleaned = stripSelectedTagsFromPrompt(prompt, tags);
  if (!tags.length) return cleaned || String(prompt || '').trim();
  if (!cleaned) return tags.join(' ');
  if (!isWeakRagAsk(cleaned)) {
    // Substantive ask: keep question first, then tag topics as light anchors.
    return `${cleaned}\n${tags.join(' ')}`;
  }
  return `${tags.join(' ')}\n${cleaned}`;
}
