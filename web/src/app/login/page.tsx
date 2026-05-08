"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { useToast } from "@/components/toast";
import { getSupabase } from "@/lib/supabase/client";
import { formatSupabaseAuthError } from "@/lib/supabase/errors";
import { validateEmail, validatePasswordLogin } from "@/lib/validation";

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [pwdErr, setPwdErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailErr(null);
    setPwdErr(null);
    const ve = validateEmail(email);
    if (ve) {
      setEmailErr(ve);
      return;
    }
    const vp = validatePasswordLogin(password);
    if (vp) {
      setPwdErr(vp);
      return;
    }
    setLoading(true);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("请先配置 Supabase 环境变量");
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      router.replace("/");
    } catch (e) {
      const msg = e instanceof Error ? formatSupabaseAuthError(e.message) : "登录失败";
      const low = msg.toLowerCase();
      if (low.includes("network") || low.includes("fetch") || msg.includes("网络")) {
        toast("网络异常，请稍后再试", "error");
        return;
      }
      if (
        msg.includes("账号") ||
        msg.includes("密码") ||
        low.includes("credential") ||
        low.includes("invalid login")
      ) {
        setPwdErr(msg.includes("不正确") ? msg : "账号或密码不正确。");
      } else {
        toast(msg, "error");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div className="auth-card p-8 sm:p-9">
        <div>
          <h1 className="font-display text-xl text-foreground">欢迎回来</h1>
          <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">使用邮箱登录 Refind，同步你的收藏</p>
        </div>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <div>
            <label className="text-xs font-medium text-[var(--foreground-muted)]">邮箱</label>
            <input
              className={`input-refind ${emailErr ? "border-red-400 focus:border-red-400 focus:ring-red-200/50" : ""}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              autoComplete="email"
            />
            {emailErr ? <p className="mt-1.5 text-sm text-red-600">{emailErr}</p> : null}
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--foreground-muted)]">密码</label>
            <input
              className={`input-refind ${pwdErr ? "border-red-400 focus:border-red-400 focus:ring-red-200/50" : ""}`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="密码"
              autoComplete="current-password"
            />
            {pwdErr ? <p className="mt-1.5 text-sm text-red-600">{pwdErr}</p> : null}
          </div>

          <button disabled={loading} type="submit" className="btn-primary mt-6 w-full py-3">
            {loading ? "登录中…" : "登录"}
          </button>

          <p className="text-center text-[13px]">
            <Link
              href="/forgot-password"
              className="font-medium text-[var(--foreground-muted)] underline-offset-4 hover:text-accent hover:underline"
            >
              忘记密码？
            </Link>
          </p>

          <p className="border-t border-[var(--border)] pt-6 text-center text-sm text-[var(--foreground-muted)]">
            还没有账户？{" "}
            <Link href="/register" className="font-semibold text-foreground hover:text-accent">
              注册 Refind
            </Link>
          </p>
        </form>
      </div>
    </AuthShell>
  );
}
