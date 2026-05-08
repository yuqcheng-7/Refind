"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FaGear, FaHouse } from "react-icons/fa6";
import { ConfirmModal } from "@/components/confirm-modal";
import { useToast } from "@/components/toast";
import { getProfile } from "@/lib/bookmarks/api";
import type { Profile } from "@/lib/bookmarks/types";
import { getSupabase } from "@/lib/supabase/client";
import { formatSupabaseAuthError } from "@/lib/supabase/errors";

type Props = {
  children: React.ReactNode;
};

export function LoggedInShell({ children }: Props) {
  const pathname = usePathname();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  useEffect(() => {
    let cancel = false;
    getProfile()
      .then((p) => {
        if (!cancel) setProfile(p);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [pathname]);

  useEffect(() => {
    function onProfileUpdated(e: Event) {
      const ce = e as CustomEvent<Partial<Profile> & { id?: string }>;
      const patch = ce.detail ?? {};
      setProfile((prev) => (prev ? { ...prev, ...patch } : (patch as Profile)));
    }
    window.addEventListener("refind:profile-updated", onProfileUpdated as EventListener);
    return () => window.removeEventListener("refind:profile-updated", onProfileUpdated as EventListener);
  }, []);

  const display = profile?.display_name?.trim() || "用户";
  const email = profile?.email ?? "";
  const initial = (display[0] || email[0] || "?").toUpperCase();
  const avatar = profile?.avatar_url?.trim();

  function navCls(active: boolean) {
    return active
      ? "relative flex items-center gap-2 rounded-lg bg-[rgba(55,53,47,0.04)] px-3 py-2.5 text-sm font-medium text-foreground before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-accent before:content-['']"
      : "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--foreground-muted)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-[rgba(55,53,47,0.03)] hover:text-foreground";
  }

  async function onLogout() {
    setLogoutLoading(true);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("未配置环境");
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      window.location.href = "/login";
    } catch (e) {
      toast(
        e instanceof Error ? formatSupabaseAuthError(e.message) : "退出失败，请重试",
        "error"
      );
    } finally {
      setLogoutLoading(false);
      setLogoutOpen(false);
    }
  }

  const homeActive = pathname === "/";

  return (
    <div className="canvas-bg min-h-dvh text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-[1600px] flex-col px-4 py-6">
        <div className="shell-frame flex min-h-[560px] flex-1 flex-col overflow-hidden bg-[rgba(55,53,47,0.02)] lg:flex-row">
          <aside className="flex w-full flex-col border-b border-[var(--border)] bg-[rgba(55,53,47,0.02)] lg:w-[280px] lg:border-b-0 lg:border-r lg:border-[var(--border)]">
            <Link
              href="/"
              className="flex items-baseline gap-2 border-b border-[var(--border)] px-5 py-4 transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-[rgba(55,53,47,0.03)]"
            >
              <span className="font-display text-[15px] tracking-tight text-foreground">Refind</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-muted)]">
                拾藏
              </span>
            </Link>
            <div className="border-b border-[var(--border)] p-5">
              <div className="flex items-center gap-3">
                <div className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-md bg-[var(--dominant)] text-sm font-semibold text-white ring-1 ring-[var(--border)]">
                  {avatar && (avatar.startsWith("http") || avatar.startsWith("data:")) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center">{initial}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{display}</div>
                  <div className="truncate text-xs text-[var(--foreground-muted)]">{email}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLogoutOpen(true)}
                className="mt-4 flex w-full items-center justify-center rounded-md border border-[var(--border)] bg-surface py-2 text-xs font-medium text-[var(--foreground-muted)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:border-[rgba(55,53,47,0.18)] hover:bg-[rgba(55,53,47,0.03)] hover:text-foreground active:bg-[rgba(55,53,47,0.05)]"
              >
                退出登录
              </button>
            </div>

            <nav className="flex flex-1 flex-col space-y-1 p-3">
              <Link className={navCls(homeActive)} href="/">
                <FaHouse className={homeActive ? "text-foreground" : "text-[var(--foreground-muted)]"} aria-hidden />
                全部收藏
              </Link>
            </nav>

            <div className="border-t border-[var(--border)] p-3">
              <Link
                href="/settings"
                className={navCls(!!pathname?.startsWith("/settings"))}
              >
                <FaGear
                  className={pathname?.startsWith("/settings") ? "text-foreground" : "text-[var(--foreground-muted)]"}
                  aria-hidden
                />
                设置
              </Link>
            </div>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto bg-[rgba(55,53,47,0.02)]">
            {children}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={logoutOpen}
        title="退出登录"
        description="确定要退出当前账号吗？"
        confirmText="退出"
        danger
        loading={logoutLoading}
        onClose={() => !logoutLoading && setLogoutOpen(false)}
        onConfirm={onLogout}
      />
    </div>
  );
}
