"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FaCaretDown,
  FaChevronLeft,
  FaChevronRight,
  FaMagnifyingGlass,
  FaPlus,
  FaRegFolderOpen,
  FaRegImage,
  FaSliders,
} from "react-icons/fa6";
import { LoggedInShell } from "@/components/logged-in-shell";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { listBookmarks } from "@/lib/bookmarks/api";
import { matchesPlatformFilter, sortBookmarks, type SortKey } from "@/lib/bookmarks/list-utils";
import { PLATFORM_FILTER_OPTIONS, type PlatformFilterValue, platformLabel } from "@/lib/bookmarks/platforms";
import { matchesAllTags, matchesKeywords, parseQuery } from "@/lib/bookmarks/search";
import type { BookmarkWithTags } from "@/lib/bookmarks/types";
import { getSupabase } from "@/lib/supabase/client";
import { formatSupabaseAuthError } from "@/lib/supabase/errors";

const PAGE_SIZE = 5;

function platformDotColor(stored: string | null | undefined): string {
  switch (stored) {
    case "bilibili":
      return "rgb(251, 114, 153)"; // bilibili pink
    case "zhihu":
      return "rgb(37, 99, 235)"; // deeper blue
    case "wechat":
      return "rgb(34, 197, 94)"; // green
    case "douyin":
      return "rgb(168, 85, 247)"; // violet
    case "xiaohongshu":
      return "rgb(239, 68, 68)"; // red
    default:
      return "rgba(55,53,47,0.45)";
  }
}

function formatDateYmd(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (!e || typeof e !== "object") return "加载失败";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyE = e as any;
  if (typeof anyE.message === "string") return anyE.message;
  if (typeof anyE.error_description === "string") return anyE.error_description;
  if (typeof anyE.error === "string") return anyE.error;
  try {
    return JSON.stringify(e);
  } catch {
    return "加载失败";
  }
}

function formatHomeLoadError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("failed to fetch") || m.includes("networkerror")) {
    return "网络请求失败（无法连接 Supabase）。";
  }
  if (m.includes("jwt") && m.includes("expired")) {
    return "登录状态已过期，请重新登录。";
  }
  if (m.includes("permission denied") || m.includes("row-level security") || m.includes("rls")) {
    return "权限不足（RLS 策略未放行当前用户）。";
  }
  return formatSupabaseAuthError(raw);
}

