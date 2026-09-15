"""Per-platform login session files for local platform-parser."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

SUPPORTED_LOGIN_PLATFORMS = frozenset({"xhs", "douyin"})


def sessions_dir(root: Path | None = None) -> Path:
  base = Path(root) if root is not None else Path(__file__).resolve().parent
  return base / "sessions"


def session_path(platform: str, root: Path | None = None) -> Path:
  code = str(platform or "").strip().lower()
  if code not in SUPPORTED_LOGIN_PLATFORMS:
    raise ValueError(f"unsupported login platform: {platform}")
  return sessions_dir(root) / f"{code}.json"


def save_platform_session(platform: str, payload: dict[str, Any], root: Path | None = None) -> Path:
  path = session_path(platform, root=root)
  path.parent.mkdir(parents=True, exist_ok=True)
  data = dict(payload or {})
  path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
  return path


def load_platform_session(platform: str, root: Path | None = None) -> dict[str, Any] | None:
  path = session_path(platform, root=root)
  if not path.is_file():
    return None
  try:
    raw = json.loads(path.read_text(encoding="utf-8"))
  except (OSError, json.JSONDecodeError):
    return None
  return raw if isinstance(raw, dict) else None


def clear_platform_session(platform: str, root: Path | None = None) -> None:
  path = session_path(platform, root=root)
  try:
    path.unlink(missing_ok=True)
  except OSError:
    pass


def cookie_header_from_session(payload: dict[str, Any] | None) -> str:
  if not payload:
    return ""
  return str(payload.get("cookies") or "").strip()


COOKIE_DOMAINS = {
  "xhs": ".xiaohongshu.com",
  "douyin": ".douyin.com",
}


def write_netscape_cookie_file(
  cookie_header: str,
  path: Path,
  *,
  domain: str = ".douyin.com",
  cookie_items: list[dict[str, Any]] | None = None,
  extra_domains: list[str] | None = None,
) -> Path:
  """Write cookies as Netscape cookies.txt for yt-dlp."""
  lines = ["# Netscape HTTP Cookie File", "# https://curl.se/docs/http-cookies.html", ""]
  domains = [domain, *(extra_domains or [])]
  seen_domains: list[str] = []
  for item in domains:
    if item and item not in seen_domains:
      seen_domains.append(item)

  if cookie_items:
    for item in cookie_items:
      name = str(item.get("name") or "").strip()
      value = str(item.get("value") or "")
      if not name:
        continue
      host = str(item.get("domain") or domain).strip() or domain
      cookie_path = str(item.get("path") or "/")
      secure = "TRUE" if item.get("secure") else "FALSE"
      expires = int(item.get("expires") or 2147483647)
      if expires < 0:
        expires = 2147483647
      include_sub = "TRUE" if host.startswith(".") else "FALSE"
      lines.append(f"{host}\t{include_sub}\t{cookie_path}\t{secure}\t{expires}\t{name}\t{value}")
  else:
    pairs: list[tuple[str, str]] = []
    for part in str(cookie_header or "").split(";"):
      item = part.strip()
      if not item or "=" not in item:
        continue
      name, value = item.split("=", 1)
      name = name.strip()
      value = value.strip()
      if name:
        pairs.append((name, value))
    for host in seen_domains:
      include_sub = "TRUE" if host.startswith(".") else "FALSE"
      for name, value in pairs:
        lines.append(f"{host}\t{include_sub}\t/\tFALSE\t2147483647\t{name}\t{value}")

  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text("\n".join(lines) + "\n", encoding="utf-8")
  return path


def cookie_items_for_playwright(payload: dict[str, Any] | None, fallback_domain: str) -> list[dict[str, Any]]:
  if not payload:
    return []
  items = payload.get("cookie_items")
  if isinstance(items, list) and items:
    out: list[dict[str, Any]] = []
    for item in items:
      if not isinstance(item, dict):
        continue
      name = str(item.get("name") or "").strip()
      if not name:
        continue
      out.append({
        "name": name,
        "value": str(item.get("value") or ""),
        "domain": str(item.get("domain") or fallback_domain),
        "path": str(item.get("path") or "/"),
      })
    return out

  header = cookie_header_from_session(payload)
  out = []
  for part in header.split(";"):
    item = part.strip()
    if "=" not in item:
      continue
    name, value = item.split("=", 1)
    name = name.strip()
    if not name:
      continue
    out.append({
      "name": name,
      "value": value.strip(),
      "domain": fallback_domain,
      "path": "/",
    })
  return out
