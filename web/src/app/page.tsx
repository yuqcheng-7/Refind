"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { formatSupabaseAuthError } from "@/lib/supabase/errors";
import { listBookmarks } from "@/lib/bookmarks/api";
import { matchesAllKeywords, parseQuery } from "@/lib/bookmarks/search";
import type { BookmarkWithTags } from "@/lib/bookmarks/types";

export default function Home() {
  const [email, setEmail] = useState<string | null>(null);
  const [items, setItems] = useState<BookmarkWithTags[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setEmail(data.session?.user.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const client = supabase;

    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const { data } = await client.auth.getSession();
        if (!data.session) {
          setItems([]);
          return;
        }
        const rows = await listBookmarks(200);
        if (!cancelled) setItems(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? formatSupabaseAuthError(e.message) : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [email]);

  const filtered = useMemo(() => {
    const { keywords, tags } = parseQuery(q);
    if (!keywords.length && !tags.length) return items;
    return items.filter((it) => {
      const text = `${it.title ?? ""}\n${it.summary ?? ""}\n${it.excerpt ?? ""}`;
      if (keywords.length && !matchesAllKeywords(text, keywords)) return false;
      if (tags.length) {
        const t = it.tags.map((x) => x.toLowerCase());
        if (!tags.every((x) => t.includes(x.toLowerCase()))) return false;
      }
      return true;
    });
  }, [items, q]);

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto w-full max-w-3xl px-6 py-12">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-zinc-900 dark:bg-white" />
          <div>
            <div className="text-lg font-semibold leading-6">Refind</div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              公开链接可自动解析与生成摘要/标签
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            {email ? (
              <span>
                已登录：<span className="font-medium text-zinc-950 dark:text-zinc-50">{email}</span>
              </span>
            ) : (
              <span>未登录</span>
            )}
          </div>
          <div className="flex gap-2">
            {email ? (
              <>
                <Link
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  href="/add"
                >
                  添加收藏
                </Link>
                <button
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  onClick={() => getSupabase()?.auth.signOut()}
                >
                  退出
                </button>
              </>
            ) : (
              <>
                <Link
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  href="/login"
                >
                  登录
                </Link>
                <Link
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  href="/register"
                >
                  注册
                </Link>
              </>
            )}
          </div>
        </div>

        {email ? (
          <>
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <input
                className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-600"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索标题/摘要… 也支持 #标签"
              />
              <div className="mt-2 text-xs text-zinc-500">
                多关键词默认 AND；多标签用空格分隔：`#AI #效率`
              </div>
            </div>

            {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}

            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                  加载中…
                </div>
              ) : filtered.length ? (
                filtered.map((it) => (
                  <Link
                    key={it.id}
                    href={`/bookmark/${it.id}`}
                    className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {it.title || it.url}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {it.source_platform ?? "unknown"} · {new Date(it.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="shrink-0 text-xs text-zinc-500">{it.ai_status}</div>
                    </div>
                    {it.summary ? (
                      <div className="mt-3 line-clamp-3 text-sm text-zinc-700 dark:text-zinc-300">
                        {it.summary}
                      </div>
                    ) : null}
                    {it.tags.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {it.tags.slice(0, 6).map((t) => (
                          <span
                            key={t}
                            className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-700 dark:border-zinc-800 dark:text-zinc-200"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </Link>
                ))
              ) : (
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                  暂无结果。你可以先去“添加收藏”导入一个公开链接。
                </div>
              )}
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
