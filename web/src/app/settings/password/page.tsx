"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoggedInShell } from "@/components/logged-in-shell";
import { useToast } from "@/components/toast";
import { getSupabase } from "@/lib/supabase/client";
import { formatSupabaseAuthError } from "@/lib/supabase/errors";
import { validatePasswordRegister } from "@/lib/validation";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErr, setFieldErr] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
    });
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErr(null);
    const ne = validatePasswordRegister(next);
    if (ne) {
      setFieldErr(ne);
      return;
    }
    if (next !== again) {
      setFieldErr("两次输入的新密码不一致");
      return;
    }
    setLoading(true);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("未配置环境变量");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const email = user?.email?.trim();
      if (!email) throw new Error("无法获取登录邮箱");

      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (signErr) {
        setFieldErr("旧密码不正确");
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw error;
      toast("密码已更新", "success");
      router.push("/settings");
    } catch (e) {
      toast(e instanceof Error ? formatSupabaseAuthError(e.message) : "修改失败", "error");
    } finally {
      setLoading(false);
    }
  }

  const inner = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[var(--border)] bg-surface px-6 py-5">
        <h2 className="font-display text-xl text-foreground">修改密码</h2>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-md">
          <form onSubmit={onSubmit} className="shell-frame space-y-4 p-6">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">
                当前密码
              </label>
              <input
                type="password"
                autoComplete="current-password"
                className="input-refind"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">
                新密码
              </label>
              <input
                type="password"
                autoComplete="new-password"
                className="input-refind"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="至少 8 位字符"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">
                确认新密码
              </label>
              <input
                type="password"
                autoComplete="new-password"
                className="input-refind"
                value={again}
                onChange={(e) => setAgain(e.target.value)}
              />
            </div>
            {fieldErr ? <p className="text-sm text-red-600">{fieldErr}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary mt-2 w-full py-3 text-sm"
            >
              {loading ? "提交中…" : "保存"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return <LoggedInShell>{inner}</LoggedInShell>;
}
