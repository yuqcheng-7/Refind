import { getSupabase } from "@/lib/supabase/client";
import type { Bookmark, BookmarkWithTags, Collection, Profile } from "./types";

type BookmarkRow = Bookmark & {
  bookmark_tags?: Array<{ tags?: { name?: string | null } | null } | null> | null;
};

export type ListBookmarksFilter =
  | { mode: "all" }
  | { mode: "uncategorized" }
  | { mode: "collection"; collectionId: string };

export type PrepareBookmarkResult = {
  url: string;
  title: string | null;
  excerpt: string | null;
  preview_image_url: string | null;
  source_platform: string | null;
  parse_ok: boolean;
  summary: string;
  tags: string[];
  ai_error: string | null;
};

export async function prepareBookmark(url: string): Promise<PrepareBookmarkResult> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("请先配置 Supabase 环境变量");

  const { data, error } = await supabase.functions.invoke("bookmark_prepare", {
    body: { url: url.trim() },
  });
  if (error) throw error;
  const d = data as PrepareBookmarkResult & { ok?: boolean; error?: string };
  if (!d || (d as { error?: string }).error) {
    throw new Error((d as { error?: string })?.error ?? "预览失败");
  }
  return {
    url: d.url,
    title: d.title ?? null,
    excerpt: d.excerpt ?? null,
    preview_image_url: d.preview_image_url ?? null,
    source_platform: d.source_platform ?? null,
    parse_ok: !!d.parse_ok,
    summary: d.summary ?? "",
    tags: Array.isArray(d.tags) ? d.tags : [],
    ai_error: d.ai_error ?? null,
  };
}

export async function findBookmarkByUrl(url: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("请先配置 Supabase 环境变量");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("bookmarks").select("id").eq("user_id", user.id).eq("url", url).maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any)?.id ?? null;
}

export async function createBookmarkFromDraft(input: {
  url: string;
  title: string | null;
  source_platform: string | null;
  excerpt: string | null;
  summary: string | null;
  preview_image_url: string | null;
  author: string | null;
  collection_id: string | null;
  tags: string[];
}): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("请先配置 Supabase 环境变量");

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error("未登录");

  const dupId = await findBookmarkByUrl(input.url);
  if (dupId) {
    const err = new Error("DUPLICATE_URL");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err as any).code = "DUPLICATE_URL";
    throw err;
  }

  const { data: row, error } = await supabase
    .from("bookmarks")
    .insert({
      user_id: user.id,
      url: input.url,
      title: input.title,
      source_platform: input.source_platform,
      excerpt: input.excerpt,
      summary: input.summary,
      preview_image_url: input.preview_image_url,
      author: input.author,
      collection_id: input.collection_id,
      ai_status: "done",
      ai_error: null,
    })
    .select("id")
    .single();

  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const id = (row as any)?.id as string;
  await setBookmarkTags(id, input.tags);
  return id;
}

