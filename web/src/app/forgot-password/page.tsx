"use client";

import Link from "next/link";
import { useState } from "react";
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
    <div className="min-h-dvh bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto w-full max-w-md px-6 py-12">
        <div className="text-lg font-semibold">找回密码</div>
        <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          输入邮箱，我们会发送重置密码链接
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <label className="block text-sm font-medium">邮箱</label>
          <input
            className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-600"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            autoComplete="email"
          />

          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
          {done ? (
            <div className="mt-3 text-sm text-emerald-600">
              已发送。如果没收到，请检查垃圾箱或稍后再试。
            </div>
          ) : null}

          <button
            disabled={loading}
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {loading ? "发送中…" : "发送重置链接"}
          </button>

          <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            <Link className="text-zinc-950 underline dark:text-zinc-50" href="/login">
              返回登录
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}

