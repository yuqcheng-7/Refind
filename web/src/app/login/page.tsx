"use client";

import Link from "next/link";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { formatSupabaseAuthError } from "@/lib/supabase/errors";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("请先配置 Supabase 环境变量");
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      if (error) throw error;
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? formatSupabaseAuthError(e.message) : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto w-full max-w-md px-6 py-12">
        <div className="text-lg font-semibold">登录</div>
        <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          使用邮箱 + 密码登录
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

          <label className="mt-4 block text-sm font-medium">密码</label>
          <input
            className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-600"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
          />

          {error ? (
            <div className="mt-3 text-sm text-red-600">{error}</div>
          ) : null}

          <button
            disabled={loading}
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {loading ? "登录中…" : "登录"}
          </button>

          <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            <Link className="text-zinc-950 underline dark:text-zinc-50" href="/forgot-password">
              忘记密码
            </Link>
            <span className="mx-2 text-zinc-400">·</span>
            还没有账号？{" "}
            <Link className="text-zinc-950 underline dark:text-zinc-50" href="/register">
              去注册
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}

