/** PRD 3.3 筛选：来源平台选项（与入库 source_platform 对齐） */

export type PlatformFilterValue =
  | "all"
  | "xiaohongshu"
  | "douyin"
  | "wechat"
  | "zhihu"
  | "bilibili"
  | "other";

export const PLATFORM_FILTER_OPTIONS: { value: PlatformFilterValue; label: string }[] = [
  { value: "all", label: "全部来源" },
  { value: "xiaohongshu", label: "小红书" },
  { value: "douyin", label: "抖音" },
  { value: "wechat", label: "微信" },
  { value: "zhihu", label: "知乎" },
  { value: "bilibili", label: "B站" },
  { value: "other", label: "其他" },
];

export function platformLabel(stored: string | null | undefined): string {
  if (!stored) return "其他";
  const row = PLATFORM_FILTER_OPTIONS.find((o) => o.value === stored);
  return row?.label ?? "其他";
}
