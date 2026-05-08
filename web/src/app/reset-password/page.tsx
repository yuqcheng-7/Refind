"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { getSupabase } from "@/lib/supabase/client";
import { formatSupabaseAuthError } from "@/lib/supabase/errors";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {}, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    setLoading(true);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("请先配置 Supabase 环境变量");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? formatSupabaseAuthError(e.message) : "重置失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div className="auth-card p-8 sm:p-9">
        <div>
          <h1 className="font-display text-xl text-foreground">设置新密码</h1>
          <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">为你的 Refind 账户设定新密码</p>
        </div>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <div>
            <label className="text-xs font-medium text-[var(--foreground-muted)]">新密码</label>
            <input
              className="input-refind"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="至少 8 位字符"
              autoComplete="new-password"
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {done ? (
            <p className="alert alert--success">
              密码已更新，可以登录了。
            </p>
          ) : null}

          <button disabled={loading} type="submit" className="btn-primary mt-6 w-full py-3">
            {loading ? "更新中…" : "确认更新"}
          </button>

          {done ? (
            <p className="border-t border-[var(--border)] pt-6 text-center text-sm text-[var(--foreground-muted)]">
              <Link href="/login" className="font-semibold text-foreground hover:text-accent">
                去登录 Refind
              </Link>
            </p>
          ) : null}
        </form>
      </div>
    </AuthShell>
  );
}
