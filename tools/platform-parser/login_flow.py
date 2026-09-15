"""Local Playwright login jobs for xhs / douyin."""

from __future__ import annotations

import json
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

from session_store import (
  SUPPORTED_LOGIN_PLATFORMS,
  clear_platform_session,
  save_platform_session,
)

LOGIN_TIMEOUT_SEC = 180

LOGIN_URLS = {
  "xhs": "https://www.xiaohongshu.com/explore",
  "douyin": "https://www.douyin.com/",
}

SUCCESS_COOKIE_KEYS = {
  # Note: xhs sets web_session for guests too — real login is confirmed via /user/me.
  "xhs": ("web_session",),
  "douyin": ("sessionid", "sessionid_ss", "sid_tt", "uid_tt"),
}

PROFILE_BOOTSTRAP = {
  "xhs": "https://www.xiaohongshu.com/user/profile/me",
  "douyin": "https://www.douyin.com/user/self",
}



@dataclass
class LoginJob:
  login_id: str
  platform: str
  status: str = "pending"  # pending | success | failed | expired
  account_display_name: str = ""
  session_payload: str | None = None
  error: str = ""
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
    if data.get("guest") is True:
      return None
    if data.get("user_id") or data.get("nickname") or data.get("red_id"):
      return data
  except Exception:  # noqa: BLE001
    return None
  return None


def scrape_account_name_from_page(page: Any, platform: str) -> str:
  """Best-effort nickname from APIs / page state / DOM after real login."""
  if platform == "xhs":
    me = fetch_xhs_me(page)
    found = nickname_from_mapping(me or {})
    if found:
      return found
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
  if captured and captured.get("logged_in"):
    return True
  if platform == "xhs":
    # page.request /user/me often 406 (anti-bot). Prefer intercepted page responses.
    names = {str(item.get("name") or "") for item in cookies}
    if names & {
      "access-token-creator.xiaohongshu.com",
      "customer-sso-sid",
      "x-user-id-creator.xiaohongshu.com",
      "galaxy.creator.beaker.session.id",
    }:
      return True
    try:
      return bool(
        page.evaluate(
          """() => {
            const text = document.body?.innerText || '';
            if (/扫码登录|手机号登录|验证码登录/.test(text) && !/退出|我的频道|创作中心/.test(text)) {
              return false;
            }
            return Boolean(document.querySelector(
              '.side-bar .user, .side-bar .user-name, .reds-avatar, [class*="user-name"], a[href*="/user/profile/"]'
            ));
          }"""
        )
      )
    except Exception:  # noqa: BLE001
      return False
  return has_success_cookies(platform, cookies)


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
    if mark_login or nick or acc_id:
      if mark_login or nick:
        captured["logged_in"] = True
      elif acc_id and platform == "xhs" and data.get("guest") is False:
        captured["logged_in"] = True

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
        if "otherinfo" in url or "user/selfinfo" in url:
          absorb(data if isinstance(data, dict) else {}, mark_login=True)
        if "qrcode" in url and isinstance(data, dict):
          if data.get("login_status") in (True, 1, "success", "ok") or data.get("code_status") == 2:
            captured["logged_in"] = True
          absorb(data)

      if platform == "douyin":
        interesting = any(token in url for token in (
          "profile/self", "passport/account/info", "user/info", "query_user", "aweme/v1/web/user",
        ))
        if not interesting:
          return
        user = data
        if isinstance(data, dict):
          user = data.get("user") or data.get("user_info") or data.get("account") or data
        absorb(user if isinstance(user, dict) else {})
        if isinstance(body, dict) and body.get("status_code") == 0 and (captured.get("account") or captured.get("account_id")):
          captured["logged_in"] = True
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
    }


BrowserRunner = Callable[[str, float], dict[str, Any]]


def default_playwright_runner(platform: str, timeout_sec: float) -> dict[str, Any]:
  try:
    from playwright.sync_api import sync_playwright
  except ImportError as exc:
    raise RuntimeError(
      "未安装 Playwright。请执行: pip install playwright && playwright install chromium"
    ) from exc

  url = LOGIN_URLS[platform]
  deadline = time.time() + timeout_sec
  captured: dict[str, Any] = {"account": "", "account_id": "", "logged_in": False}
  with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=False)
    context = browser.new_context(
      locale="zh-CN",
      user_agent=UA_FALLBACK,
      viewport={"width": 1280, "height": 860},
    )
    page = context.new_page()
    attach_account_response_listener(page, platform, captured)
    page.goto(url, wait_until="domcontentloaded", timeout=60_000)
    try:
      while time.time() < deadline:
        cookies = context.cookies()
        if platform_login_ready(page, platform, cookies, captured):
          # Give first-party XHRs a moment to land nickname payloads.
          for _ in range(8):
            if captured.get("account") or captured.get("account_id"):
              break
            page.wait_for_timeout(500)
          account = capture_account_after_login(page, platform, cookies, captured)
          if not account or account.startswith(("会话 ", "设备 ")):
            page.wait_for_timeout(1500)
            better = capture_account_after_login(page, platform, context.cookies(), captured)
            if better:
              account = better
          fresh = context.cookies()
          header = cookies_to_header(fresh)
          browser.close()
          return {
            "cookies": header,
            "cookie_items": fresh,
            "account_display_name": account,
            "ua": UA_FALLBACK,
          }
        page.wait_for_timeout(1200)
      browser.close()
      raise TimeoutError("登录超时，请重试并完成扫码")
    except Exception:
      try:
        browser.close()
      except Exception:  # noqa: BLE001
        pass
      raise


UA_FALLBACK = (
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _run_job(login_id: str, platform: str, runner: BrowserRunner, timeout_sec: float) -> None:
  try:
    result = runner(platform, timeout_sec)
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
    )
  except TimeoutError as exc:
    mark_job(login_id, status="expired", error=str(exc))
  except Exception as exc:  # noqa: BLE001
    mark_job(login_id, status="failed", error=str(exc) or "登录失败")


def start_login(
  platform: str,
  *,
  runner: BrowserRunner | None = None,
  timeout_sec: float = LOGIN_TIMEOUT_SEC,
) -> str:
  code = str(platform or "").strip().lower()
  if code not in SUPPORTED_LOGIN_PLATFORMS:
    raise ValueError("仅支持小红书与抖音本机真实登录")
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
