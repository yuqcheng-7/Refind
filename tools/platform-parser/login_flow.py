"""Local Playwright login jobs for xhs / douyin / zhihu / bilibili."""

from __future__ import annotations

import base64
import json
import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

from session_store import (
  COOKIE_DOMAINS,
  SUPPORTED_LOGIN_PLATFORMS,
  browser_profile_dir,
  clear_browser_profile,
  clear_platform_session,
  load_platform_session,
  playwright_cookies_from_session,
  save_platform_session,
)

LOGIN_TIMEOUT_SEC = 240
# Platforms that reuse a disk Chromium profile across login windows.
# Closing the window must not wipe cookies; reconnect should open still logged-in.
PERSISTENT_BROWSER_PLATFORMS = frozenset({"zhihu"})
# Legacy: no platforms keep the window open after success (auto-close after persist).
KEEP_BROWSER_OPEN_AFTER_LOGIN = frozenset()
KEEP_OPEN_AFTER_SUCCESS_SEC = 30 * 60

# Hosted (bind 0.0.0.0): default headless so QR is scraped into the web UI.
# Local desktop (127.0.0.1): default headed window. Override with PLATFORM_LOGIN_HEADLESS=0|1.
_parser_host = os.environ.get("PLATFORM_PARSER_HOST", "127.0.0.1").strip().lower()
_headless_env = os.environ.get("PLATFORM_LOGIN_HEADLESS", "").strip().lower()
if _headless_env in {"0", "false", "no"}:
  HEADLESS = False
elif _headless_env in {"1", "true", "yes"}:
  HEADLESS = True
else:
  HEADLESS = _parser_host not in {"127.0.0.1", "localhost", "::1", ""}


class LoginWindowClosed(RuntimeError):
  """Raised when the user closes the Playwright login window before completion."""

LOGIN_URLS = {
  "xhs": "https://www.xiaohongshu.com/login",
  "douyin": "https://www.douyin.com/",
  "zhihu": "https://www.zhihu.com/signin?next=%2F",
  "bilibili": "https://passport.bilibili.com/login",
}

SUCCESS_COOKIE_KEYS = {
  # Note: xhs sets web_session for guests too — real login is confirmed via /user/me.
  "xhs": ("web_session",),
  "douyin": ("sessionid", "sessionid_ss", "sid_tt", "uid_tt"),
  "zhihu": ("z_c0",),
  "bilibili": ("SESSDATA", "DedeUserID"),
}

PROFILE_BOOTSTRAP = {
  "xhs": "https://www.xiaohongshu.com/user/profile/me",
  "douyin": "https://www.douyin.com/user/self",
  "zhihu": "https://www.zhihu.com/",
  "bilibili": "https://www.bilibili.com/",
}

QR_SELECTORS = {
  "xhs": (
    "img[src*='qr']",
    "canvas",
    "[class*='qrcode'] img",
    "[class*='qr-code'] img",
    ".login-container img",
  ),
  "douyin": (
    "img[src*='qr']",
    "canvas",
    "[class*='qrcode'] img",
    "[class*='qr-code'] img",
  ),
  "zhihu": (
    ".Qrcode-img",
    "img[alt*='二维码']",
    "img[src*='qr']",
    "canvas",
    "[class*='Qrcode'] img",
  ),
  "bilibili": (
    ".qrcode-img",
    "#qrcode img",
    "img[src*='qr']",
    "canvas",
    "[class*='qrcode'] img",
  ),
}



@dataclass
class LoginJob:
  login_id: str
  platform: str
  status: str = "pending"  # pending | success | failed | expired
  account_display_name: str = ""
  session_payload: str | None = None
  error: str = ""
  qr_image_base64: str = ""
  progress: str = ""
  needs_sms: bool = False
  sms_code: str = ""
  created_at: float = field(default_factory=time.time)
  consumed_payload: bool = False


_jobs: dict[str, LoginJob] = {}
_lock = threading.Lock()


def _now_iso() -> str:
  return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def cookies_to_header(cookies: list[dict[str, Any]]) -> str:
  parts: list[str] = []
  for item in cookies:
    name = str(item.get("name") or "").strip()
    value = str(item.get("value") or "")
    if name:
      parts.append(f"{name}={value}")
  return "; ".join(parts)


def has_success_cookies(platform: str, cookies: list[dict[str, Any]]) -> bool:
  names = {str(item.get("name") or "") for item in cookies}
  keys = SUCCESS_COOKIE_KEYS.get(platform) or ()
  return any(key in names for key in keys)


def cookie_value(cookies: list[dict[str, Any]], name: str) -> str:
  target = str(name or "").strip()
  for item in cookies:
    if str(item.get("name") or "") == target:
      return str(item.get("value") or "").strip()
  return ""


def has_meaningful_cookie(cookies: list[dict[str, Any]], names: tuple[str, ...], *, min_len: int = 8) -> bool:
  for name in names:
    value = cookie_value(cookies, name)
    if len(value) >= min_len:
      return True
  return False


def xhs_state_logged_in(page: Any) -> bool:
  try:
    return bool(
      page.evaluate(
        """() => {
          const s = window.__INITIAL_STATE__ || window.__INITIAL_SSR_STATE__ || {};
          const u = s?.user?.userInfo || s?.user?.userPageData?.basicInfo || s?.user || {};
          if (u.guest === true) return false;
          if (u.guest !== false) return false;
          const id = u.userId || u.user_id || u.redId || u.red_id;
          return Boolean(id);
        }"""
      )
    )
  except Exception:  # noqa: BLE001
    return False


def login_page_visible(page: Any, platform: str) -> bool:
  patterns = {
    "xhs": r"扫码登录|手机号登录|验证码登录",
    "douyin": r"扫码登录|验证码登录|密码登录",
    "zhihu": r"登录知乎|扫码登录|验证码登录|注册账号",
    "bilibili": r"扫码登录|密码登录|短信登录",
  }
  pattern = patterns.get(platform)
  if not pattern:
    return False
  try:
    return bool(
      page.evaluate(
        """([re]) => {
          const text = document.body?.innerText || '';
          return new RegExp(re).test(text);
        }""",
        pattern,
      )
    )
  except Exception:  # noqa: BLE001
    return False


def mark_login_verified(captured: dict[str, Any]) -> None:
  captured["login_verified"] = True
  captured["logged_in"] = True


def guess_account_name(cookies: list[dict[str, Any]]) -> str:
  for item in cookies:
    name = str(item.get("name") or "")
    value = str(item.get("value") or "").strip()
    if name in {"login_name", "nickname", "user_name", "username"} and value and len(value) < 40:
      return value
  return ""


def normalize_display_name(raw: Any) -> str:
  text = str(raw or "").strip()
  if not text or len(text) > 40:
    return ""
  # Ignore common placeholders / counts.
  if text in {
    "登录", "登陆", "Login", "我", "用户", "未登录",
    "小红书账号", "抖音账号", "知乎账号", "B 站账号", "微信公众号账号",
  }:
    return ""
  return text


