"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { useToast } from "@/components/toast";
import { getSupabase } from "@/lib/supabase/client";
import { formatSupabaseAuthError } from "@/lib/supabase/errors";
import { validateEmail, validatePasswordRegister } from "@/lib/validation";

export default function RegisterPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [pwdErr, setPwdErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailErr(null);
    setPwdErr(null);
    const ve = validateEmail(email);
    if (ve) {
      setEmailErr(ve);
      return;
    }
    const vp = validatePasswordRegister(password);
    if (vp) {
      setPwdErr(vp === "密码不正确" ? "密码：至少 8 位，建议包含字母和数字" : vp);
      return;
    }
    setLoading(true);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("请先配置 Supabase 环境变量");
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      setDone(true);
      toast("账号创建成功", "success");
    } catch (e) {
      const msg = e instanceof Error ? formatSupabaseAuthError(e.message) : "注册失败";
      const low = msg.toLowerCase();
      if (low.includes("network") || low.includes("fetch")) {
        toast("网络异常，请稍后再试", "error");
        return;
      }
      if (msg.includes("已存在")) {
        setEmailErr(msg);
      } else if (msg.includes("密码")) {
        setPwdErr(msg);
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
          <h1 className="font-display text-xl text-foreground">创建 Refind 账户</h1>
          <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">用你的邮箱开始搭建跨平台收藏库</p>
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
            {emailErr ? <p className="mt-1 text-sm text-red-600">{emailErr}</p> : null}
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--foreground-muted)]">密码</label>
            <input
              className={`input-refind ${pwdErr ? "border-red-400 focus:border-red-400 focus:ring-red-200/50" : ""}`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="至少 8 位字符"
              autoComplete="new-password"
            />
            {pwdErr ? <p className="mt-1 text-sm text-red-600">{pwdErr}</p> : null}
          </div>

          {done ? (
            <div className="alert alert--success">
              注册成功，请查收邮件完成验证后再登录。
            </div>
          ) : null}

          <button
            disabled={loading || done}
            type="submit"
            className="btn-primary mt-6 w-full py-3 disabled:opacity-60"
          >
            {loading ? "创建中…" : done ? "已完成" : "创建账户"}
          </button>

          <p className="border-t border-[var(--border)] pt-6 text-center text-sm text-[var(--foreground-muted)]">
            已有账户？{" "}
            <Link href="/login" className="font-semibold text-foreground hover:text-accent">
              登录
            </Link>
          </p>
        </form>
      </div>
    </AuthShell>
  );
}
