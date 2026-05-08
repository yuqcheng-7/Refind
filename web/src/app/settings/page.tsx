"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ConfirmModal } from "@/components/confirm-modal";
import { LoggedInShell } from "@/components/logged-in-shell";
import { useToast } from "@/components/toast";
import { getSupabase } from "@/lib/supabase/client";
import {
  getProfile,
  purgeMyData,
  updateProfile,
} from "@/lib/bookmarks/api";
import type { Profile } from "@/lib/bookmarks/types";
import { formatSupabaseAuthError } from "@/lib/supabase/errors";

function dicebear(seed: string) {
  const s = encodeURIComponent(seed);
  // Public avatar generator; returns SVG.
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${s}`;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeLoading, setPurgeLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const p = await getProfile();
      setProfile(p);
      if (p) {
        setDisplayName(p.display_name ?? "");
        setAvatarUrl(p.avatar_url ?? dicebear(p.id));
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
  }, []);

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setError(null);
    try {
      await updateProfile({
        display_name: displayName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      });
      window.dispatchEvent(
        new CustomEvent("refind:profile-updated", {
          detail: { display_name: displayName.trim() || null, avatar_url: avatarUrl.trim() || null },
        })
      );
      toast("已保存", "success");
      await load();
    } catch (e) {
      setError(e instanceof Error ? formatSupabaseAuthError(e.message) : "保存失败");
    } finally {
      setSavingProfile(false);
    }
  }

  const inner = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[var(--border)] bg-surface px-6 py-5">
        <h2 className="font-display text-xl text-foreground">账户设置</h2>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-2xl">
        {loading ? (
          <div className="h-64 animate-pulse rounded-2xl bg-[rgba(55,53,47,0.06)]" />
        ) : profile ? (
          <form onSubmit={onSaveProfile}>
            <div className="pb-6">
              <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
                你的个人资料仅在点击「保存更改」后生效
              </p>
              {error ? <div className="alert alert--danger mt-4">{error}</div> : null}
            </div>

            <div className="divide-y divide-[var(--border)]">
              <section className="py-6">
                <div className="flex items-baseline justify-between gap-6">
                  <div>
                    <h3 className="font-display text-base text-foreground">个人信息</h3>
                    <p className="mt-1 text-xs text-[var(--foreground-muted)]">头像与用户名用于侧边栏展示</p>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="flex flex-col gap-0">
                    <div className="flex flex-col gap-4 border-b border-[var(--border)] py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-4">
                        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--dominant)] text-base font-semibold text-white">
                          {avatarUrl && (avatarUrl.startsWith("http") || avatarUrl.startsWith("data:")) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span>{(displayName[0] || profile.email?.[0] || "?").toUpperCase()}</span>
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-foreground">头像</div>
                          <div className="mt-0.5 text-xs text-[var(--foreground-muted)]">自动生成（DiceBear），可一键更换</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="btn-secondary h-11 px-6 text-sm font-medium"
                          onClick={() => setAvatarUrl(dicebear(`${profile.id}-${Date.now()}`))}
                        >
                          换一个
                        </button>
                        <button
                          type="button"
                          className="btn-secondary h-11 px-6 text-sm font-medium"
                          onClick={() => setAvatarUrl(dicebear(profile.id))}
                        >
                          重置
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 border-b border-[var(--border)] py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-medium text-foreground">用户名</div>
                        <div className="mt-0.5 text-xs text-[var(--foreground-muted)]">用于展示与检索个性化信息</div>
                      </div>
                      <input
                        className="input-refind !mt-0 w-full sm:w-[18rem]"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="张三"
                      />
                    </div>

                    <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-medium text-foreground">登录账号</div>
                        <div className="mt-0.5 text-xs text-[var(--foreground-muted)]">登录账号暂不支持修改</div>
                      </div>
                      <div className="w-full rounded-xl bg-[rgba(55,53,47,0.04)] px-3 py-2.5 text-sm text-[var(--foreground-muted)] sm:w-[18rem]">
                        {profile.email ?? "—"}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="py-6">
                <div className="flex items-center justify-between gap-6">
                  <div>
                    <h3 className="font-display text-base text-foreground">安全</h3>
                    <p className="mt-1 text-xs text-[var(--foreground-muted)]">用于更新你的登录凭证</p>
                  </div>
                  <Link href="/settings/password" className="btn-secondary h-11 px-6 text-sm font-medium">
                    修改密码
                  </Link>
                </div>
              </section>

              <section className="py-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                  <div>
                    <h3 className="font-display text-base text-foreground">注销账户</h3>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--foreground-muted)]">
                      注销后将永久删除你的收藏与账户信息，且无法恢复
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-[rgba(220,38,38,0.08)] px-6 text-sm font-semibold text-[rgb(153,27,27)] transition-colors duration-[var(--duration-fast)] hover:bg-[rgba(220,38,38,0.12)]"
                    onClick={() => setPurgeOpen(true)}
                  >
                    注销账户
                  </button>
                </div>
              </section>
            </div>

            <div className="sticky bottom-0 flex items-center justify-between gap-4 border-t border-[var(--border)] bg-transparent py-4">
              <span className="text-xs text-[var(--foreground-faint)]">
                {savingProfile ? "正在保存…" : " "}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="btn-secondary h-11 px-6 text-sm font-medium"
                  onClick={() => {
                    setDisplayName(profile.display_name ?? "");
                    setAvatarUrl(profile.avatar_url ?? dicebear(profile.id));
                  }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="btn-primary h-11 px-6 text-sm font-medium shadow-none"
                >
                  保存更改
                </button>
              </div>
            </div>
          </form>
        ) : null}
      </div>
      </div>

      <ConfirmModal
        open={privacyOpen}
        title="隐私说明"
        description="我们会存储：账号邮箱、你提交的链接、解析得到的标题与摘要、AI 生成的标签，用于展示与检索。不向第三方出售数据。你可随时删除单条收藏。"
        confirmText="知道了"
        hideCancel
        onClose={() => setPrivacyOpen(false)}
        onConfirm={() => setPrivacyOpen(false)}
      />

      <ConfirmModal
        open={purgeOpen}
        title="注销账号"
        description="该操作会清空你的收藏/标签/分组与个人资料，然后退出登录。此操作不可恢复。确定继续吗？"
        confirmText={purgeLoading ? "处理中…" : "确认注销"}
        cancelText="取消"
        danger
        loading={purgeLoading}
        onClose={() => !purgeLoading && setPurgeOpen(false)}
        onConfirm={async () => {
          setPurgeLoading(true);
          setError(null);
          try {
            await purgeMyData();
            toast("已注销并退出登录", "success");
            router.replace("/login");
          } catch (e) {
            setError(e instanceof Error ? formatSupabaseAuthError(e.message) : "注销失败");
          } finally {
            setPurgeLoading(false);
            setPurgeOpen(false);
          }
        }}
      />
    </div>
  );

  return <LoggedInShell>{inner}</LoggedInShell>;
}