def account_id_from_mapping(data: Any, *, _depth: int = 0) -> str:
  """Stable account identifiers when nickname is unavailable."""
  if not isinstance(data, dict) or _depth > 4 or not data:
    return ""
  for key in (
    "red_id", "redId",
    "unique_id", "uniqueId",
    "short_id", "shortId",
    "douyin_id", "aweme_id",
    "user_id", "userId", "uid",
  ):
    value = data.get(key)
    if value is None or value == "":
      continue
    text = str(value).strip()
    if not text or len(text) > 64:
      continue
    if key in {"red_id", "redId"}:
      return f"小红书号 {text}"
    if key in {"unique_id", "uniqueId", "short_id", "shortId", "douyin_id"}:
      return f"抖音号 {text}"
    if key in {"user_id", "userId", "uid", "aweme_id"}:
      return f"UID {text[:16]}"
  basic = data.get("basic_info") or data.get("basicInfo")
  if isinstance(basic, dict) and basic and basic is not data:
    return account_id_from_mapping(basic, _depth=_depth + 1)
  user = data.get("user") or data.get("user_info") or data.get("userInfo")
  if isinstance(user, dict) and user and user is not data:
    return account_id_from_mapping(user, _depth=_depth + 1)
  return ""


def account_label_from_cookies(platform: str, cookies: list[dict[str, Any]]) -> str:
  by_name = {
    str(item.get("name") or ""): str(item.get("value") or "").strip()
    for item in cookies
  }
  if platform == "douyin":
    for key in ("uid_tt", "uid_tt_ss"):
      value = by_name.get(key) or ""
      if value:
        return f"UID {value[:12]}"
    session = by_name.get("sessionid") or by_name.get("sessionid_ss") or ""
    if session:
      return f"会话 {session[:10]}"
  if platform == "xhs":
    # webId is device-ish but better than blank when APIs are blocked.
    web_id = by_name.get("webId") or ""
    if web_id:
      return f"设备 {web_id[:12]}"
    session = by_name.get("web_session") or ""
    if session:
      return f"会话 {session[:10]}"
  if platform == "zhihu":
    session = by_name.get("z_c0") or ""
    if session:
      return f"会话 {session[:10]}"
  if platform == "bilibili":
    uid = by_name.get("DedeUserID") or ""
    if uid:
      return f"UID {uid[:12]}"
    session = by_name.get("SESSDATA") or ""
    if session:
      return f"会话 {session[:10]}"
  return ""


def resolve_account_label(
  platform: str,
  cookies: list[dict[str, Any]],
  *,
  nickname: str = "",
  account_id: str = "",
) -> str:
  nick = normalize_display_name(nickname)
  if nick:
    return nick
  for candidate in (account_id, account_label_from_cookies(platform, cookies)):
    text = str(candidate or "").strip()
    if text:
      return text[:40]
  return ""


def nickname_from_mapping(data: Any, *, _depth: int = 0) -> str:
  if not isinstance(data, dict) or _depth > 4 or not data:
    return ""
  for key in ("nickname", "nick_name", "nickName", "userName", "unique_id", "uniqueId"):
    found = normalize_display_name(data.get(key))
    if found:
      return found
  # Prefer explicit nickname fields over generic "name" (often "抖音"/"小红书").
  found = normalize_display_name(data.get("name"))
  if found and found not in {"抖音", "小红书", "Douyin", "Xiaohongshu"}:
    return found
  basic = data.get("basic_info") or data.get("basicInfo")
  if isinstance(basic, dict) and basic and basic is not data:
    return nickname_from_mapping(basic, _depth=_depth + 1)
  user = data.get("user") or data.get("user_info") or data.get("userInfo")
  if isinstance(user, dict) and user and user is not data:
    return nickname_from_mapping(user, _depth=_depth + 1)
  return ""


def fetch_xhs_me(page: Any) -> dict[str, Any] | None:
  """Return /user/me payload when logged in (guest=false)."""
  try:
    resp = page.request.get(
      "https://edith.xiaohongshu.com/api/sns/web/v2/user/me",
      headers={
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.xiaohongshu.com/",
      },
      timeout=15_000,
    )
    if resp.status != 200:
      return None
    body = resp.json()
    data = body.get("data") if isinstance(body, dict) else None
    if not isinstance(data, dict):
      return None
    if data.get("guest") is not False:
      return None
    if not (data.get("user_id") or data.get("red_id")):
      return None
    return data
  except Exception:  # noqa: BLE001
    return None
  return None


def fetch_zhihu_me(page: Any) -> dict[str, Any] | None:
  """Return /api/v4/me payload when logged in."""
  try:
    resp = page.request.get(
      "https://www.zhihu.com/api/v4/me?include=account_status",
      headers={
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.zhihu.com/",
      },
      timeout=15_000,
    )
    if resp.status != 200:
      return None
    body = resp.json()
    if not isinstance(body, dict):
      return None
    if not (body.get("id") or body.get("url_token") or body.get("name")):
      return None
    return body
  except Exception:  # noqa: BLE001
    return None