function HomeMain() {
  const [items, setItems] = useState<BookmarkWithTags[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qInput, setQInput] = useState("");
  const debouncedQ = useDebouncedValue(qInput, 300);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilterValue>("all");
  const [sortKey, setSortKey] = useState<SortKey>("time_desc");
  const [filterOpen, setFilterOpen] = useState(false);
  const [platformMenuOpen, setPlatformMenuOpen] = useState(false);
  const filterWrapRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("请先配置 Supabase 环境变量");
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setItems([]);
        return;
      }
      const rows = await listBookmarks(500);
      setItems(rows);
    } catch (e) {
      const msg = getErrorMessage(e);
      setError(formatHomeLoadError(msg));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!filterOpen && !platformMenuOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const el = filterWrapRef.current;
      if (!el || !(e.target instanceof Node) || el.contains(e.target)) return;
      setFilterOpen(false);
      setPlatformMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [filterOpen, platformMenuOpen]);

  const parsedSearch = useMemo(() => parseQuery(debouncedQ), [debouncedQ]);

  const searchHint = useMemo(() => {
    if (parsedSearch.mode === "tag" && parsedSearch.mixedIgnored) {
      return "已忽略非 # 标签的文字，仅按标签筛选";
    }
    return null;
  }, [parsedSearch]);

  const searched = useMemo(() => {
    if (parsedSearch.mode === "keyword") {
      if (!parsedSearch.keywords.length) return items;
      return items.filter((it) => {
        const text = `${it.title ?? ""}\n${it.summary ?? ""}`;
        return matchesKeywords(text, parsedSearch.keywords);
      });
    }
    if (!parsedSearch.tags.length) return items;
    return items.filter((it) => matchesAllTags(it.tags, parsedSearch.tags));
  }, [items, parsedSearch]);

  const platformFiltered = useMemo(() => {
    return searched.filter((it) => matchesPlatformFilter(it.source_platform, platformFilter));
  }, [searched, platformFilter]);

  const sorted = useMemo(() => sortBookmarks(platformFiltered, sortKey), [platformFiltered, sortKey]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount - 1);
  const pageItems = sorted.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [debouncedQ, platformFilter, sortKey]);

  const emptyNoData = !loading && !error && items.length === 0;
  const emptyFiltered =
    !loading &&
    items.length > 0 &&
    sorted.length === 0 &&
    (debouncedQ.trim() !== "" || platformFilter !== "all");
  const showInlineError = !!error && items.length > 0;
  const showBlockingError = !!error && items.length === 0;

  function resetFilters() {
    setQInput("");
    setPlatformFilter("all");
    setSortKey("time_desc");
    setPage(0);
    setPlatformMenuOpen(false);
  }

  const sortDim =
    sortKey === "title_asc" || sortKey === "title_desc" ? "title" : "time";

  const platformFilterLabel =
    PLATFORM_FILTER_OPTIONS.find((o) => o.value === platformFilter)?.label ?? "全部来源";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-transparent">
      {/* 顶栏 */}
      <div className="border-b border-[var(--border)] px-6 py-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-muted)]">
              Refind · 拾藏
            </p>
            <h2 className="font-display text-2xl tracking-tight text-foreground">全部收藏</h2>
            <p className="text-sm text-[var(--foreground-muted)]">
              共{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {loading ? "…" : total}
              </span>{" "}
              条 · 跨平台链接与知识结构统一管理
            </p>
          </div>
          <Link
            href="/add"
            className="btn-primary shrink-0 gap-2 self-start px-5 py-2.5 text-sm"
          >
            <FaPlus className="text-xs" aria-hidden />
            添加收藏
          </Link>
        </div>

        {/* 搜索与筛选：聚合为一块面板 */}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative min-w-0 flex-1">
            <FaMagnifyingGlass
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--foreground-faint)]"
              aria-hidden
            />
            <input
              className="input-refind !mt-0 w-full py-2.5 pl-9 pr-3 shadow-none"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="搜索标题、摘要… 用 #标签 仅匹配标签"
              autoComplete="off"
              aria-label="搜索收藏"
            />
          </div>

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            {searchHint ? <span className="text-xs font-medium text-accent">{searchHint}</span> : null}

            <div ref={filterWrapRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setFilterOpen((o) => !o);
                  setPlatformMenuOpen(false);
                }}
                className="btn-secondary h-10 gap-2 px-4 text-sm"
              >
                <FaSliders className="text-[var(--foreground-muted)]" aria-hidden />
                筛选
                {platformFilter !== "all" || sortKey !== "time_desc" ? (
                  <span
                    aria-hidden
                    className="ml-1 inline-flex h-1.5 w-1.5 rounded-full"
                    style={{
                      backgroundColor:
                        platformFilter !== "all" ? platformDotColor(platformFilter) : "rgba(55,53,47,0.35)",
                    }}
                  />
                ) : null}
              </button>
              {filterOpen ? (
                <div className="page-enter absolute right-0 top-[calc(100%+10px)] z-30 w-[min(100vw-2rem,320px)] rounded-2xl border border-[var(--border)] bg-surface p-4 text-xs text-[var(--foreground-muted)] shadow-[0_14px_36px_rgba(0,0,0,0.10)]">
                  <div className="flex items-center justify-between gap-4">
                    <span className="shrink-0 text-xs font-semibold text-foreground">来源平台</span>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setPlatformMenuOpen((o) => !o)}
                        className="inline-flex h-8 min-w-[7.5rem] max-w-[10rem] items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-surface px-3 text-left text-xs font-medium leading-tight text-foreground transition-colors duration-[var(--duration-fast)] hover:bg-[rgba(55,53,47,0.03)]"
                      >
                        <span className="min-w-0 flex-1 truncate">{platformFilterLabel}</span>
                        <FaCaretDown className="shrink-0 translate-y-px text-[10px] text-foreground" aria-hidden />
                      </button>
                      {platformMenuOpen ? (
                        <div className="page-enter home-platform-menu-scroll absolute right-0 top-full z-40 mt-2 max-h-[12.5rem] min-w-[min(100%,10rem)] max-w-[12rem] overflow-y-auto rounded-xl border border-[var(--border)] bg-surface p-2 shadow-[0_10px_26px_rgba(0,0,0,0.08)]">
                          <div className="flex flex-col gap-0.5 pr-0.5">
                            {PLATFORM_FILTER_OPTIONS.map((o) => (
                              <button
                                key={o.value}
                                type="button"
                                onClick={() => {
                                  setPlatformFilter(o.value);
                                  setPlatformMenuOpen(false);
                                }}
                                className={`rounded-xl px-3 py-2 text-left text-xs font-medium ${
                                  platformFilter === o.value
                                    ? "bg-[rgba(55,53,47,0.06)] text-foreground hover:bg-[rgba(55,53,47,0.08)]"
                                    : "text-[var(--foreground-muted)] hover:bg-[rgba(55,53,47,0.04)] hover:text-foreground"
                                }`}
                              >
                                {o.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 border-t border-[var(--border)] pt-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="shrink-0 text-xs font-semibold text-foreground">排序</span>
                      <div className="inline-flex min-w-[10.5rem] shrink-0 rounded-full bg-[rgba(55,53,47,0.05)] p-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (sortDim !== "time") setSortKey("time_desc");
                          }}
                          className={`flex-1 rounded-full px-3 py-2 text-center text-[11px] font-medium ${
                            sortDim === "time"
                              ? "bg-surface text-foreground shadow-[var(--shadow-flat)]"
                              : "bg-transparent text-[var(--foreground-muted)]"
                          }`}
                        >
                          按时间
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (sortDim !== "title") setSortKey("title_asc");
                          }}
                          className={`flex-1 rounded-full px-3 py-2 text-center text-[11px] font-medium ${
                            sortDim === "title"
                              ? "bg-surface text-foreground shadow-[var(--shadow-flat)]"
                              : "bg-transparent text-[var(--foreground-muted)]"
                          }`}
                        >
                          按标题
                        </button>
                      </div>
                    </div>

                    {sortDim === "time" ? (
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSortKey("time_desc")}
                          className={`rounded-full px-3 py-1.5 text-[11px] font-semibold shadow-sm ${
                            sortKey === "time_desc"
                              ? "bg-[var(--dominant)] text-white hover:bg-[var(--dominant-hover)]"
                              : "border border-[var(--border)] bg-surface font-medium text-[var(--foreground-muted)] hover:bg-[rgba(55,53,47,0.03)] hover:text-foreground"
                          }`}
                        >
                          从新到旧
                        </button>
                        <button
                          type="button"
                          onClick={() => setSortKey("time_asc")}
                          className={`rounded-full px-3 py-1.5 text-[11px] font-semibold shadow-sm ${
                            sortKey === "time_asc"
                              ? "bg-[var(--dominant)] text-white hover:bg-[var(--dominant-hover)]"
                              : "border border-[var(--border)] bg-surface font-medium text-[var(--foreground-muted)] hover:bg-[rgba(55,53,47,0.03)] hover:text-foreground"
                          }`}
                        >
                          从旧到新
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSortKey("title_asc")}
                          className={`rounded-full px-3 py-1.5 text-[11px] font-semibold shadow-sm ${
                            sortKey === "title_asc"
                              ? "bg-[var(--dominant)] text-white hover:bg-[var(--dominant-hover)]"
                              : "border border-[var(--border)] bg-surface font-medium text-[var(--foreground-muted)] hover:bg-[rgba(55,53,47,0.03)] hover:text-foreground"
                          }`}
                        >
                          A–Z
                        </button>
                        <button
                          type="button"
                          onClick={() => setSortKey("title_desc")}
                          className={`rounded-full px-3 py-1.5 text-[11px] font-semibold shadow-sm ${
                            sortKey === "title_desc"
                              ? "bg-[var(--dominant)] text-white hover:bg-[var(--dominant-hover)]"
                              : "border border-[var(--border)] bg-surface font-medium text-[var(--foreground-muted)] hover:bg-[rgba(55,53,47,0.03)] hover:text-foreground"
                          }`}
                        >
                          Z–A
                        </button>
                      </div>
                    )}

                    {(platformFilter !== "all" || sortKey !== "time_desc") && (
                      <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-4">
                        <span className="text-[11px] text-[var(--foreground-faint)]">已应用筛选</span>
                        <button
                          type="button"
                          onClick={resetFilters}
                          className="text-[11px] font-semibold text-foreground underline-offset-4 hover:underline"
                        >
                          重置
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {showInlineError ? (
          <div className="alert alert--danger mt-4">
            <span className="font-medium">{error}</span>
            <button
              type="button"
              className="text-sm font-semibold text-accent underline-offset-2 hover:underline"
              onClick={() => void load()}
            >
              重试
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex-1 space-y-3 px-6 py-8 lg:px-8">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-xl border border-[var(--border)] bg-surface shadow-[var(--shadow-flat)]"
              />
            ))}
          </div>
        ) : showBlockingError ? (
          <div className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-[var(--border)] bg-surface px-8 py-12 text-center shadow-[var(--shadow-card)]">
            <p className="font-display text-lg text-foreground">加载失败</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
              {error}。请检查网络或 Supabase 配置后重试。
            </p>
            <button type="button" className="btn-primary mt-6 px-8 py-3 text-sm shadow-none" onClick={() => void load()}>
              重试加载
            </button>
          </div>
        ) : emptyNoData ? (
          <div className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-dashed border-[var(--border)] bg-surface px-8 py-14 text-center shadow-[var(--shadow-flat)]">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(35,131,226,0.10)] ring-1 ring-[rgba(35,131,226,0.18)]">
              <FaRegFolderOpen className="text-xl text-accent" aria-hidden />
            </div>
            <p className="mt-6 font-display text-lg text-foreground">收藏库还是空的</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
              粘贴任意平台链接，保存当下自动生成摘要与标签，形成可检索的知识条目。
            </p>
            <Link
              href="/add"
              className="btn-primary mt-8 gap-2 px-8 py-3 text-sm shadow-none"
            >
              <FaPlus className="text-xs" aria-hidden />
              添加第一条收藏
            </Link>
          </div>
        ) : emptyFiltered ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
            <p className="text-[var(--foreground-muted)]">未找到相关内容</p>
            <p className="text-xs text-[var(--foreground-muted)]">试试用 # 开头搜索标签，或调整筛选条件</p>
            <button
              type="button"
              onClick={resetFilters}
              className="text-sm font-medium text-foreground underline underline-offset-4"
            >
              清空搜索并重置筛选
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-surface shadow-[var(--shadow-flat)]">
              <ul className="list-stagger divide-y divide-[var(--border)]">
                {pageItems.map((it, idx) => (
                  <li key={it.id}>
                    <Link
                      href={`/bookmark/${it.id}`}
                      className={`group flex gap-4 px-5 py-4 transition-colors duration-[var(--duration-fast)] hover:bg-[rgba(55,53,47,0.03)] ${
                        idx === 0 ? "rounded-t-xl" : ""
                      } ${idx === pageItems.length - 1 ? "rounded-b-xl" : ""}`}
                    >
                      <div className="relative mt-0.5 flex h-18 w-24 shrink-0 overflow-hidden rounded-lg bg-[rgba(55,53,47,0.06)]">
                        {it.preview_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.preview_image_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[var(--foreground-faint)]">
                            <FaRegImage className="text-xl" aria-hidden />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold leading-snug text-foreground">
                          {it.title || it.url}
                        </h3>
                        {it.summary ? (
                          <p className="mt-1.5 line-clamp-2 text-sm text-[var(--foreground-muted)]">
                            {it.summary}
                          </p>
                        ) : null}
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--foreground-muted)]">
                          {it.tags.slice(0, 6).map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-[rgba(55,53,47,0.06)] px-2 py-0.5 font-medium text-[var(--foreground-muted)]"
                            >
                              #{t}
                            </span>
                          ))}
                          <span className="tabular-nums">{formatDateYmd(it.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(55,53,47,0.05)] px-2 py-0.5 text-[11px] font-medium text-[var(--foreground-muted)]">
                          <span
                            aria-hidden
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: platformDotColor(it.source_platform) }}
                          />
                          {platformLabel(it.source_platform)}
                        </span>
                        <FaChevronRight className="text-sm text-[rgba(55,53,47,0.25)]" aria-hidden />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {pageCount > 1 ? (
              <div className="mt-8 flex items-center justify-center gap-2 text-sm">
                <button
                  type="button"
                  disabled={pageSafe <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[13px] text-[var(--foreground-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[rgba(55,53,47,0.03)] hover:text-foreground disabled:opacity-30"
                  aria-label="上一页"
                >
                  <FaChevronLeft className="text-sm" aria-hidden />
                </button>
                <span className="px-2 py-1 text-[12px] font-semibold tabular-nums text-[var(--foreground-muted)]">
                  {pageSafe + 1}
                  <span className="mx-1 text-[var(--foreground-faint)]">/</span>
                  {pageCount}
                </span>
                <button
                  type="button"
                  disabled={pageSafe >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[13px] text-[var(--foreground-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[rgba(55,53,47,0.03)] hover:text-foreground disabled:opacity-30"
                  aria-label="下一页"
                >
                  <FaChevronRight className="text-sm" aria-hidden />
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function GuestLanding() {
  return (
    <div className="auth-mesh-bg flex min-h-dvh flex-col items-center justify-center px-6 text-foreground">
      <div className="page-enter max-w-md text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--foreground-faint)]">
          Refind · 拾藏
        </p>
        <h1 className="mt-4 font-display text-3xl tracking-tight text-foreground">轻量知识库</h1>
        <p className="mt-3 text-lg text-[var(--foreground-muted)]">跨平台链接收藏与自动结构化</p>
        <p className="mt-5 text-sm leading-relaxed text-[var(--foreground-muted)]">
          保存链接当下生成摘要、标签与要点，统一检索与复盘。
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/login" className="btn-primary h-11 px-8 text-sm shadow-none">
            登录
          </Link>
          <Link href="/register" className="btn-secondary h-11 px-8 text-sm">
            注册
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <div className="canvas-bg flex min-h-dvh items-center justify-center">
        <div className="text-sm text-[var(--foreground-muted)]">加载中…</div>
      </div>
    );
  }

  if (!email) {
    return <GuestLanding />;
  }

  return (
    <LoggedInShell>
      <HomeMain />
    </LoggedInShell>
  );
}
