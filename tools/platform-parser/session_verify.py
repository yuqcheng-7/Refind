"""Live-verify saved platform sessions against first-party APIs."""

from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from session_store import (
  SUPPORTED_LOGIN_PLATFORMS,
  cookie_header_from_session,
  load_platform_session,
)

UA = (
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _get_json(url: str, cookie: str, *, referer: str) -> tuple[dict[str, Any] | None, str]:
  """Return (json_or_none, error_code) where error_code is '' | 'http' | 'network'."""
  req = Request(
    url,
    headers={
      "User-Agent": UA,
      "Cookie": cookie,
      "Referer": referer,
      "Accept": "application/json, text/plain, */*",
    },
  )
  try:
    with urlopen(req, timeout=12) as resp:
      raw = resp.read().decode("utf-8", errors="replace")
    data = json.loads(raw)
    return (data if isinstance(data, dict) else None), ""
  except HTTPError as exc:
    if exc.code in (401, 403):
      return None, "session_invalid"
    return None, "http"
  except (URLError, TimeoutError, json.JSONDecodeError, OSError):
    return None, "network"


def verify_saved_session(platform: str) -> dict[str, Any]:
  """Return {ok, platform, account_display_name, detail} for a saved local session."""
  code = str(platform or "").strip().lower()
  if code not in SUPPORTED_LOGIN_PLATFORMS:
    return {"ok": False, "platform": code, "account_display_name": "", "detail": "unsupported"}

  payload = load_platform_session(code)
  cookie = cookie_header_from_session(payload)
  if not cookie:
    return {"ok": False, "platform": code, "account_display_name": "", "detail": "no_local_session"}

  stored_name = ""
  if isinstance(payload, dict):
    stored_name = str(payload.get("account_display_name") or "").strip()

  if code == "zhihu":
    # Zhihu often 401/403s plain urllib even with a valid z_c0 (anti-bot).
    # Do NOT wipe local sessions on those responses — only clear when the API
    # clearly returns an unauthenticated body, or z_c0 is missing.
    has_zc0 = "z_c0=" in cookie and len(cookie.split("z_c0=", 1)[-1].split(";", 1)[0].strip()) >= 16
    body, err = _get_json(
      "https://www.zhihu.com/api/v4/me?include=account_status",
      cookie,
      referer="https://www.zhihu.com/",
    )
    if err in ("network", "http", "session_invalid"):
      if has_zc0:
        return {
          "ok": True,
          "platform": code,
          "account_display_name": stored_name,
          "detail": "soft_ok_cookie_shape",
        }
      return {"ok": False, "platform": code, "account_display_name": stored_name, "detail": err}
    if not body or not (body.get("id") or body.get("url_token") or body.get("name")):
      if has_zc0:
        return {
          "ok": True,
          "platform": code,
          "account_display_name": stored_name,
          "detail": "soft_ok_cookie_shape",
        }
      return {"ok": False, "platform": code, "account_display_name": "", "detail": "session_invalid"}
    name = str(body.get("name") or stored_name or "").strip()
    return {"ok": True, "platform": code, "account_display_name": name, "detail": ""}

  if code == "bilibili":
    body, err = _get_json(
      "https://api.bilibili.com/x/web-interface/nav",
      cookie,
      referer="https://www.bilibili.com/",
    )
    if err in ("network", "http"):
      return {"ok": False, "platform": code, "account_display_name": stored_name, "detail": err}
    data = body.get("data") if isinstance(body, dict) else None
    if err == "session_invalid" or not isinstance(data, dict) or data.get("isLogin") is not True or not data.get("mid"):
      return {"ok": False, "platform": code, "account_display_name": "", "detail": "session_invalid"}
    name = str(data.get("uname") or stored_name or "").strip()
    return {"ok": True, "platform": code, "account_display_name": name, "detail": ""}

  if code == "douyin":
    body, err = _get_json(
      "https://www.douyin.com/aweme/v1/web/user/profile/self/?device_platform=webapp&aid=6383",
      cookie,
      referer="https://www.douyin.com/",
    )
    if err in ("network", "http"):
      return {"ok": False, "platform": code, "account_display_name": stored_name, "detail": err}
    if not isinstance(body, dict) or body.get("status_code") not in (0, None):
      return {"ok": False, "platform": code, "account_display_name": "", "detail": "session_invalid"}
    user = body.get("user")
    if not isinstance(user, dict) and isinstance(body.get("data"), dict):
      user = body["data"].get("user") or body["data"]
    if not isinstance(user, dict) or not (user.get("uid") or user.get("nickname")):
      return {"ok": False, "platform": code, "account_display_name": "", "detail": "session_invalid"}
    name = str(user.get("nickname") or stored_name or "").strip()
    return {"ok": True, "platform": code, "account_display_name": name, "detail": ""}

  if code == "xhs":
    body, err = _get_json(
      "https://edith.xiaohongshu.com/api/sns/web/v2/user/me",
      cookie,
      referer="https://www.xiaohongshu.com/",
    )
    if err in ("network", "http"):
      # Soft-ok when cookie shape looks like a real XHS login (urllib often 406s).
      if "a1=" in cookie and "web_session=" in cookie:
        return {
          "ok": True,
          "platform": code,
          "account_display_name": stored_name,
          "detail": "soft_ok_cookie_shape",
        }
      return {"ok": False, "platform": code, "account_display_name": stored_name, "detail": err}
    data = body.get("data") if isinstance(body, dict) else None
    if isinstance(data, dict) and data.get("guest") is False and (data.get("user_id") or data.get("red_id")):
      name = str(data.get("nickname") or stored_name or "").strip()
      return {"ok": True, "platform": code, "account_display_name": name, "detail": ""}
    if "a1=" in cookie and "web_session=" in cookie:
      return {
        "ok": True,
        "platform": code,
        "account_display_name": stored_name,
        "detail": "soft_ok_cookie_shape",
      }
    return {"ok": False, "platform": code, "account_display_name": "", "detail": "session_invalid"}

  return {"ok": False, "platform": code, "account_display_name": "", "detail": "unsupported"}


def verify_all_saved_sessions() -> dict[str, dict[str, Any]]:
  return {code: verify_saved_session(code) for code in sorted(SUPPORTED_LOGIN_PLATFORMS)}