def scrape_account_name_from_page(page: Any, platform: str) -> str:
  """Best-effort nickname from APIs / page state / DOM after real login."""
  if platform == "xhs":
    me = fetch_xhs_me(page)
    found = nickname_from_mapping(me or {})
    if found:
      return found
  if platform == "zhihu":
    me = fetch_zhihu_me(page)
    if me:
      found = normalize_display_name(me.get("name"))
      if found:
        return found
      token = str(me.get("url_token") or "").strip()
      if token:
        return f"知乎用户 {token[:16]}"
  if platform == "douyin":
    try:
      resp = page.request.get(
        "https://www.douyin.com/aweme/v1/web/user/profile/self/?device_platform=webapp&aid=6383",
        headers={
          "Accept": "application/json, text/plain, */*",
          "Referer": "https://www.douyin.com/",
        },
        timeout=15_000,
      )
      if resp.status == 200:
        body = resp.json()
        data = body.get("user") if isinstance(body, dict) else None
        if not data and isinstance(body, dict):
          data = (body.get("data") or {}).get("user") if isinstance(body.get("data"), dict) else body.get("data")
        found = nickname_from_mapping(data if isinstance(data, dict) else {})
        if found:
          return found
    except Exception:  # noqa: BLE001
      pass

  state_scripts = {
    "xhs": """() => {
      const pick = (obj) => {
        if (!obj || typeof obj !== 'object') return '';
        return obj.nickname || obj.nickName || obj.name || obj.userName || '';
      };
      const walk = (node, depth) => {
        if (!node || depth > 6) return '';
        if (Array.isArray(node)) {
          for (const item of node) {
            const hit = walk(item, depth + 1);
            if (hit) return hit;
          }
          return '';
        }
        if (typeof node !== 'object') return '';
        const direct = pick(node);
        if (direct && !node.guest) return direct;
        for (const value of Object.values(node)) {
          const hit = walk(value, depth + 1);
          if (hit) return hit;
        }
        return '';
      };
      try {
        const s = window.__INITIAL_STATE__ || window.__INITIAL_SSR_STATE__ || {};
        return pick(s?.user?.userInfo)
          || pick(s?.user?.userPageData?.basicInfo)
          || pick(s?.user?.userInfo?.baseInfo)
          || walk(s, 0)
          || '';
      } catch (e) { return ''; }
    }""",
    "douyin": """() => {
      const pick = (obj) => {
        if (!obj || typeof obj !== 'object') return '';
        return obj.nickname || obj.nickName || obj.name || obj.unique_id || '';
      };
      const walk = (node, depth) => {
        if (!node || depth > 6) return '';
        if (Array.isArray(node)) {
          for (const item of node) {
            const hit = walk(item, depth + 1);
            if (hit) return hit;
          }
          return '';
        }
        if (typeof node !== 'object') return '';
        const direct = pick(node);
        if (direct) return direct;
        for (const value of Object.values(node)) {
          const hit = walk(value, depth + 1);
          if (hit) return hit;
        }
        return '';
      };
      try {
        const s = window.__INITIAL_STATE__ || {};
        return pick(s?.user?.userInfo)
          || pick(s?.user?.info)
          || pick(s?.userInfo)
          || walk(s, 0)
          || '';
      } catch (e) { return ''; }
    }""",
  }
  script = state_scripts.get(platform)
  if script:
    try:
      found = normalize_display_name(page.evaluate(script))
      if found:
        return found
    except Exception:  # noqa: BLE001
      pass

  selectors = {
    "xhs": [
      ".side-bar .user-name",
      ".user .name",
      "[class*='username']",
      "[class*='user-name']",
      "[class*='nick-name']",
      "header [class*='name']",
    ],
    "douyin": [
      "[data-e2e='live-avatar'] + *",
      "[class*='avatar'] [class*='name']",
      "[class*='nickname']",
      "[class*='user-name']",
      "header [class*='name']",
    ],
    "zhihu": [
      ".AppHeader-profileEntry",
      ".AppHeader-userInfo",
      "a[href*='/people/']",
      "[class*='UserLink']",
      ".Avatar + *",
    ],
    "bilibili": [
      ".header-avatar-wrap",
      ".header-entry-avatar",
      ".nickname",
      ".bili-avatar + *",
      "a[href*='//space.bilibili.com/']",
    ],
  }
  for selector in selectors.get(platform) or []:
    try:
      loc = page.locator(selector).first
      if loc.count() == 0:
        continue
      text = normalize_display_name(loc.inner_text(timeout=800))
      if text:
        return text
    except Exception:  # noqa: BLE001
      continue
  return ""


def platform_login_ready(page: Any, platform: str, cookies: list[dict[str, Any]], captured: dict[str, Any] | None = None) -> bool:
  """Return True only after authoritative login signals — not guest cookies or generic DOM."""
  captured = captured if captured is not None else {}
  if captured.get("login_verified"):
    return True

  # Zhihu: after QR/sms login, the sign-in shell may still be visible while z_c0 is already set.
  # Prefer live /api/v4/me over the login-page DOM check.
  if platform == "zhihu":
    if not has_meaningful_cookie(cookies, ("z_c0",), min_len=16):
      return False
    if probe_browser_session(page, platform, captured):
      return True
    if login_page_visible(page, platform):
      return False
    return False

  # XHS: login shell often keeps "扫码登录" text after phone confirms — check APIs first.
  if platform == "xhs":
    me = fetch_xhs_me(page)
    if me and me.get("guest") is not True:
      mark_login_verified(captured)
      return True
    if xhs_state_logged_in(page):
      mark_login_verified(captured)
      return True
    if login_page_visible(page, platform):
      return False
    return False

  if platform == "douyin":
    if not has_meaningful_cookie(cookies, ("sessionid", "sessionid_ss")):
      return False
    if captured.get("login_verified"):
      return True
    # Actively probe — network listener may miss post-QR XHRs in headless.
    try:
      resp = page.request.get(
        "https://www.douyin.com/aweme/v1/web/user/profile/self/?device_platform=webapp&aid=6383",
        headers={
          "Accept": "application/json, text/plain, */*",
          "Referer": "https://www.douyin.com/",
        },
        timeout=15_000,
      )
      if resp.status == 200:
        body = resp.json()
        if isinstance(body, dict) and body.get("status_code") in (0, None):
          user = body.get("user")
          if not isinstance(user, dict) and isinstance(body.get("data"), dict):
            user = body["data"].get("user")
          if isinstance(user, dict) and (user.get("uid") or nickname_from_mapping(user) or account_id_from_mapping(user)):
            if nickname_from_mapping(user) and not captured.get("account"):
              captured["account"] = nickname_from_mapping(user)
            mark_login_verified(captured)
            return True
    except Exception:  # noqa: BLE001
      pass
    if login_page_visible(page, platform):
      return False
    return False

  if platform == "bilibili":
    if not has_meaningful_cookie(cookies, ("SESSDATA",), min_len=16):
      return False
    if not has_meaningful_cookie(cookies, ("DedeUserID",), min_len=1):
      return False
    if captured.get("login_verified"):
      return True
    try:
      resp = page.request.get(
        "https://api.bilibili.com/x/web-interface/nav",
        headers={
          "Accept": "application/json, text/plain, */*",
          "Referer": "https://www.bilibili.com/",
        },
        timeout=15_000,
      )
      if resp.status == 200:
        body = resp.json()
        data = body.get("data") if isinstance(body, dict) else None
        if isinstance(data, dict) and data.get("isLogin") is True and data.get("mid"):
          nick = normalize_display_name(data.get("uname"))
          if nick and not captured.get("account"):
            captured["account"] = nick
          mark_login_verified(captured)
          return True
    except Exception:  # noqa: BLE001
      pass
    if login_page_visible(page, platform):
      return False
    return False

  if login_page_visible(page, platform):
    return False
  return False


