"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

export function SiteHeader() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-6">
      <Link href="/" className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--dominant)] shadow-[var(--shadow-flat)]"
          aria-hidden
        />
        <div>
          <div className="font-display text-base leading-6 text-foreground">Refind</div>
          <div className="text-xs text-[var(--foreground-muted)]">轻量知识管理 · 链接与摘要</div>
        </div>
      </Link>

      <nav className="flex flex-wrap items-center gap-1.5">
        {email ? (
          <>
            <Link
              className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-medium text-[var(--foreground-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[rgba(55,53,47,0.05)] hover:text-foreground"
              href="/add"
            >
              添加收藏
            </Link>
            <Link
              className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-medium text-[var(--foreground-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[rgba(55,53,47,0.05)] hover:text-foreground"
              href="/settings"
            >
              设置
            </Link>
            <button
              type="button"
              className="btn-primary h-9 px-4 text-sm"
              onClick={() => getSupabase()?.auth.signOut()}
            >
              退出
            </button>
          </>
        ) : (
          <>
            <Link
              className="btn-secondary h-9 px-4 text-sm"
              href="/login"
            >
              登录
            </Link>
            <Link className="btn-primary h-9 px-4 text-sm" href="/register">
              注册
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
