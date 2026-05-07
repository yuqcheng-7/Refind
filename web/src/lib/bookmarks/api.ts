import { getSupabase } from "@/lib/supabase/client";
import type { Bookmark, BookmarkWithTags } from "./types";

type BookmarkRow = Bookmark & {
  bookmark_tags?: Array<{ tags?: { name?: string | null } | null } | null> | null;
};

export async function listBookmarks(limit = 200): Promise<BookmarkWithTags[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("请先配置 Supabase 环境变量");

  const { data, error } = await supabase
    .from("bookmarks")
    // Nested select relies on FK relationships (bookmark_tags.tag_id -> tags.id)
    .select("id,url,source_platform,title,excerpt,summary,ai_status,ai_error,created_at,bookmark_tags(tags(name))")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const rows = (data ?? []) as unknown as BookmarkRow[];
  return rows.map((r) => ({
    id: r.id,
    url: r.url,
    source_platform: r.source_platform,
    title: r.title,
    excerpt: r.excerpt ?? null,
    summary: r.summary ?? null,
    ai_status: r.ai_status,
    ai_error: r.ai_error ?? null,
    created_at: r.created_at,
    tags:
      r.bookmark_tags
        ?.map((bt) => bt?.tags?.name ?? null)
        .filter((x): x is string => !!x) ?? [],
  }));
}

export async function getBookmark(id: string): Promise<BookmarkWithTags | null> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("请先配置 Supabase 环境变量");

  const { data, error } = await supabase
    .from("bookmarks")
    .select("id,url,source_platform,title,excerpt,summary,ai_status,ai_error,created_at")
    .eq("id", id)
    .single();

  // If not found, return null instead of throwing.
  if (error) {
    // PostgREST "Results contain 0 rows" (common code is PGRST116)
    // Treat as not found.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const code = (error as any)?.code;
    if (code === "PGRST116") return null;
    throw error;
  }
  const r = data as unknown as Bookmark;

  const { data: btRows, error: btErr } = await supabase
    .from("bookmark_tags")
    .select("tag_id")
    .eq("bookmark_id", id);

  if (btErr) throw btErr;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tagIds = (btRows as any[] | null)?.map((x) => x?.tag_id).filter(Boolean) ?? [];

  let tags: string[] = [];
  if (tagIds.length) {
    const { data: tagRows, error: tagErr } = await supabase
      .from("tags")
      .select("id,name")
      .in("id", tagIds);
    if (tagErr) throw tagErr;
    tags = (tagRows as Array<{ id: string; name: string }> | null)?.map((t) => t.name) ?? [];
  }

  return {
    id: r.id,
    url: r.url,
    source_platform: r.source_platform,
    title: r.title,
    excerpt: r.excerpt ?? null,
    summary: r.summary ?? null,
    ai_status: r.ai_status,
    ai_error: r.ai_error ?? null,
    created_at: r.created_at,
    tags,
  };
}

export async function retryBookmarkAi(bookmark_id: string): Promise<{ summary: string; tags: string[] }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("请先配置 Supabase 环境变量");

  const { data, error } = await supabase.functions.invoke("bookmark_retry_ai", { body: { bookmark_id } });
  if (error) throw error;
  const d = data as { summary?: string; tags?: string[] };
  return { summary: d.summary ?? "", tags: Array.isArray(d.tags) ? d.tags : [] };
}