def verify_authenticated_session(
  platform: str,
  page: Any,
  cookies: list[dict[str, Any]],
  captured: dict[str, Any] | None = None,
) -> bool:
  """Final check before saving cookies — must match real logged-in state."""
  captured = captured if captured is not None else {}
  if not captured.get("login_verified"):
    return False

  if platform == "xhs":
    me = fetch_xhs_me(page)
    return bool(me and me.get("guest") is False and (me.get("user_id") or me.get("red_id"))) or xhs_state_logged_in(page)

  if platform == "douyin":
    if not has_meaningful_cookie(cookies, ("sessionid", "sessionid_ss")):
      return False
    try:
      resp = page.request.get(
        "https://www.douyin.com/aweme/v1/web/user/profile/self/?device_platform=webapp&aid=6383",
        headers={
          "Accept": "application/json, text/plain, */*",
          "Referer": "https://www.douyin.com/",
        },
        timeout=15_000,
      )
      if resp.status != 200:
        return False
      body = resp.json()
      if not isinstance(body, dict) or body.get("status_code") not in (0, None):
        return False
      user = body.get("user") or (body.get("data") or {}).get("user") if isinstance(body.get("data"), dict) else None
      if not isinstance(user, dict):
        return False
      return bool(user.get("uid") or nickname_from_mapping(user) or account_id_from_mapping(user))
    except Exception:  # noqa: BLE001
      return False

  if platform == "zhihu":
    if not has_meaningful_cookie(cookies, ("z_c0",), min_len=16):
      return False
    try:
      resp = page.request.get(
        "https://www.zhihu.com/api/v4/me?include=account_status",
        headers={
          "Accept": "application/json, text/plain, */*",
          "Referer": "https://www.zhihu.com/",
        },
        timeout=15_000,
      )
      if resp.status != 200:
        return False
      body = resp.json()
      return isinstance(body, dict) and bool(body.get("id") or body.get("url_token") or body.get("name"))
    except Exception:  # noqa: BLE001
      return False

  if platform == "bilibili":
    if not has_meaningful_cookie(cookies, ("SESSDATA",), min_len=16):
      return False
    if not has_meaningful_cookie(cookies, ("DedeUserID",), min_len=1):
      return False
    try:
      resp = page.request.get(
        "https://api.bilibili.com/x/web-interface/nav",
        headers={
          "Accept": "application/json, text/plain, */*",
          "Referer": "https://www.bilibili.com/",
        },
        timeout=15_000,
      )
      if resp.status != 200:
        return False
      body = resp.json()
      data = body.get("data") if isinstance(body, dict) else None
      if not isinstance(data, dict):
        return False
      return data.get("isLogin") is True and bool(data.get("mid"))
    except Exception:  # noqa: BLE001
      return False

  return False


def weak_account_label(platform: str, label: str) -> bool:
  text = str(label or "").strip()
  if not text:
    return True
  # Zhihu often only exposes "知乎用户 xxx" / cookie-derived labels; those are fine
  # once /api/v4/me has verified the session.
  if platform == "zhihu":
    return False
  # Cookie-derived fallbacks are acceptable after API verification (handled by caller).
  if text.startswith(("设备 ", "会话 ", "UID ", "小红书号 ", "抖音号 ")):
    return False
  if platform == "xhs" and text in {"小红书账号", "未获取到昵称"}:
    return False
  if platform == "douyin" and text in {"抖音账号", "未获取到昵称"}:
    return False
  if platform == "bilibili" and text in {"B 站账号", "未获取到昵称"}:
    return False
  return False


def attach_account_response_listener(page: Any, platform: str, captured: dict[str, Any]) -> None:
  """Capture nickname / account id / login flags from first-party signed XHR."""

  def absorb(data: Any, *, mark_login: bool = False) -> None:
    if not isinstance(data, dict):
      return
    nick = nickname_from_mapping(data)
    if nick and not captured.get("account"):
      captured["account"] = nick
    acc_id = account_id_from_mapping(data)
    if acc_id and not captured.get("account_id"):
      captured["account_id"] = acc_id
    if mark_login:
      mark_login_verified(captured)

  def on_response(response: Any) -> None:
    try:
      url = str(getattr(response, "url", "") or "")
      if response.status != 200:
        return
      ctype = str((response.headers or {}).get("content-type") or "")
      if "json" not in ctype and "javascript" not in ctype:
        if not any(token in url for token in ("/user/me", "otherinfo", "profile/self", "passport", "qrcode")):
          return
      try:
        body = response.json()
      except Exception:  # noqa: BLE001
        return
      if not isinstance(body, dict):
        return
      data = body.get("data") if isinstance(body.get("data"), dict) else body

      if platform == "xhs":
        if "/user/me" in url and isinstance(data, dict):
          absorb(data, mark_login=data.get("guest") is False)
        if ("otherinfo" in url or "user/selfinfo" in url) and isinstance(data, dict):
          absorb(data, mark_login=data.get("guest") is False)

      if platform == "douyin":
        interesting = any(token in url for token in (
          "profile/self", "passport/account/info", "user/info", "query_user", "aweme/v1/web/user",
        ))
        if not interesting:
          return
        user = data
        if isinstance(data, dict):
          user = data.get("user") or data.get("user_info") or data.get("account") or data
        user_dict = user if isinstance(user, dict) else {}
        absorb(user_dict)
        if (
          isinstance(body, dict)
          and body.get("status_code") == 0
          and (nickname_from_mapping(user_dict) or account_id_from_mapping(user_dict))
        ):
          mark_login_verified(captured)

      if platform == "zhihu":
        interesting = any(token in url for token in (
          "/api/v4/me", "/members/me", "account/api", "prod/account",
        ))
        if interesting:
          user = data
          if isinstance(data, dict):
            user = data.get("user") or data.get("member") or data
          user_dict = user if isinstance(user, dict) else {}
          verified = bool(
            user_dict.get("id")
            or user_dict.get("uid")
            or user_dict.get("url_token")
            or nickname_from_mapping(user_dict)
          )
          absorb(user_dict, mark_login=verified)

      if platform == "bilibili":
        interesting = any(token in url for token in (
          "nav", "account.bilibili.com", "x/web-interface/nav", "x/space/myinfo",
        ))
        if interesting:
          user = data if isinstance(data, dict) else {}
          if isinstance(data, dict) and isinstance(data.get("data"), dict):
            user = data.get("data") or {}
          if isinstance(user, dict) and user.get("uname") and not user.get("nickname"):
            user = {**user, "nickname": user.get("uname")}
          user_dict = user if isinstance(user, dict) else {}
          verified = bool(user_dict.get("isLogin") is True or user_dict.get("mid"))
          absorb(user_dict, mark_login=verified)
    except Exception:  # noqa: BLE001
      return

  page.on("response", on_response)


def scrape_local_storage_nickname(page: Any) -> str:
  try:
    found = page.evaluate(
      """() => {
        const pickNick = (text) => {
          try {
            const obj = JSON.parse(text);
            const walk = (node, depth) => {
              if (!node || depth > 5) return '';
              if (typeof node === 'string') return '';
              if (Array.isArray(node)) {
                for (const item of node) {
                  const hit = walk(item, depth + 1);
                  if (hit) return hit;
                }
                return '';
              }
              if (typeof node !== 'object') return '';
              for (const key of ['nickname', 'nickName', 'userName', 'uniqueId', 'unique_id', 'red_id', 'redId', 'short_id']) {
                const val = node[key];
                if (typeof val === 'string' && val.trim() && val.length < 40) return val.trim();
                if (typeof val === 'number') return String(val);
              }
              for (const val of Object.values(node)) {
                const hit = walk(val, depth + 1);
                if (hit) return hit;
              }
              return '';
            };
            return walk(obj, 0);
          } catch (e) { return ''; }
        };
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i) || '';
          const val = localStorage.getItem(key) || '';
          if (!val || val.length > 200000) continue;
          if (!/user|nick|profile|account|red|douyin/i.test(key + val.slice(0, 200))) continue;
          const hit = pickNick(val);
          if (hit) return hit;
        }
        return '';
      }"""
    )
    return normalize_display_name(found)
  except Exception:  # noqa: BLE001
    return ""


