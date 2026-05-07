"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { formatSupabaseAuthError } from "@/lib/supabase/errors";

type BookmarkRow = {
  id: string;
  url: string;
  title: string | null;
  source_platform: string | null;
  summary: string | null;
  ai_status: string;
  ai_error: string | null;
  created_at: string;
};

export default function AddBookmarkPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BookmarkRow | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [debug, setDebug] = useState<{ tagWriteError?: string | null; outputPreview?: string } | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = "/login";
      }
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setTags([]);
    setDebug(null);
    setLoading(true);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("请先配置 Supabase 环境变量");

      const { data, error } = await supabase.functions.invoke("bookmark_ingest", {
        body: { url: url.trim() },
      });
      if (error) throw error;

      const bookmark = (data as { bookmark?: BookmarkRow })?.bookmark ?? null;
      if (!bookmark) throw new Error("未返回 bookmark");
      setResult(bookmark);
      setTags(((data as { tags?: string[] })?.tags ?? []).filter((t) => typeof t === "string"));
      setDebug((data as { debug?: { tagWriteError?: string | null; outputPreview?: string } })?.debug ?? null);
    } catch (e) {
      setError(e instanceof Error ? formatSupabaseAuthError(e.message) : "添加失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto w-full max-w-2xl px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">添加收藏（测试）</div>
            <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              调用 Supabase Edge Function：`bookmark_ingest`
            </div>
          </div>
          <Link className="text-sm underline" href="/">
            返回首页
          </Link>
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <label className="block text-sm font-medium">链接</label>
          <input
            className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-600"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.zhihu.com/..."
            autoComplete="url"
          />

          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

          <button
            disabled={loading}
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {loading ? "处理中…" : "添加并生成摘要/标签"}
          </button>
        </form>

        {result ? (
          <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="font-medium">结果</div>
            <div className="mt-3 grid gap-2">
              <div>
                <span className="text-zinc-500">平台：</span>
                {result.source_platform ?? "-"}
              </div>
              <div>
                <span className="text-zinc-500">标题：</span>
                {result.title ?? "-"}
              </div>
              <div>
                <span className="text-zinc-500">AI 状态：</span>
                {result.ai_status}
                {result.ai_error ? `（${result.ai_error}）` : ""}
              </div>
              <div className="whitespace-pre-wrap rounded-xl bg-zinc-50 p-3 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
                {result.summary ?? "（无摘要）"}
              </div>
              <div>
                <span className="text-zinc-500">标签：</span>
                {tags.length ? tags.join(" / ") : "-"}
              </div>
            </div>

            {debug ? (
              <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                <div className="font-medium">调试信息（仅用于定位）</div>
                <div className="mt-2">
                  <span className="text-zinc-500">tagWriteError：</span>
                  {debug.tagWriteError ?? "-"}
                </div>
                <div className="mt-2 whitespace-pre-wrap">
                  <span className="text-zinc-500">AI 输出片段：</span>
                  {"\n"}
                  {debug.outputPreview ?? "-"}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}