export async function listBookmarks(
  limit = 500,
  filter: ListBookmarksFilter = { mode: "all" }
): Promise<BookmarkWithTags[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("请先配置 Supabase 环境变量");

  let query = supabase
    .from("bookmarks")
    .select(
      "id,url,collection_id,source_platform,author,title,excerpt,summary,preview_image_url,ai_status,ai_error,created_at,bookmark_tags(tags(name))"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filter.mode === "uncategorized") {
    query = query.is("collection_id", null);
  } else if (filter.mode === "collection") {
    query = query.eq("collection_id", filter.collectionId);
  }

  const { data, error } = await query;

  if (error) throw error;

  const rows = (data ?? []) as unknown as BookmarkRow[];
  return rows.map((r) => ({
    id: r.id,
    url: r.url,
    collection_id: r.collection_id ?? null,
    source_platform: r.source_platform,
    author: r.author ?? null,
    title: r.title,
    excerpt: r.excerpt ?? null,
    summary: r.summary ?? null,
    preview_image_url: r.preview_image_url ?? null,
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
    .select(
      "id,url,collection_id,source_platform,author,title,excerpt,summary,preview_image_url,ai_status,ai_error,created_at"
    )
    .eq("id", id)
    .single();

  if (error) {
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
    collection_id: r.collection_id ?? null,
    source_platform: r.source_platform,
    author: r.author ?? null,
    title: r.title,
    excerpt: r.excerpt ?? null,
    summary: r.summary ?? null,
    preview_image_url: r.preview_image_url ?? null,
    ai_status: r.ai_status,
    ai_error: r.ai_error ?? null,
    created_at: r.created_at,
    tags,
  };
}

export async function updateBookmark(
  id: string,
  patch: Partial<
    Pick<
      Bookmark,
      "title" | "summary" | "excerpt" | "url" | "collection_id" | "author" | "preview_image_url"
    >
  >
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("请先配置 Supabase 环境变量");

  const row: Record<string, unknown> = {};
  if ("title" in patch) row.title = patch.title;
  if ("summary" in patch) row.summary = patch.summary;
  if ("excerpt" in patch) row.excerpt = patch.excerpt;
  if ("url" in patch) row.url = patch.url;
  if ("collection_id" in patch) row.collection_id = patch.collection_id;
  if ("author" in patch) row.author = patch.author;
  if ("preview_image_url" in patch) row.preview_image_url = patch.preview_image_url;

  const { error } = await supabase.from("bookmarks").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteBookmark(id: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("请先配置 Supabase 环境变量");

  const { error } = await supabase.from("bookmarks").delete().eq("id", id);
  if (error) throw error;
}

/** PRD：标签 1–12 字，最多 6 个 */
export async function setBookmarkTags(bookmarkId: string, rawNames: string[]): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("请先配置 Supabase 环境变量");

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error("未登录");

  const names: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawNames) {
    const t = raw.trim().replace(/^#/, "");
    if (t.length < 1 || t.length > 12) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    names.push(t);
    if (names.length >= 6) break;
  }

  const { error: delErr } = await supabase.from("bookmark_tags").delete().eq("bookmark_id", bookmarkId);
  if (delErr) throw delErr;

  if (!names.length) return;

  const { data: upserted, error: upsertErr } = await supabase
    .from("tags")
    .upsert(names.map((name) => ({ user_id: user.id, name })), { onConflict: "user_id,name" })
    .select("id,name");

  if (upsertErr) throw upsertErr;
  if (!upserted?.length) return;

  const { error: insErr } = await supabase.from("bookmark_tags").insert(
    upserted.map((t) => ({ bookmark_id: bookmarkId, tag_id: t.id }))
  );
  if (insErr) throw insErr;
}

export async function retryBookmarkAi(bookmark_id: string): Promise<{ summary: string; tags: string[] }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("请先配置 Supabase 环境变量");

  const { data, error } = await supabase.functions.invoke("bookmark_retry_ai", { body: { bookmark_id } });
  if (error) throw error;
  const d = data as { summary?: string; tags?: string[] };
  return { summary: d.summary ?? "", tags: Array.isArray(d.tags) ? d.tags : [] };
}

export async function getProfile(): Promise<Profile | null> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("请先配置 Supabase 环境变量");

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return null;

  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

  if (error) throw error;
  if (data) return data as Profile;

  const { error: insErr } = await supabase.from("profiles").insert({
    id: user.id,
    email: user.email ?? null,
  });
  if (insErr) throw insErr;

  const { data: again, error: e2 } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (e2) throw e2;
  return again as Profile;
}

export async function updateProfile(
  patch: Partial<Pick<Profile, "display_name" | "avatar_url">>
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("请先配置 Supabase 环境变量");

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error("未登录");

  const row: Record<string, unknown> = {};
  if (patch.display_name !== undefined) row.display_name = patch.display_name || null;
  if (patch.avatar_url !== undefined) row.avatar_url = patch.avatar_url || null;

  const { error } = await supabase.from("profiles").update(row).eq("id", user.id);
  if (error) throw error;
}

export async function listCollections(): Promise<Collection[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("请先配置 Supabase 环境变量");

  const { data, error } = await supabase
    .from("collections")
    .select("id,user_id,name,created_at")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Collection[];
}

export async function createCollection(name: string): Promise<Collection> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("请先配置 Supabase 环境变量");

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error("未登录");

  const { data, error } = await supabase
    .from("collections")
    .insert({ user_id: user.id, name: name.trim() })
    .select("id,user_id,name,created_at")
    .single();

  if (error) throw error;
  return data as Collection;
}

export async function updateCollection(id: string, name: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("请先配置 Supabase 环境变量");

  const { error } = await supabase.from("collections").update({ name: name.trim() }).eq("id", id);
  if (error) throw error;
}

export async function deleteCollection(id: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("请先配置 Supabase 环境变量");

  const { error } = await supabase.from("collections").delete().eq("id", id);
  if (error) throw error;
}

/**
 * 注销账号（MVP）：清空当前用户在业务表中的数据并退出登录。
 * 注意：无法在匿名 key 的客户端直接删除 auth.users。
 */
export async function purgeMyData(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("请先配置 Supabase 环境变量");

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error("未登录");

  // Order matters due to FK constraints.
  const { data: myBookmarks, error: myBookmarksErr } = await supabase
    .from("bookmarks")
    .select("id")
    .eq("user_id", user.id);
  if (myBookmarksErr) throw myBookmarksErr;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ids = ((myBookmarks as any[] | null) ?? []).map((x) => x?.id).filter(Boolean) as string[];
  if (ids.length) {
    const { error: btErr } = await supabase.from("bookmark_tags").delete().in("bookmark_id", ids);
    if (btErr) throw btErr;
  }

  const { error: bErr } = await supabase.from("bookmarks").delete().eq("user_id", user.id);
  if (bErr) throw bErr;

  const { error: tErr } = await supabase.from("tags").delete().eq("user_id", user.id);
  if (tErr) throw tErr;

  const { error: cErr } = await supabase.from("collections").delete().eq("user_id", user.id);
  if (cErr) throw cErr;

  const { error: pErr } = await supabase.from("profiles").delete().eq("id", user.id);
  if (pErr) throw pErr;

  const { error: signOutErr } = await supabase.auth.signOut();
  if (signOutErr) throw signOutErr;
}