def capture_account_after_login(
  page: Any,
  platform: str,
  cookies: list[dict[str, Any]],
  captured: dict[str, Any] | None = None,
) -> str:
  captured = captured or {}
  label = resolve_account_label(
    platform,
    cookies,
    nickname=str(captured.get("account") or ""),
    account_id=str(captured.get("account_id") or ""),
  )
  if label and not label.startswith(("会话 ", "设备 ")):
    return label

  scraped = resolve_account_display_name(cookies, page=page, platform=platform)
  if scraped:
    return scraped
  scraped = scrape_local_storage_nickname(page)
  if scraped:
    return scraped

  bootstrap = PROFILE_BOOTSTRAP.get(platform)
  if bootstrap:
    try:
      page.goto(bootstrap, wait_until="domcontentloaded", timeout=45_000)
      page.wait_for_timeout(2500)
    except Exception:  # noqa: BLE001
      pass
    label = resolve_account_label(
      platform,
      cookies,
      nickname=str(captured.get("account") or ""),
      account_id=str(captured.get("account_id") or ""),
    )
    if label and not label.startswith(("会话 ", "设备 ")):
      return label
    scraped = resolve_account_display_name(cookies, page=page, platform=platform) or scrape_local_storage_nickname(page)
    if scraped:
      return scraped

  # Last resort: cookie-derived login identity (not pretty, but better than blank).
  return resolve_account_label(
    platform,
    cookies,
    nickname=str(captured.get("account") or ""),
    account_id=str(captured.get("account_id") or ""),
  )


def resolve_account_display_name(cookies: list[dict[str, Any]], page: Any | None = None, platform: str = "") -> str:
  from_cookies = normalize_display_name(guess_account_name(cookies))
  if from_cookies:
    return from_cookies
  if page is not None and platform:
    return scrape_account_name_from_page(page, platform)
  return ""


def mark_job(login_id: str, **fields: Any) -> LoginJob | None:
  with _lock:
    job = _jobs.get(login_id)
    if not job:
      return None
    for key, value in fields.items():
      setattr(job, key, value)
    return job


def get_job(login_id: str) -> LoginJob | None:
  with _lock:
    return _jobs.get(login_id)


def snapshot_job(login_id: str) -> dict[str, Any] | None:
  with _lock:
    job = _jobs.get(login_id)
    if not job:
      return None
    payload = None
    if job.status == "success" and job.session_payload and not job.consumed_payload:
      payload = job.session_payload
      job.consumed_payload = True
    return {
      "login_id": job.login_id,
      "platform": job.platform,
      "status": job.status,
      "account_display_name": job.account_display_name,
      "session_payload": payload,
      "error": job.error,
      "qr_image_base64": job.qr_image_base64 or "",
      "progress": job.progress or "",
      "needs_sms": bool(job.needs_sms),
    }


def submit_login_sms(login_id: str, code: str) -> bool:
  """Queue an SMS / OTP code for the in-flight Playwright login job."""
  cleaned = str(code or "").strip().replace(" ", "")
  if not cleaned or len(cleaned) < 4 or len(cleaned) > 8 or not cleaned.isdigit():
    raise ValueError("请输入 4–8 位数字验证码")
  with _lock:
    job = _jobs.get(login_id)
    if not job or job.status != "pending":
      raise ValueError("登录任务不存在或已结束，请重新点击连接")
    job.sms_code = cleaned
    job.progress = "已收到验证码，正在提交…"
    job.needs_sms = True
    return True


def take_pending_sms(login_id: str) -> str:
  with _lock:
    job = _jobs.get(login_id)
    if not job:
      return ""
    code = str(job.sms_code or "").strip()
    job.sms_code = ""
    return code


BrowserRunner = Callable[..., dict[str, Any]]


def _wait_until_user_closes_browser(
  page: Any,
  browser: Any,
  window_closed: dict[str, bool],
  *,
  timeout_sec: float = KEEP_OPEN_AFTER_SUCCESS_SEC,
) -> None:
  """Leave the window open until the user closes it (or soft timeout)."""
  deadline = time.time() + max(30.0, float(timeout_sec))
  while time.time() < deadline:
    try:
      if window_closed.get("value") or page.is_closed():
        break
    except Exception:  # noqa: BLE001
      break
    try:
      page.wait_for_timeout(800)
    except Exception:  # noqa: BLE001
      break
  # Caller closes the browser/context; do not close here when using persistent profiles.


def page_login_progress(page: Any) -> str:
  """Best-effort DOM signal after the phone interacts with the QR."""
  try:
    return str(
      page.evaluate(
        """() => {
          const t = document.body?.innerText || '';
          if (/验证码|短信验证|安全验证|输入验证码|获取验证码|手机号验证/.test(t)) return 'sms';
          if (/登录成功|已成功登录|登录完成/.test(t)) return 'confirmed';
          if (/扫码成功|已扫描|请在手机上确认|确认登录|扫码后点击确认/.test(t)) return 'scanned';
          return '';
        }"""
      )
      or ""
    )
  except Exception:  # noqa: BLE001
    return ""


def fill_sms_and_submit(page: Any, code: str) -> bool:
  """Type an SMS/OTP into the visible challenge form and submit."""
  cleaned = str(code or "").strip()
  if not cleaned:
    return False
  filled = False
  for selector in (
    'input[placeholder*="验证码"]',
    'input[placeholder*="动态码"]',
    'input[name*="code" i]',
    'input[autocomplete="one-time-code"]',
    'input[type="tel"]',
    'input[maxlength="6"]',
    'input[maxlength="4"]',
    'input[maxlength="8"]',
  ):
    try:
      loc = page.locator(selector).first
      if loc.count() == 0:
        continue
      try:
        if not loc.is_visible(timeout=400):
          continue
      except Exception:  # noqa: BLE001
        continue
      loc.fill(cleaned, timeout=2500)
      filled = True
      break
    except Exception:  # noqa: BLE001
      continue
  if not filled:
    return False
  for selector in (
    'button:has-text("登录")',
    'button:has-text("确定")',
    'button:has-text("确认")',
    'button:has-text("验证")',
    'button:has-text("提交")',
    'button:has-text("下一步")',
    '[class*="submit"]',
  ):
    try:
      loc = page.locator(selector).first
      if loc.count() == 0:
        continue
      loc.click(timeout=2500)
      return True
    except Exception:  # noqa: BLE001
      continue
  try:
    page.keyboard.press("Enter")
    return True
  except Exception:  # noqa: BLE001
    return filled


