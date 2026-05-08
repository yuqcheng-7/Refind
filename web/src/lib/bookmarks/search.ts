/**
 * PRD：同一次检索不混用文本关键词与 # 标签。
 * - 不含 # → 关键词模式：匹配标题/摘要 AND
 * - 含 # → 标签模式：仅解析 # 开头的标签片段 AND；若混有其他词则 mixedIgnored
 */

export function normalizeSearchInput(q: string): string {
  return q
    .replace(/\u3000/g, " ")
    // Fullwidth ＃ (common in CN IME) → #
    .replace(/\uFF03/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

export type ParsedSearch =
  | { mode: "keyword"; keywords: string[] }
  | { mode: "tag"; tags: string[]; mixedIgnored: boolean };

export function parseQuery(q: string): ParsedSearch {
  const norm = normalizeSearchInput(q);
  if (!norm) return { mode: "keyword", keywords: [] };

  if (!norm.includes("#")) {
    const keywords = uniq(norm.split(/\s+/).filter(Boolean));
    return { mode: "keyword", keywords };
  }

  // Accept "#tag", "# tag", "foo #tag bar" (mixed words ignored by PRD rule)
  const tags: string[] = [];
  const re = /#\s*([^\s#]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm)) !== null) {
    const raw = (m[1] ?? "").trim();
    if (raw) tags.push(raw);
  }

  const nonTag = norm.replace(re, "").replace(/\s+/g, " ").trim().length > 0;
  return {
    mode: "tag",
    tags: uniq(tags.map((t) => t.replace(/^#/, "").trim()).filter(Boolean)),
    mixedIgnored: nonTag,
  };
}

export function matchesKeywords(text: string, keywords: string[]): boolean {
  if (!keywords.length) return true;
  const t = text.toLowerCase();
  return keywords.every((k) => t.includes(k.toLowerCase()));
}

export function matchesAllTags(
  bookmarkTags: string[],
  required: string[]
): boolean {
  if (!required.length) return true;
  const lower = bookmarkTags.map((x) => x.toLowerCase());
  return required.every((r) => lower.includes(r.toLowerCase()));
}

function uniq(arr: string[]): string[] {
  const out: string[] = [];
  for (const v of arr) if (!out.includes(v)) out.push(v);
  return out;
}
