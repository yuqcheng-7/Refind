"""Refind platform codes ↔ MediaCrawler platform codes."""

from __future__ import annotations

REFIND_TO_MC: dict[str, str] = {
  "xhs": "xhs",
  "douyin": "dy",
  "bilibili": "bili",
  "zhihu": "zhihu",
}

MC_TO_REFIND: dict[str, str] = {value: key for key, value in REFIND_TO_MC.items()}

MEDIACRAWLER_PLATFORMS = frozenset(REFIND_TO_MC.keys())


def refind_platform_to_mc(platform: str) -> str | None:
  return REFIND_TO_MC.get(str(platform or "").strip().lower())


def mc_platform_to_refind(platform: str) -> str:
  return MC_TO_REFIND.get(str(platform or "").strip().lower(), str(platform or "web"))
