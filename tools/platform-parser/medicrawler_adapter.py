"""Bridge Refind platform-parser HTTP service to MediaCrawler."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from medicrawler.platform_map import MEDIACRAWLER_PLATFORMS, refind_platform_to_mc

PARSER_ROOT = Path(__file__).resolve().parent
DEFAULT_MC_ROOT = PARSER_ROOT.parent / "MediaCrawler"
DETAIL_RUNNER = PARSER_ROOT / "medicrawler" / "detail_runner.py"


def medicrawler_root() -> Path:
  override = os.environ.get("MEDIACRAWLER_ROOT", "").strip()
  return Path(override).resolve() if override else DEFAULT_MC_ROOT.resolve()


def medicrawler_available() -> bool:
  root = medicrawler_root()
  return (root / "main.py").is_file() and DETAIL_RUNNER.is_file()


def medicrawler_enabled() -> bool:
  if os.environ.get("REFIND_DISABLE_MEDIACRAWLER", "").strip() == "1":
    return False
  return medicrawler_available()


def resolve_medicrawler_python() -> str:
  root = medicrawler_root()
  for candidate in (
    root / ".venv" / "bin" / "python3",
    root / ".venv" / "bin" / "python",
  ):
    if candidate.is_file():
      return str(candidate)
  return sys.executable


def medicrawler_status() -> dict:
  root = medicrawler_root()
  venv_python = root / ".venv" / "bin" / "python3"
  return {
    "available": medicrawler_available(),
    "enabled": medicrawler_enabled(),
    "root": str(root),
    "venv_python": str(venv_python) if venv_python.is_file() else "",
    "platforms": sorted(MEDIACRAWLER_PLATFORMS),
    "features": {
      "detail": True,
      "comments": True,
      "sub_comments": os.environ.get("REFIND_MC_SUB_COMMENTS", "1") != "0",
      "media_urls": True,
      "media_download": os.environ.get("REFIND_MC_DOWNLOAD_MEDIA", "0") == "1",
    },
  }


def try_medicrawler_parse(url: str, platform: str, *, cookie: str = "") -> dict | None:
  """Return Refind prefetch dict, or None to fall back to legacy parser."""
  if not medicrawler_enabled():
    return None
  refind_platform = str(platform or "").strip().lower()
  if refind_platform not in MEDIACRAWLER_PLATFORMS:
    return None
  mc_platform = refind_platform_to_mc(refind_platform)
  if not mc_platform:
    return None

  timeout_sec = int(os.environ.get("REFIND_MC_TIMEOUT_SEC", "180"))
  env = os.environ.copy()
  env.update(
    {
      "MEDIACRAWLER_ROOT": str(medicrawler_root()),
      "REFIND_PARSER_ROOT": str(PARSER_ROOT),
      "REFIND_PARSE_URL": url,
      "REFIND_MC_PLATFORM": mc_platform,
      "REFIND_COOKIE": cookie or "",
    },
  )

  try:
    completed = subprocess.run(
      [resolve_medicrawler_python(), str(DETAIL_RUNNER)],
      capture_output=True,
      text=True,
      timeout=timeout_sec,
      env=env,
      cwd=str(medicrawler_root()),
    )
  except subprocess.TimeoutExpired:
    return None
  except OSError:
    return None

  raw = (completed.stdout or "").strip()
  if not raw:
    return None
  try:
    payload = json.loads(raw)
  except json.JSONDecodeError:
    return None
  if payload.get("error"):
    return None
  if not (payload.get("content_text") or payload.get("title")):
    return None
  return payload
