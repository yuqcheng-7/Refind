import type { PlatformFilterValue } from "./platforms";

const KNOWN = new Set(["xiaohongshu", "douyin", "wechat", "zhihu", "bilibili"]);

/** PRD：来源平台筛选与列表 stored source_platform 对齐（含历史 hostname 归入「其他」） */
export function matchesPlatformFilter(
  stored: string | null | undefined,
  filter: PlatformFilterValue
): boolean {
  if (filter === "all") return true;
  const p = (stored ?? "").trim();
  const bucket = KNOWN.has(p) ? p : "other";
  if (filter === "other") return bucket === "other";
  return p === filter;
}

export type SortKey = "time_desc" | "time_asc" | "title_asc" | "title_desc";

export function sortBookmarks<T extends { title: string | null; url: string; created_at: string }>(
  items: T[],
  sort: SortKey
): T[] {
  const copy = [...items];
  const titleKey = (x: T) => (x.title?.trim() || x.url || "").toLowerCase();
  if (sort === "time_desc") {
    copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } else if (sort === "time_asc") {
    copy.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  } else if (sort === "title_asc") {
    copy.sort((a, b) => titleKey(a).localeCompare(titleKey(b), "zh-CN"));
  } else {
    copy.sort((a, b) => titleKey(b).localeCompare(titleKey(a), "zh-CN"));
  }
  return copy;
}
