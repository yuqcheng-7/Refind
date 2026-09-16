"""Per-platform login session files for local platform-parser."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SUPPORTED_LOGIN_PLATFORMS = frozenset({"xhs", "douyin", "zhihu", "bilibili"})


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


def browser_profile_dir(platform: str, root: Path | None = None) -> Path:
  """Persistent Chromium profile dir so re-open keeps the platform login UI."""
  code = str(platform or "").strip().lower()
  if code not in SUPPORTED_LOGIN_PLATFORMS:
    raise ValueError(f"unsupported login platform: {platform}")
  return sessions_dir(root) / "browser-profiles" / code


def clear_browser_profile(platform: str, root: Path | None = None) -> None:
  import shutil

  path = browser_profile_dir(platform, root=root)
  try:
    if path.is_dir():
      shutil.rmtree(path, ignore_errors=True)
  except OSError:
    pass


def cookie_header_from_session(payload: dict[str, Any] | None) -> str:
  if not payload:
    return ""
  return str(payload.get("cookies") or "").strip()


COOKIE_DOMAINS = {
  "xhs": ".xiaohongshu.com",
  "douyin": ".douyin.com",
  "zhihu": ".zhihu.com",
  "bilibili": ".bilibili.com",
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


_ZHIHU_AUTH_COOKIE_NAMES = frozenset({
  "z_c0", "q_c1", "d_c0", "_zap", "_xsrf", "SESSIONID", "DATE", "crystal",
})


def _playwright_cookie_entry(item: dict[str, Any], *, fallback_domain: str) -> dict[str, Any] | None:
  name = str(item.get("name") or "").strip()
  if not name:
    return None
  domain = str(item.get("domain") or fallback_domain).strip() or fallback_domain
  entry: dict[str, Any] = {
    "name": name,
    "value": str(item.get("value") or ""),
    "domain": domain,
    "path": str(item.get("path") or "/"),
  }
  expires = item.get("expires")
  if isinstance(expires, (int, float)) and expires > 0:
    entry["expires"] = float(expires)
  if item.get("httpOnly"):
    entry["httpOnly"] = True
  if item.get("secure"):
    entry["secure"] = True
  same_site = item.get("sameSite")
  if same_site in {"Strict", "Lax", "None"}:
    entry["sameSite"] = same_site
  return entry


def playwright_cookies_from_session(
  payload: dict[str, Any] | None,
  platform: str,
  *,
  include_third_party: bool = False,
) -> list[dict[str, Any]]:
  """Normalize saved session cookies for Playwright context.add_cookies()."""
  fallback = COOKIE_DOMAINS.get(str(platform or "").strip().lower()) or ".example.com"
  raw_items = cookie_items_for_playwright(payload, fallback)
  if not raw_items:
    return []

  skip_domain_suffixes = (".baidu.com",)
  out: list[dict[str, Any]] = []
  seen: set[tuple[str, str, str]] = set()

  def append(item: dict[str, Any]) -> None:
    entry = _playwright_cookie_entry(item, fallback_domain=fallback)
    if not entry:
      return
    domain = str(entry.get("domain") or fallback)
    if not include_third_party:
      if any(domain.endswith(suffix) for suffix in skip_domain_suffixes):
        return
      if platform == "zhihu" and domain.endswith(".zhihu.com") is False and domain != "zhihu.com":
        # Skip mqtt-web.zhihu.com / sugar.zhihu.com telemetry cookies.
        if domain.endswith("zhihu.com") and domain not in {".zhihu.com", "www.zhihu.com", "zhuanlan.zhihu.com"}:
          return
    key = (entry["name"], domain, entry["path"])
    if key in seen:
      return
    seen.add(key)
    out.append(entry)

  for item in raw_items:
    append(item)
    if platform == "zhihu":
      domain = str(item.get("domain") or fallback)
      name = str(item.get("name") or "")
      if domain == "www.zhihu.com" and name in _ZHIHU_AUTH_COOKIE_NAMES:
        twin = {**item, "domain": ".zhihu.com"}
        append(twin)

  return out


def import_platform_cookies(
  platform: str,
  cookie_header: str,
  *,
  account_display_name: str = "",
  ua: str = "",
) -> dict[str, Any]:
  """Save a manually pasted Cookie header as a local session (Zhihu fallback)."""
  code = str(platform or "").strip().lower()
  if code not in SUPPORTED_LOGIN_PLATFORMS:
    raise ValueError(f"unsupported login platform: {platform}")
  header = str(cookie_header or "").strip()
  if not header or "=" not in header:
    raise ValueError("Cookie 不能为空")
  if code == "zhihu" and "z_c0=" not in header:
    raise ValueError("知乎 Cookie 需包含 z_c0")

  items: list[dict[str, Any]] = []
  domain = COOKIE_DOMAINS.get(code) or f".{code}.com"
  for part in header.split(";"):
    item = part.strip()
    if "=" not in item:
      continue
    name, value = item.split("=", 1)
    name = name.strip()
    if not name:
      continue
    items.append({
      "name": name,
      "value": value.strip(),
      "domain": domain,
      "path": "/",
    })
  if not items:
    raise ValueError("未能解析 Cookie")

  payload = {
    "cookies": "; ".join(f"{i['name']}={i['value']}" for i in items),
    "cookie_items": items,
    "ua": str(ua or "").strip() or (
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "captured_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "account_display_name": str(account_display_name or "").strip() or ("知乎账号" if code == "zhihu" else ""),
  }
  save_platform_session(code, payload)
  return payload


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
      normalized: dict[str, Any] = {
        "name": name,
        "value": str(item.get("value") or ""),
        "domain": str(item.get("domain") or fallback_domain),
        "path": str(item.get("path") or "/"),
      }
      expires = item.get("expires")
      if isinstance(expires, (int, float)):
        normalized["expires"] = expires
      if item.get("httpOnly") is not None:
        normalized["httpOnly"] = bool(item.get("httpOnly"))
      if item.get("secure") is not None:
        normalized["secure"] = bool(item.get("secure"))
      if item.get("sameSite"):
        normalized["sameSite"] = str(item.get("sameSite"))
      out.append(normalized)
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
