"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";

const MAX = 6;
const MAX_LEN = 12;

type Props = {
  tags: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
};

export function TagInput({ tags, onChange, disabled }: Props) {
  const { toast } = useToast();
  const [input, setInput] = useState("");

  function addOne(raw: string) {
    const t = raw.trim().replace(/^#/, "");
    if (!t) return;
    if (t.length > MAX_LEN) {
      toast("单个标签最多 12 个字", "error");
      return;
    }
    if (tags.length >= MAX) {
      toast("最多添加 6 个标签", "error");
      return;
    }
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    onChange([...tags, t]);
    setInput("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addOne(input);
    }
  }

  return (
    <div>
      <div className="flex min-h-10 flex-wrap gap-2">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[rgba(55,53,47,0.03)] px-2 py-0.5 text-xs font-medium text-[var(--foreground-muted)]"
          >
            #{t}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(tags.filter((x) => x !== t))}
              className="ml-0.5 text-[var(--foreground-faint)] transition-colors duration-[var(--duration-fast)] hover:text-foreground"
              aria-label={`删除 ${t}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      {tags.length < MAX ? (
        <input
          className="input-refind h-10"
          value={input}
          disabled={disabled}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="添加标签，回车确认"
        />
      ) : (
        <p className="mt-2 text-xs text-[var(--foreground-muted)]">已达 6 个标签上限</p>
      )}
    </div>
  );
}
