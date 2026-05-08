"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FaArrowLeft, FaArrowUpRightFromSquare, FaCheck, FaWandMagicSparkles } from "react-icons/fa6";
import { ConfirmModal } from "@/components/confirm-modal";
import { LoggedInShell } from "@/components/logged-in-shell";
import { TagInput } from "@/components/tag-input";
import { useToast } from "@/components/toast";
import {
  deleteBookmark,
  getBookmark,
  retryBookmarkAi,
  setBookmarkTags,
  updateBookmark,
} from "@/lib/bookmarks/api";
import { platformLabel } from "@/lib/bookmarks/platforms";
import type { BookmarkWithTags } from "@/lib/bookmarks/types";
import { getSupabase } from "@/lib/supabase/client";
import { formatSupabaseAuthError } from "@/lib/supabase/errors";

function formatDateYmd(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function safeOpenUrl(href: string, toast: (m: string, v?: "error" | "success" | "info") => void) {
  try {
    const u = new URL(href);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      toast("无法打开链接", "error");
      return;
    }
    window.open(href, "_blank", "noopener,noreferrer");
  } catch {
    toast("无法打开链接", "error");
  }
}

export default function BookmarkDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const id = params?.id;
  const [item, setItem] = useState<BookmarkWithTags | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [retryConfirmOpen, setRetryConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const b = await getBookmark(id);
      setItem(b);
      if (b) {
        setEditTitle(b.title ?? "");
        setEditAuthor(b.author ?? "");
        setEditSummary(b.summary ?? "");
        setEditTags([...b.tags]);
      }
    } catch (e) {
      setError(e instanceof Error ? formatSupabaseAuthError(e.message) : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
    });
  }, [router]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function runRetryAi() {
    if (!item) return;
    setRetrying(true);
    setRetryConfirmOpen(false);
    setError(null);
    try {
      await retryBookmarkAi(item.id);
      toast("已重新生成摘要与标签", "success");
      await load();
    } catch (e) {
      setError(e instanceof Error ? formatSupabaseAuthError(e.message) : "重试失败");
      toast("生成失败，请重试", "error");
    } finally {
      setRetrying(false);
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    const t = editTitle.trim();
    if (!t) {
      toast("标题不能为空", "error");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateBookmark(item.id, {
        title: t,
        summary: editSummary.trim() || null,
        author: editAuthor.trim() || null,
      });
      await setBookmarkTags(item.id, editTags);
      toast("已保存", "success");
      setEditing(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? formatSupabaseAuthError(e.message) : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function onConfirmDelete() {
    if (!item) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteBookmark(item.id);
      toast("已删除", "success");
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? formatSupabaseAuthError(e.message) : "删除失败");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  function onCancelEdit() {
    if (!item) return;
    setEditTitle(item.title ?? "");
    setEditAuthor(item.author ?? "");
    setEditSummary(item.summary ?? "");
    setEditTags([...item.tags]);
    setEditing(false);
  }

  const body = (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top nav bar */}
      <div className="flex flex-col gap-3 border-b border-[var(--border)] bg-surface px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--foreground-muted)] hover:text-foreground"
        >
          <FaArrowLeft className="text-xs" aria-hidden />
          返回
        </Link>
        {item ? (
          <div className="flex flex-wrap gap-2">
            {!editing ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="btn-secondary h-9 px-3 text-xs"
              >
                编辑
              </button>
            ) : null}
            <button
              type="button"
              disabled={retrying}
              onClick={() => setRetryConfirmOpen(true)}
              className="btn-secondary h-9 px-3 text-xs disabled:opacity-50"
            >
              {retrying ? "生成中…" : "重新生成"}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setDeleteOpen(true)}
              className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              删除
            </button>
          </div>
        ) : null}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {error ? (
          <div className="px-6 py-4 text-sm text-red-600">{error}</div>
        ) : null}

        {loading ? (
          <div className="grid gap-6 p-6 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-4">
              <div className="aspect-[4/5] w-full animate-pulse rounded-xl bg-[rgba(55,53,47,0.06)]" />
            </div>
            <div className="space-y-4 lg:col-span-8">
              <div className="h-8 w-3/4 animate-pulse rounded-lg bg-[rgba(55,53,47,0.06)]" />
              <div className="h-4 w-1/3 animate-pulse rounded-lg bg-[rgba(55,53,47,0.06)]" />
              <div className="h-32 animate-pulse rounded-xl bg-[rgba(55,53,47,0.06)]" />
            </div>
          </div>
        ) : item ? (
          editing ? (
            /* ── Edit mode ── */
            <form onSubmit={onSave} className="grid gap-6 p-6 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <div className="text-xs font-semibold text-[var(--foreground-muted)]">网页预览</div>
                <div className="mt-3 flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-xl bg-[rgba(55,53,47,0.06)] text-[var(--foreground-faint)]">
                  {item.preview_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.preview_image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm">无预览图</span>
                  )}
                </div>
                <div className="mt-3 rounded-lg border border-[var(--border)] bg-[rgba(55,53,47,0.03)] px-3 py-2 text-[11px] text-[var(--foreground-muted)]">
                  来源（锁定）：
                  <span className="ml-1 font-semibold text-foreground">
                    {platformLabel(item.source_platform)}
                  </span>
                </div>
              </div>

              <div className="space-y-4 lg:col-span-8">
                <div>
                  <label className="text-xs font-semibold text-[var(--foreground-muted)]">标题</label>
                  <input
                    className="input-refind"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--foreground-muted)]">作者</label>
                  <input
                    className="input-refind"
                    value={editAuthor}
                    onChange={(e) => setEditAuthor(e.target.value)}
                    placeholder="（可选）"
                  />
                </div>

                {item.excerpt?.trim() ? (
                  <div className="rounded-xl border border-[var(--border)] bg-[rgba(55,53,47,0.03)] p-4">
                    <div className="text-xs font-semibold text-[var(--foreground-muted)]">内容节选（只读）</div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-[var(--foreground-muted)]">
                      {item.excerpt}
                    </div>
                  </div>
                ) : null}

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[var(--foreground-muted)]">摘要</label>
                    <button
                      type="button"
                      disabled={retrying}
                      onClick={() => setRetryConfirmOpen(true)}
                      className="text-[11px] font-medium text-[var(--foreground-muted)] underline-offset-2 hover:text-foreground hover:underline"
                    >
                      重新生成
                    </button>
                  </div>
                  <textarea
                    rows={5}
                    className="input-refind mt-2 w-full resize-y"
                    value={editSummary}
                    onChange={(e) => setEditSummary(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--foreground-muted)]">标签</label>
                  <div className="mt-2">
                    <TagInput tags={editTags} onChange={setEditTags} disabled={saving} />
                  </div>
                </div>

                {error ? <p className="text-sm text-red-600">{error}</p> : null}

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="btn-primary rounded-lg px-6 py-2.5 disabled:opacity-50"
                  >
                    {saving ? "保存中…" : "保存"}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={onCancelEdit}
                    className="btn-secondary px-6 py-2.5 text-sm"
                  >
                    取消
                  </button>
                </div>
              </div>
            </form>
          ) : (
            /* ── View mode ── */
            <div className="grid gap-0 lg:grid-cols-12">
              <div className="border-b border-[var(--border)] p-6 lg:col-span-4 lg:border-b-0 lg:border-r">
                <div className="text-xs font-semibold text-[var(--foreground-muted)]">网页预览</div>
                <div className="mt-3 flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-xl bg-[rgba(55,53,47,0.06)] text-[var(--foreground-faint)]">
                  {item.preview_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.preview_image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm">无预览图</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => safeOpenUrl(item.url, toast)}
                  className="btn-primary mt-4 inline-flex w-full gap-2 py-3"
                >
                  <FaArrowUpRightFromSquare className="text-xs" aria-hidden />
                  访问原文
                </button>
              </div>

              <div className="p-6 lg:col-span-8">
                <h1 className="font-display text-xl font-normal leading-snug text-foreground lg:text-2xl">
                  {item.title || item.url}
                </h1>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--foreground-muted)]">
                  <span className="rounded-full bg-[rgba(55,53,47,0.06)] px-2.5 py-1 font-semibold text-[var(--foreground-muted)]">
                    {platformLabel(item.source_platform)}
                  </span>
                  {item.author?.trim() ? (
                    <span>{item.author}</span>
                  ) : null}
                  <span>{formatDateYmd(item.created_at)}</span>
                </div>

                {item.excerpt?.trim() ? (
                  <div className="mt-5 rounded-xl border border-[var(--border)] bg-[rgba(55,53,47,0.03)] p-4">
                    <div className="text-xs font-semibold text-[var(--foreground-muted)]">内容节选</div>
                    <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground-muted)]">
                      {item.excerpt}
                    </div>
                  </div>
                ) : null}

                {item.summary ? (
                  <div className="mt-5">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground-muted)]">
                      <FaWandMagicSparkles aria-hidden />
                      AI 摘要
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-foreground">{item.summary}</p>
                  </div>
                ) : (
                  <div className="mt-5 flex items-center gap-2 rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--foreground-faint)]">
                    <FaWandMagicSparkles aria-hidden />
                    摘要生成中，或点击「重新生成」触发
                  </div>
                )}

                {item.tags.length ? (
                  <div className="mt-5">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground-muted)]">
                      标签
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.tags.slice(0, 6).map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-[var(--border)] bg-surface px-3 py-1 text-xs font-medium text-foreground"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {item.ai_status === "done" && !item.summary ? (
                  <div className="mt-4 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                    <FaCheck className="text-[10px]" aria-hidden />
                    已生成
                  </div>
                ) : null}
              </div>
            </div>
          )
        ) : (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
            <p className="text-[var(--foreground-muted)]">未找到该收藏，或无访问权限</p>
            <Link href="/" className="text-sm font-semibold underline-offset-4 hover:underline">
              返回首页
            </Link>
          </div>
        )}
      </div>

      <ConfirmModal
        open={deleteOpen}
        title="删除收藏"
        description="删除后不可恢复，确定继续吗？"
        confirmText="删除"
        danger
        loading={deleting}
        onClose={() => !deleting && setDeleteOpen(false)}
        onConfirm={onConfirmDelete}
      />

      <ConfirmModal
        open={retryConfirmOpen}
        title="重新生成摘要与标签"
        description="将覆盖当前摘要与标签。是否继续？"
        confirmText="继续生成"
        loading={retrying}
        onClose={() => !retrying && setRetryConfirmOpen(false)}
        onConfirm={() => void runRetryAi()}
      />
    </div>
  );

  return <LoggedInShell>{body}</LoggedInShell>;
}
