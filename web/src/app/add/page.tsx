"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FaArrowRight,
  FaCheck,
  FaRegImage,
  FaWandMagicSparkles,
} from "react-icons/fa6";
import { LoggedInShell } from "@/components/logged-in-shell";
import { TagInput } from "@/components/tag-input";
import { useToast } from "@/components/toast";
import {
  createBookmarkFromDraft,
  prepareBookmark,
} from "@/lib/bookmarks/api";
import type { PrepareBookmarkResult } from "@/lib/bookmarks/api";
import { PLATFORM_FILTER_OPTIONS } from "@/lib/bookmarks/platforms";
import { getSupabase } from "@/lib/supabase/client";
import { formatSupabaseAuthError } from "@/lib/supabase/errors";
import { normalizeUrl, validateBookmarkUrl } from "@/lib/validation";

const SOURCE_OPTIONS = PLATFORM_FILTER_OPTIONS.filter((o) => o.value !== "all");

function clampSummary(s: string, max = 150): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/[，。、；：！？\s]+$/g, "").trim();
}

export default function AddBookmarkPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState<1 | 2>(1);
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [prepareLoading, setPrepareLoading] = useState(false);
  const [draft, setDraft] = useState<PrepareBookmarkResult | null>(null);

  const [title, setTitle] = useState("");
  const [sourcePlatform, setSourcePlatform] = useState<string>("other");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
    });
  }, [router]);

  useEffect(() => {
    const err = validateBookmarkUrl(urlInput);
    setUrlError(urlInput.trim() ? err : null);
  }, [urlInput]);

  async function goPrepare() {
    const err = validateBookmarkUrl(urlInput);
    if (err) {
      setUrlError(err);
      return;
    }
    setPrepareLoading(true);
    try {
      const res = await prepareBookmark(normalizeUrl(urlInput));
      setDraft(res);
      setTitle(res.title?.trim() || "");
      setSourcePlatform(res.source_platform && res.source_platform !== "other" ? res.source_platform : "other");
      setSummary(clampSummary(res.summary));
      setTags(res.tags ?? []);
      setStep(2);
      if (!res.parse_ok) {
        toast("暂无法识别该链接，仍可保存后手动编辑", "error");
      }
    } catch (e) {
      toast(e instanceof Error ? formatSupabaseAuthError(e.message) : "预览失败，请重试", "error");
    } finally {
      setPrepareLoading(false);
    }
  }

  async function refreshPreview() {
    if (!draft) return;
    setPrepareLoading(true);
    try {
      const res = await prepareBookmark(draft.url);
      setDraft(res);
      setTitle(res.title?.trim() || "");
      setSourcePlatform(
        res.source_platform && res.source_platform !== "other" ? res.source_platform : "other"
      );
      setSummary(clampSummary(res.summary));
      setTags(res.tags ?? []);
    } catch (e) {
      toast(e instanceof Error ? formatSupabaseAuthError(e.message) : "预览加载失败，请重试", "error");
    } finally {
      setPrepareLoading(false);
    }
  }

  async function onRegenerate() {
    if (!draft) return;
    setPrepareLoading(true);
    try {
      const res = await prepareBookmark(draft.url);
      setDraft(res);
      setSummary(clampSummary(res.summary));
      setTags(res.tags ?? []);
      toast("已重新生成摘要与标签", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "重新生成失败", "error");
    } finally {
      setPrepareLoading(false);
    }
  }

  async function onSave() {
    if (!draft) return;
    const t = title.trim();
    if (!t) {
      toast("标题不能为空", "error");
      return;
    }
    setSaveLoading(true);
    try {
      await createBookmarkFromDraft({
        url: draft.url,
        title: t,
        source_platform: sourcePlatform || "other",
        excerpt: draft.excerpt,
        summary: summary.trim() || null,
        preview_image_url: draft.preview_image_url,
        author: null,
        collection_id: null,
        tags,
      });
      toast("保存收藏成功", "success");
      router.push("/");
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((e as any)?.code === "DUPLICATE_URL" || (e as Error)?.message === "DUPLICATE_URL") {
        toast("收藏已存在", "error");
      } else {
        toast(e instanceof Error ? formatSupabaseAuthError(e.message) : "保存收藏失败", "error");
      }
    } finally {
      setSaveLoading(false);
    }
  }

  const urlValid = !validateBookmarkUrl(urlInput);

  const inner = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 border-b border-[var(--border)] bg-surface px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-xl text-foreground">添加收藏</h2>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            {step === 1 ? "粘贴链接，自动识别内容" : "确认信息后保存"}
          </p>
        </div>
        <Link
          href="/"
          className="text-sm font-semibold text-[var(--foreground-muted)] underline-offset-4 hover:text-foreground hover:underline"
        >
          取消
        </Link>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6 lg:px-8 lg:py-8">
        {step === 1 ? (
          <div className="shell-frame shadow-sm">
            <div className="border-b border-[var(--border)] px-6 py-5 lg:px-8">
              <h3 className="text-sm font-bold text-foreground">链接</h3>
              <div className="mt-4">
                <input
                  type="url"
                  className={`input-refind ${urlError ? "border-red-400" : ""}`}
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="粘贴完整网址，例如 https://…"
                  autoComplete="off"
                  aria-label="链接"
                />
                {urlError ? <p className="mt-2 text-sm text-red-600">{urlError}</p> : null}
              </div>
            </div>
            <div className="flex flex-col-reverse gap-3 px-6 py-8 sm:flex-row sm:items-center sm:justify-center lg:px-8">
              <Link
                href="/"
                className="btn-secondary h-11 px-6 text-sm font-medium"
              >
                取消
              </Link>
              <button
                type="button"
                disabled={!urlValid || prepareLoading}
                onClick={() => void goPrepare()}
                className="btn-primary h-11 px-6 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
              >
                {prepareLoading ? "解析中…" : "下一步"}
              </button>
            </div>
          </div>
        ) : draft ? (
          <div className="shell-frame shadow-sm">
            <div className="border-b border-[var(--border)] px-6 py-5 lg:px-8">
              <h3 className="text-sm font-bold text-foreground">链接</h3>
              <div className="mt-5 grid gap-8 lg:grid-cols-12 lg:gap-6">
                <div className="lg:col-span-4">
                  <div className="text-xs font-semibold text-[var(--foreground-muted)]">页面预览</div>
                  <div className="relative mx-auto mt-3 flex aspect-[4/5] w-full max-w-[200px] items-center justify-center overflow-hidden rounded-xl bg-[rgba(55,53,47,0.06)] text-[var(--foreground-faint)] lg:mx-0 lg:max-w-none">
                    {draft.preview_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={draft.preview_image_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <FaRegImage className="text-3xl" aria-hidden />
                    )}
                    <button
                      type="button"
                      onClick={() => void refreshPreview()}
                      disabled={prepareLoading}
                      className="absolute bottom-2 right-2 rounded-lg bg-[rgba(28,28,30,0.72)] px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm"
                    >
                      刷新预览
                    </button>
                  </div>
                </div>

                <div className="space-y-4 lg:col-span-8">
                  {!draft.parse_ok ? (
                    <p className="text-sm font-medium text-red-600">暂无法识别该链接</p>
                  ) : null}

                  <div>
                    <label className="text-xs font-semibold text-[var(--foreground-muted)]">链接</label>
                    <input
                      readOnly
                      className="mt-2 w-full cursor-not-allowed rounded-lg border border-[var(--border)] bg-[rgba(55,53,47,0.03)] px-3 py-2.5 text-sm text-[var(--foreground-muted)] outline-none"
                      value={draft.url}
                    />
                    <p className="mt-1 text-[11px] text-[var(--foreground-muted)]">识别有误时可返回上一步修改链接</p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[rgba(55,53,47,0.03)] px-3 py-2 text-[11px] text-[var(--foreground-muted)]">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1 ${
                          draft.parse_ok
                            ? "bg-emerald-50 text-emerald-800 ring-emerald-100"
                            : "bg-[rgba(55,53,47,0.06)] text-[var(--foreground-muted)] ring-[var(--border)]"
                        }`}
                      >
                        <FaCheck className="text-[10px]" aria-hidden />
                        {draft.parse_ok ? "已解析" : "待确认"}
                      </span>
                      <span>{draft.parse_ok ? "已自动识别标题和来源" : "仍可手动填写后保存"}</span>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-[var(--foreground-muted)]">标题</label>
                      <input
                        className="input-refind"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-[var(--foreground-muted)]">来源平台</label>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {SOURCE_OPTIONS.map((o) => {
                          const on = sourcePlatform === o.value;
                          return (
                            <button
                              key={o.value}
                              type="button"
                              onClick={() => setSourcePlatform(o.value)}
                              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                                on
                                  ? "bg-[var(--dominant)] font-semibold text-white shadow-[var(--shadow-flat)]"
                                  : "border border-[var(--border)] bg-surface text-[var(--foreground-muted)] hover:bg-[rgba(55,53,47,0.03)] hover:text-foreground"
                              }`}
                            >
                              {o.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative my-10 px-6 lg:px-8">
              <div className="border-t border-[var(--border)]" />
              <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--border)] bg-surface text-[var(--foreground-muted)] shadow-[var(--shadow-flat)]">
                <FaArrowRight className="text-xs" aria-hidden />
              </div>
            </div>

            <div className="px-6 pb-8 lg:px-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-bold text-foreground">摘要与标签</h3>
                <div className="flex flex-wrap items-center gap-2">
                  {!draft.ai_error ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                      <FaCheck className="text-[10px]" aria-hidden />
                      已生成
                    </span>
                  ) : null}
                  <button
                    type="button"
                    disabled={prepareLoading}
                    onClick={() => void onRegenerate()}
                    className="rounded-lg border border-[var(--border)] bg-surface px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors duration-[var(--duration-fast)] hover:bg-[rgba(55,53,47,0.03)]"
                  >
                    重新生成
                  </button>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-[var(--foreground-muted)]">可根据需要修改摘要和标签</p>

              <div className="mt-4 rounded-xl border border-[var(--border)] bg-[rgba(55,53,47,0.03)] p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <FaWandMagicSparkles className="text-[var(--foreground-muted)]" aria-hidden />
                  摘要
                </div>
                <textarea
                  rows={6}
                  className="input-refind mt-3 w-full resize-y leading-relaxed"
                  value={summary}
                  onChange={(e) => setSummary(clampSummary(e.target.value, 2000))}
                  placeholder={draft.ai_error ? "生成失败，请重试或手动填写" : ""}
                />
                {draft.ai_error ? (
                  <p className="mt-2 text-xs text-red-600">生成失败，请重试或手动编辑后保存</p>
                ) : null}
              </div>

              <div className="mt-5">
                <div className="text-xs font-semibold text-[var(--foreground-muted)]">标签</div>
                <p className="mt-1 text-[11px] text-[var(--foreground-muted)]">编辑标签便于日后检索</p>
                <div className="mt-3">
                  <TagInput tags={tags} onChange={setTags} disabled={saveLoading} />
                </div>
              </div>

              <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setDraft(null);
                  }}
                  className="btn-secondary h-11 px-6 text-sm font-medium"
                >
                  上一步
                </button>
                <button
                  type="button"
                  disabled={saveLoading}
                  onClick={() => void onSave()}
                  className="btn-primary h-11 px-6 text-sm font-medium disabled:opacity-60"
                >
                  {saveLoading ? "保存中…" : "保存收藏"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return <LoggedInShell>{inner}</LoggedInShell>;
}
