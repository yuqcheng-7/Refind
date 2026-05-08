"use client";

import Link from "next/link";

type Props = {
  children: React.ReactNode;
};

/**
 * 登录 / 注册：极简分栏 + 极轻品牌氛围（无重渐变、无强装饰）
 */
export function AuthShell({ children }: Props) {
  return (
    <div className="auth-mesh-bg relative min-h-dvh overflow-hidden text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(251,251,250,0)_0%,rgba(251,251,250,0.85)_100%)]" aria-hidden />

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-[1100px] flex-col lg:flex-row lg:items-stretch">
        <aside className="relative hidden flex-1 flex-col justify-between px-12 py-14 lg:flex xl:px-16 xl:py-16">
          <div>
            <Link
              href="/"
              className="group inline-flex flex-col gap-1 transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:opacity-80"
            >
              <span className="font-display text-3xl tracking-tight text-foreground">Refind</span>
              <span className="text-sm font-medium tracking-[0.18em] text-[var(--foreground-muted)]">
                拾藏
              </span>
            </Link>
            <p className="mt-10 max-w-[340px] text-[15px] leading-[1.65] text-[var(--foreground-muted)]">
              跨平台统一收藏链接；保存时自动生成摘要、标签与结构化要点，搭建你的轻量知识库。
            </p>
          </div>
          <p className="text-xs text-[var(--foreground-faint)]">Refind · 链接收藏与知识沉淀</p>
        </aside>

        <div className="border-b border-[var(--border)] bg-surface/85 px-6 py-5 backdrop-blur-sm lg:hidden">
          <Link href="/" className="inline-flex flex-col gap-0.5">
            <span className="font-display text-xl tracking-tight text-foreground">Refind</span>
            <span className="text-[11px] font-medium tracking-[0.16em] text-[var(--foreground-muted)]">
              拾藏
            </span>
          </Link>
        </div>

        <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-10 lg:max-w-[460px] lg:flex-none lg:border-l lg:border-[var(--border)] lg:bg-surface/60 lg:py-16 lg:backdrop-blur-[2px] xl:max-w-[480px]">
          <div className="page-enter mx-auto w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  );
}
