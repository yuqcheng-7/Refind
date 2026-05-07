export function parseQuery(q: string): { keywords: string[]; tags: string[] } {
  const parts = q
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const tags: string[] = [];
  const keywords: string[] = [];

  for (const p of parts) {
    if (p.startsWith("#") && p.length > 1) {
      tags.push(p.slice(1));
    } else {
      keywords.push(p);
    }
  }

  return {
    keywords: uniq(keywords),
    tags: uniq(tags),
  };
}

export function matchesAllKeywords(text: string, keywords: string[]): boolean {
  const t = text.toLowerCase();
  return keywords.every((k) => t.includes(k.toLowerCase()));
}

export function uniq(arr: string[]): string[] {
  const out: string[] = [];
  for (const v of arr) if (!out.includes(v)) out.push(v);
  return out;
}