def ensure_login_surface(page: Any, platform: str, start_url: str) -> None:
  """Open the visible login UI (QR / phone) when landing pages hide it."""
  # Keep waits short — hosted users stare at an empty QR modal until we emit.
  settle_ms = 250 if HEADLESS else 800
  click_pause_ms = 350 if HEADLESS else 800
  try:
    page.wait_for_timeout(settle_ms)
  except Exception:  # noqa: BLE001
    pass

  if platform == "xhs":
    try:
      if page.url and "login" not in page.url and "signin" not in page.url:
        page.goto("https://www.xiaohongshu.com/login", wait_until="domcontentloaded", timeout=30_000)
    except Exception:  # noqa: BLE001
      try:
        page.goto(start_url, wait_until="domcontentloaded", timeout=30_000)
      except Exception:  # noqa: BLE001
        pass

  click_labels = (
    "扫码登录",
    "二维码登录",
    "登录",
  )
  try:
    page.wait_for_timeout(settle_ms)
    for label in click_labels:
      loc = page.get_by_text(label, exact=False).first
      if loc.count() > 0:
        try:
          loc.click(timeout=1500)
          page.wait_for_timeout(click_pause_ms)
          break
        except Exception:  # noqa: BLE001
          continue
    for selector in (
      ".login-btn",
      "button:has-text('登录')",
      "[class*='qrcode']",
      "[class*='Qrcode']",
    ):
      loc = page.locator(selector).first
      if loc.count() > 0:
        try:
          loc.click(timeout=1200)
          page.wait_for_timeout(click_pause_ms)
          break
        except Exception:  # noqa: BLE001
          continue
  except Exception:  # noqa: BLE001
    pass


def capture_qr_image(page: Any, platform: str) -> str:
  """Return a data-URL (or raw base64 PNG) of the visible login QR, or empty string."""
  selectors = QR_SELECTORS.get(platform) or (
    "img[src*='qr']",
    "canvas",
    "[class*='qrcode'] img",
    "[class*='qr-code'] img",
  )
  for selector in selectors:
    try:
      loc = page.locator(selector).first
      if loc.count() == 0:
        continue
      try:
        if not loc.is_visible(timeout=300):
          continue
      except Exception:  # noqa: BLE001
        continue

      # Prefer <img src="data:..."> or http(s) QR image URL.
      tag = ""
      try:
        tag = (loc.evaluate("el => el.tagName") or "").lower()
      except Exception:  # noqa: BLE001
        tag = ""

      if tag == "img":
        src = ""
        try:
          src = str(loc.get_attribute("src") or "").strip()
        except Exception:  # noqa: BLE001
          src = ""
        if src.startswith("data:image"):
          return src
        if src.startswith("http://") or src.startswith("https://"):
          try:
            resp = page.request.get(src, timeout=15_000)
            if resp.ok:
              mime = resp.headers.get("content-type") or "image/png"
              if ";" in mime:
                mime = mime.split(";", 1)[0].strip()
              raw = resp.body()
              return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"
          except Exception:  # noqa: BLE001
            pass

      if tag == "canvas":
        try:
          data_url = loc.evaluate(
            """(el) => {
              try { return el.toDataURL('image/png'); } catch (e) { return ''; }
            }"""
          )
          if isinstance(data_url, str) and data_url.startswith("data:image"):
            return data_url
        except Exception:  # noqa: BLE001
          pass

      png = loc.screenshot(type="png")
      if png:
        return f"data:image/png;base64,{base64.b64encode(png).decode('ascii')}"
    except Exception:  # noqa: BLE001
      continue

  # Last resort: screenshot a likely QR container.
  for container in (
    "[class*='qrcode']",
    "[class*='Qrcode']",
    "[class*='qr-code']",
    "#qrcode",
  ):
    try:
      loc = page.locator(container).first
      if loc.count() == 0:
        continue
      try:
        if not loc.is_visible(timeout=500):
          continue
      except Exception:  # noqa: BLE001
        continue
      png = loc.screenshot(type="png")
      if png:
        return f"data:image/png;base64,{base64.b64encode(png).decode('ascii')}"
    except Exception:  # noqa: BLE001
      continue
  return ""


def probe_browser_session(page: Any, platform: str, captured: dict[str, Any] | None = None) -> bool:
  """Hit first-party APIs in the browser to confirm an injected session is live."""
  captured = captured if captured is not None else {}
  if platform == "zhihu":
    if not has_meaningful_cookie(page.context.cookies(), ("z_c0",), min_len=16):
      return False
    try:
      resp = page.request.get(
        "https://www.zhihu.com/api/v4/me?include=account_status",
        headers={
          "Accept": "application/json, text/plain, */*",
          "Referer": "https://www.zhihu.com/",
        },
        timeout=15_000,
      )
      if resp.status != 200:
        return False
      body = resp.json()
      if isinstance(body, dict) and (body.get("id") or body.get("url_token") or body.get("name")):
        absorb = nickname_from_mapping(body)
        if absorb and not captured.get("account"):
          captured["account"] = absorb
        mark_login_verified(captured)
        return True
    except Exception:  # noqa: BLE001
      return False
  return False


def seed_saved_cookies(context: Any, platform: str) -> bool:
  """Inject previously saved cookies so reconnect / re-open is not a blank guest browser."""
  payload = load_platform_session(platform)
  cleaned = playwright_cookies_from_session(payload, platform)
  if not cleaned:
    return False
  try:
    # Playwright requires a URL in the cookie domain before add_cookies in some cases;
    # open a blank page on the site origin first.
    bootstrap = PROFILE_BOOTSTRAP.get(platform) or LOGIN_URLS.get(platform) or "about:blank"
    page = context.new_page()
    page.goto(bootstrap, wait_until="domcontentloaded", timeout=45_000)
    context.add_cookies(cleaned)
    page.close()
    return True
  except Exception:  # noqa: BLE001
    return False


