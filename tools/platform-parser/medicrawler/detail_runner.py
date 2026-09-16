#!/usr/bin/env python3
"""Run a single MediaCrawler detail fetch and print Refind prefetch JSON on stdout."""

from __future__ import annotations

import asyncio
import json
import os
import sys
import traceback
from pathlib import Path


def _bootstrap() -> tuple[Path, Path]:
  mc_root = Path(os.environ.get("MEDIACRAWLER_ROOT", "")).resolve()
  parser_root = Path(os.environ.get("REFIND_PARSER_ROOT", "")).resolve()
  if not mc_root.is_dir():
    raise RuntimeError(f"MEDIACRAWLER_ROOT missing: {mc_root}")
  if not parser_root.is_dir():
    raise RuntimeError(f"REFIND_PARSER_ROOT missing: {parser_root}")
  sys.path.insert(0, str(mc_root))
  sys.path.insert(0, str(parser_root))
  os.chdir(mc_root)
  return mc_root, parser_root


async def _run_detail() -> dict:
  from main import CrawlerFactory

  from medicrawler.capture import empty_capture, install_capture_hooks
  from medicrawler.config_apply import apply_refind_config
  from medicrawler.normalize import normalize_capture

  url = str(os.environ.get("REFIND_PARSE_URL") or "").strip()
  mc_platform = str(os.environ.get("REFIND_MC_PLATFORM") or "").strip().lower()
  cookie = str(os.environ.get("REFIND_COOKIE") or "").strip()
  if not url or not mc_platform:
    raise ValueError("REFIND_PARSE_URL and REFIND_MC_PLATFORM are required")

  apply_refind_config(mc_platform=mc_platform, url=url, cookie_str=cookie)
  capture = empty_capture()
  install_capture_hooks(mc_platform, capture)

  crawler = CrawlerFactory.create_crawler(platform=mc_platform)
  try:
    await crawler.start()
  finally:
    try:
      await crawler.close()
    except Exception:
      pass

  normalized = normalize_capture(
    mc_platform=mc_platform,
    capture=capture,
    canonical_url=url,
  )
  if not normalized:
    raise RuntimeError("MediaCrawler returned no content")
  return normalized


def main() -> int:
  try:
    _bootstrap()
    payload = asyncio.run(_run_detail())
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    return 0
  except Exception as exc:  # noqa: BLE001
    err = {
      "error": "mediacrawler_failed",
      "detail": str(exc),
      "traceback": traceback.format_exc(limit=8),
    }
    sys.stdout.write(json.dumps(err, ensure_ascii=False))
    return 1


if __name__ == "__main__":
  raise SystemExit(main())
