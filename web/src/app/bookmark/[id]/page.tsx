"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatSupabaseAuthError } from "@/lib/supabase/errors";
import type { BookmarkWithTags } from "@/lib/bookmarks/types";
import { getBookmark, retryBookmarkAi } from "@/lib/bookmarks/api";

export default function BookmarkDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [item, setItem] = useState<BookmarkWithTags | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const b = await getBookmark(id);
      setItem(b);
    } catch (e) {
      setError(e instanceof Error ? formatSupabaseAuthError(e.message) : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onRetryAi() {
    if (!item) return;
    setRetrying(true);
    setError(null);
    try {
      await retryBookmarkAi(item.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? formatSupabaseAuthError(e.message) : "重试失败");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto w-full max-w-3xl px-6 py-12">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">收藏详情</div>
          <Link className="text-sm underline" href="/">
            返回
          </Link>
        </div>

        {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}

        {loading ? (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            加载中…
          </div>
        ) : item ? (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-sm font-medium">{item.title || item.url}</div>
            <div className="mt-2 text-xs text-zinc-500">
              {item.source_platform ?? "unknown"} · {new Date(item.created_at).toLocaleString()}
            </div>

            <a
              className="mt-3 block truncate text-sm text-zinc-700 underline dark:text-zinc-200"
              href={item.url}
              target="_blank"
              rel="noreferrer"
            >
              {item.url}
            </a>

            <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              AI 状态：<span className="font-medium text-zinc-950 dark:text-zinc-50">{item.ai_status}</span>
              {item.ai_error ? `（${item.ai_error}）` : ""}
            </div>

            <button
              disabled={retrying}
              onClick={onRetryAi}
              className="mt-3 inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              {retrying ? "重试中…" : "重试 AI"}
            </button>

            <div className="mt-4 whitespace-pre-wrap rounded-xl bg-zinc-50 p-3 text-sm text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
              {item.summary || "（暂无摘要）"}
            </div>

            {item.tags.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {item.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-700 dark:border-zinc-800 dark:text-zinc-200"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-4 text-sm text-zinc-500">（暂无标签）</div>
            )}
          </div>
        ) : (
          <div className="mt-4 text-sm text-zinc-500">未找到</div>
        )}
      </main>
    </div>
  );
}