def default_playwright_runner(
  platform: str,
  timeout_sec: float,
  on_authenticated: Callable[[dict[str, Any]], None] | None = None,
  on_qr: Callable[[str], None] | None = None,
  on_progress: Callable[[str], None] | None = None,
  on_needs_sms: Callable[[bool], None] | None = None,
  poll_sms: Callable[[], str] | None = None,
) -> dict[str, Any]:
  try:
    from playwright.sync_api import sync_playwright
  except ImportError as exc:
    raise RuntimeError(
      "未安装 Playwright。请执行: pip install playwright && playwright install chromium"
    ) from exc

  url = LOGIN_URLS[platform]
  home = PROFILE_BOOTSTRAP.get(platform) or url
  deadline = time.time() + timeout_sec
  keep_open = platform in KEEP_BROWSER_OPEN_AFTER_LOGIN and not HEADLESS
  use_persistent = platform in PERSISTENT_BROWSER_PLATFORMS and not HEADLESS
  captured: dict[str, Any] = {"account": "", "account_id": "", "logged_in": False, "login_verified": False}
  saved_payload = load_platform_session(platform)
  session_ua = str((saved_payload or {}).get("ua") or UA_FALLBACK).strip() or UA_FALLBACK
  last_qr = ""

  browser = None
  context = None
  page = None
  window_closed = {"value": False}

  def close_browser() -> None:
    nonlocal browser, context
    try:
      if context is not None:
        context.close()
    except Exception:  # noqa: BLE001
      pass
    context = None
    try:
      if browser is not None and browser.is_connected():
        browser.close()
    except Exception:  # noqa: BLE001
      pass
    browser = None

  def emit_progress(msg: str) -> None:
    if on_progress is None:
      return
    try:
      on_progress(str(msg or ""))
    except Exception:  # noqa: BLE001
      pass

  def emit_needs_sms(needed: bool) -> None:
    if on_needs_sms is None:
      return
    try:
      on_needs_sms(bool(needed))
    except Exception:  # noqa: BLE001
      pass

  def emit_qr() -> None:
    nonlocal last_qr
    if on_qr is None or page is None:
      return
    try:
      data = capture_qr_image(page, platform)
    except Exception:  # noqa: BLE001
      return
    if data and data != last_qr:
      last_qr = data
      try:
        on_qr(data)
      except Exception:  # noqa: BLE001
        pass

  def finish(account: str, cookies: list[dict[str, Any]]) -> dict[str, Any]:
    result = {
      "cookies": cookies_to_header(cookies),
      "cookie_items": cookies,
      "account_display_name": account,
      "ua": session_ua,
    }
    if on_authenticated is not None:
      on_authenticated(result)
    if keep_open:
      try:
        current = str(getattr(page, "url", "") or "")
        if "signin" in current or "/login" in current:
          page.goto(home, wait_until="domcontentloaded", timeout=45_000)
          page.wait_for_timeout(800)
        try:
          page.evaluate(
            """() => {
              document.title = '拾藏已保存登录 · 可关闭此窗口';
            }"""
          )
        except Exception:  # noqa: BLE001
          pass
      except Exception:  # noqa: BLE001
        pass
      _wait_until_user_closes_browser(page, browser or context, window_closed)
      # Re-dump cookies after browsing — Zhihu may rotate tokens while the window stays open.
      try:
        final_cookies = context.cookies() if context is not None else cookies
        result = {
          "cookies": cookies_to_header(final_cookies),
          "cookie_items": final_cookies,
          "account_display_name": account,
          "ua": session_ua,
        }
        if on_authenticated is not None:
          on_authenticated(result)
      except Exception:  # noqa: BLE001
        pass
      close_browser()
      return result
    close_browser()
    return result

  with sync_playwright() as playwright:
    try:
      if use_persistent:
        profile_dir = browser_profile_dir(platform)
        profile_dir.mkdir(parents=True, exist_ok=True)
        launch_kwargs: dict[str, Any] = {
          "user_data_dir": str(profile_dir),
          "headless": False,
          "locale": "zh-CN",
          "user_agent": session_ua,
          "viewport": {"width": 1280, "height": 860},
        }
        # Prefer installed Google Chrome for Zhihu — bundled Chromium is often blocked.
        try:
          context = playwright.chromium.launch_persistent_context(channel="chrome", **launch_kwargs)
        except Exception:  # noqa: BLE001
          context = playwright.chromium.launch_persistent_context(**launch_kwargs)
        browser = context.browser
        page = context.pages[0] if context.pages else context.new_page()
        seeded = True  # profile itself carries prior cookies
      else:
        chrome_args = []
        if HEADLESS:
          chrome_args = [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-extensions",
            "--disable-background-networking",
            "--disable-default-apps",
            "--mute-audio",
          ]
        launch_kwargs = {
          "headless": HEADLESS,
          "args": chrome_args,
        }
        browser = playwright.chromium.launch(**launch_kwargs)
        context = browser.new_context(
          locale="zh-CN",
          user_agent=session_ua,
          viewport={"width": 1100, "height": 760},
        )
        # Hosted reconnect: skip slow cookie-seed navigation; QR path is the product UX.
        seeded = False if HEADLESS else seed_saved_cookies(context, platform)
        page = context.new_page()

      def _mark_window_closed() -> None:
        window_closed["value"] = True

      page.on("close", _mark_window_closed)
      attach_account_response_listener(page, platform, captured)
      # Prefer home when we already have a profile/session so a valid login
      # shows as logged-in (not a blank sign-in page that looks like "logged out").
      start_url = home if seeded else url
      page.goto(start_url, wait_until="domcontentloaded", timeout=35_000 if HEADLESS else 60_000)
      if seeded:
        page.wait_for_timeout(1200)
        probe_browser_session(page, platform, captured)
        if platform != "zhihu":
          page.reload(wait_until="domcontentloaded", timeout=45_000)
          page.wait_for_timeout(800)
        cookies = context.cookies()
        if platform_login_ready(page, platform, cookies, captured) and verify_authenticated_session(
          platform, page, cookies, captured,
        ):
          account = capture_account_after_login(page, platform, cookies, captured)
          if not weak_account_label(platform, account):
            return finish(account, context.cookies())
        ensure_login_surface(page, platform, url)
      else:
        ensure_login_surface(page, platform, url)

      # Burst-capture QR so the web modal fills ASAP (don't wait for the slow poll loop).
      session_fingerprint = ""
      scan_seen_at = 0.0
      for _ in range(24):
        emit_qr()
        if last_qr:
          break
        try:
          page.wait_for_timeout(250)
        except Exception:  # noqa: BLE001
          break
      try:
        session_fingerprint = "|".join(
          sorted(
            f"{c.get('name')}={str(c.get('value') or '')[:24]}"
            for c in (context.cookies() if context is not None else [])
            if str(c.get("name") or "") in {
              "web_session", "a1", "sessionid", "sessionid_ss", "z_c0", "SESSDATA", "DedeUserID",
            }
          )
        )
      except Exception:  # noqa: BLE001
        session_fingerprint = ""
      emit_progress("请用手机 App 扫描二维码")

      ready_streak = 0
      closed_hint = (
        "登录窗口已关闭。请重新点击「连接」并完成扫码；"
        "知乎会复用本机登录配置，成功保存后关闭窗口不会退出拾藏登录态。"
        if use_persistent
        else (
          "登录已取消或浏览器已关闭。请重新点击「连接」并完成扫码。"
          if HEADLESS
          else "登录窗口已关闭。请重新点击「连接」，扫码后等待窗口自动关闭，不要手动关闭。"
        )
      )
      while time.time() < deadline:
        if window_closed["value"]:
          raise LoginWindowClosed(closed_hint)
        try:
          if page.is_closed():
            raise LoginWindowClosed(closed_hint)
        except LoginWindowClosed:
          raise
        except Exception:  # noqa: BLE001
          pass
        if not last_qr or ready_streak == 0:
          emit_qr()
        cookies = context.cookies()

        # NEVER navigate away from the login page while waiting for QR confirm —
        # that kills the platform's scan-status polling and leaves the phone
        # "logged in" while this browser never receives the session.

        progress = page_login_progress(page)
        if progress == "sms":
          emit_needs_sms(True)
          emit_progress("平台要求短信验证码：请查看手机短信，在弹窗中输入验证码")
          scan_seen_at = 0.0
          code = ""
          if poll_sms is not None:
            try:
              code = str(poll_sms() or "").strip()
            except Exception:  # noqa: BLE001
              code = ""
          if code:
            emit_progress("正在提交验证码…")
            if fill_sms_and_submit(page, code):
              emit_needs_sms(False)
              try:
                page.wait_for_timeout(2000)
              except Exception:  # noqa: BLE001
                pass
            else:
              emit_progress("未能自动填入验证码，请重试输入")
          page.wait_for_timeout(800)
          continue

        if progress == "scanned":
          if not scan_seen_at:
            scan_seen_at = time.time()
          emit_progress("已扫码，请在手机上确认登录")
        elif progress == "confirmed":
          if not scan_seen_at:
            scan_seen_at = time.time()
          emit_progress("手机已确认，正在同步登录态…")

        try:
          fp_now = "|".join(
            sorted(
              f"{c.get('name')}={str(c.get('value') or '')[:24]}"
              for c in cookies
              if str(c.get("name") or "") in {
                "web_session", "a1", "sessionid", "sessionid_ss", "z_c0", "SESSDATA", "DedeUserID",
              }
            )
          )
        except Exception:  # noqa: BLE001
          fp_now = session_fingerprint
        if session_fingerprint and fp_now and fp_now != session_fingerprint:
          emit_progress("检测到会话更新，正在校验…")
          session_fingerprint = fp_now

        if scan_seen_at and not captured.get("login_verified") and (time.time() - scan_seen_at) > 70:
          raise TimeoutError(
            "手机已确认登录，但网页端未拿到会话。"
            "若手机收到了短信验证码，请重新连接并在弹窗中输入验证码；"
            "若反复失败，可能是平台拦截了服务器浏览器。"
          )

        if platform_login_ready(page, platform, cookies, captured):
          ready_streak += 1
          emit_progress("登录已确认，正在保存…")
        else:
          ready_streak = 0

        if ready_streak >= 2:
          fresh = context.cookies()
          if not verify_authenticated_session(platform, page, fresh, captured):
            ready_streak = 0
            page.wait_for_timeout(800)
            continue
          for _ in range(8):
            if captured.get("account") or captured.get("account_id"):
              break
            page.wait_for_timeout(400)
          account = capture_account_after_login(page, platform, fresh, captured)
          if platform == "zhihu" and not str(account or "").strip():
            me = fetch_zhihu_me(page)
            if me:
              account = normalize_display_name(me.get("name")) or (
                f"知乎用户 {str(me.get('url_token') or '')[:16]}".strip()
              )
            account = str(account or "").strip() or "知乎账号"
          if not str(account or "").strip() and captured.get("login_verified"):
            account = {
              "xhs": "小红书账号",
              "douyin": "抖音账号",
              "zhihu": "知乎账号",
              "bilibili": "B 站账号",
            }.get(platform, "已登录账号")
          if weak_account_label(platform, account):
            page.wait_for_timeout(1000)
            better = capture_account_after_login(page, platform, context.cookies(), captured)
            if better and not weak_account_label(platform, better):
              account = better
            elif captured.get("login_verified"):
              account = better or account or {
                "xhs": "小红书账号",
                "douyin": "抖音账号",
                "zhihu": "知乎账号",
                "bilibili": "B 站账号",
              }.get(platform, "已登录账号")
            else:
              ready_streak = 0
              page.wait_for_timeout(800)
              continue
          fresh = context.cookies()
          if not verify_authenticated_session(platform, page, fresh, captured):
            ready_streak = 0
            page.wait_for_timeout(800)
            continue
          emit_progress("登录成功")
          return finish(account, fresh)
        page.wait_for_timeout(800)
      close_browser()
      raise TimeoutError("登录超时，请重试并完成扫码")
    except Exception:
      close_browser()
      raise


