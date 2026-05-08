"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { getSupabase } from "@/lib/supabase/client";
import { formatSupabaseAuthError } from "@/lib/supabase/errors";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    setLoading(true);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("请先配置 Supabase 环境变量");
      const origin = window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${origin}/reset-password`,
      });
      if (error) throw error;
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? formatSupabaseAuthError(e.message) : "发送失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div className="auth-card p-8 sm:p-9">
        <div>
          <h1 className="font-display text-xl text-foreground">找回密码</h1>
          <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">向注册邮箱发送 Refind 重置链接</p>
        </div>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <div>
            <label className="text-xs font-medium text-[var(--foreground-muted)]">邮箱</label>
            <input
              className="input-refind"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              autoComplete="email"
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {done ? (
            <p className="alert alert--success">
              已发送，请查收邮件（若未收到，请检查垃圾箱）。
            </p>
          ) : null}

          <button disabled={loading} type="submit" className="btn-primary mt-6 w-full py-3">
            {loading ? "发送中…" : "发送重置链接"}
          </button>

          <p className="border-t border-[var(--border)] pt-6 text-center text-sm text-[var(--foreground-muted)]">
            <Link href="/login" className="font-semibold text-foreground hover:text-accent">
              返回登录
            </Link>
          </p>
        </form>
      </div>
    </AuthShell>
  );
}