UA_FALLBACK = (
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _persist_login_success(login_id: str, platform: str, result: dict[str, Any]) -> None:
  payload = {
    "cookies": str(result.get("cookies") or "").strip(),
    "cookie_items": result.get("cookie_items") if isinstance(result.get("cookie_items"), list) else [],
    "ua": str(result.get("ua") or UA_FALLBACK),
    "captured_at": _now_iso(),
    "account_display_name": str(result.get("account_display_name") or "").strip(),
  }
  if not payload["cookies"]:
    raise RuntimeError("登录完成但未拿到 Cookie")
  save_platform_session(platform, payload)
  mark_job(
    login_id,
    status="success",
    account_display_name=payload["account_display_name"],
    session_payload=json.dumps(payload, ensure_ascii=False),
    error="",
    qr_image_base64="",
    needs_sms=False,
    progress="登录成功",
  )


def _run_job(login_id: str, platform: str, runner: BrowserRunner, timeout_sec: float) -> None:
  early_done = {"value": False}

  def on_authenticated(result: dict[str, Any]) -> None:
    if early_done["value"]:
      return
    _persist_login_success(login_id, platform, result)
    early_done["value"] = True

  def on_qr(data_url: str) -> None:
    if early_done["value"]:
      return
    mark_job(login_id, qr_image_base64=str(data_url or ""))

  def on_progress(msg: str) -> None:
    if early_done["value"]:
      return
    mark_job(login_id, progress=str(msg or ""))

  def on_needs_sms(needed: bool) -> None:
    if early_done["value"]:
      return
    mark_job(login_id, needs_sms=bool(needed))

  def poll_sms() -> str:
    return take_pending_sms(login_id)

  try:
    import inspect

    params = inspect.signature(runner).parameters
    kwargs: dict[str, Any] = {}
    if "on_authenticated" in params:
      kwargs["on_authenticated"] = on_authenticated
    if "on_qr" in params:
      kwargs["on_qr"] = on_qr
    if "on_progress" in params:
      kwargs["on_progress"] = on_progress
    if "on_needs_sms" in params:
      kwargs["on_needs_sms"] = on_needs_sms
    if "poll_sms" in params:
      kwargs["poll_sms"] = poll_sms
    result = runner(platform, timeout_sec, **kwargs)
    if early_done["value"]:
      return
    _persist_login_success(login_id, platform, result)
  except TimeoutError as exc:
    if early_done["value"]:
      return
    mark_job(login_id, status="expired", error=str(exc), needs_sms=False)
  except LoginWindowClosed as exc:
    if early_done["value"]:
      return
    mark_job(login_id, status="failed", error=str(exc), needs_sms=False)
  except Exception as exc:  # noqa: BLE001
    if early_done["value"]:
      return
    err = str(exc).lower()
    if "closed" in err or ("target" in err and "closed" in err):
      mark_job(
        login_id,
        status="failed",
        error="登录已取消或浏览器已关闭。请重新点击「连接」并完成扫码。",
        needs_sms=False,
      )
      return
    mark_job(login_id, status="failed", error=str(exc) or "登录失败", needs_sms=False)


def start_login(
  platform: str,
  *,
  runner: BrowserRunner | None = None,
  timeout_sec: float = LOGIN_TIMEOUT_SEC,
) -> str:
  code = str(platform or "").strip().lower()
  if code not in SUPPORTED_LOGIN_PLATFORMS:
    raise ValueError("仅支持小红书、抖音、知乎与 B 站本机真实登录")
  login_id = uuid.uuid4().hex
  job = LoginJob(login_id=login_id, platform=code)
  with _lock:
    _jobs[login_id] = job
  thread = threading.Thread(
    target=_run_job,
    args=(login_id, code, runner or default_playwright_runner, timeout_sec),
    daemon=True,
  )
  thread.start()
  return login_id


def logout_platform(platform: str) -> None:
  clear_platform_session(platform)
  try:
    clear_browser_profile(platform)
  except Exception:  # noqa: BLE001
    pass
