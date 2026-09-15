#!/usr/bin/env python3
"""Local platform parser for Refind (runs on the user's network).

Browser calls this first so CN platforms are reachable; Edge only persists results.

  python3 tools/platform-parser/server.py
  # default http://127.0.0.1:8787

POST /parse {"url":"...","use_saved_session":false}
"""

from __future__ import annotations

import html as html_lib
import json
import os
import re
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import ProxyHandler, Request, build_opener, urlopen

HOST = "127.0.0.1"
PORT = 8787
UA = (
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
MOBILE_UA = (
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
)
COOKIE_ENV = os.environ.get("PLATFORM_COOKIE") or os.environ.get("ZHIHU_COOKIE") or ""
COOKIES_FILE = os.environ.get("PLATFORM_COOKIES_FILE") or str(
  Path(__file__).with_name("cookies.txt")
)
HTTP_PROXY = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY") or os.environ.get("https_proxy") or os.environ.get("http_proxy") or ""
SESSION_PLATFORMS = {"xhs", "douyin", "zhihu"}

from contextvars import ContextVar

from session_store import (
  COOKIE_DOMAINS,
  cookie_header_from_session,
  cookie_items_for_playwright,
  load_platform_session,
  write_netscape_cookie_file,
)

_active_cookie: ContextVar[str] = ContextVar("active_cookie", default="")


def has_saved_session(platform: str | None = None) -> bool:
  code = str(platform or "").strip().lower()
  if code and cookie_header_from_session(load_platform_session(code)):
    return True
  if COOKIE_ENV.strip():
    return True
  path = Path(COOKIES_FILE)
  try:
    return path.is_file() and path.stat().st_size > 0
  except OSError:
    return False


def resolve_request_cookie(platform: str | None = None, prefer_session: bool = False) -> str:
  if prefer_session:
    code = str(platform or "").strip().lower()
    header = cookie_header_from_session(load_platform_session(code)) if code else ""
    if header:
      return header
  return COOKIE_ENV.strip()

def detect_platform(url: str) -> str:
  host = (urlparse(url).hostname or "").lower()
  if host.endswith("xiaohongshu.com") or host.endswith("xhslink.com"):
    return "xhs"
  if host.endswith("douyin.com") or host.endswith("iesdouyin.com") or host == "v.douyin.com":
    return "douyin"
  if host.endswith("zhihu.com"):
    return "zhihu"
  if host.endswith("bilibili.com") or host.endswith("b23.tv"):
    return "bilibili"
  if host.endswith("mp.weixin.qq.com"):
    return "wechat_mp"
  return "web"


def clean_text(value: str) -> str:
  text = html_lib.unescape(str(value or ""))
  text = re.sub(r"\s+", " ", text).strip()
  return text


def html_to_text(fragment: str) -> str:
  text = re.sub(r"(?is)<script\b[^>]*>.*?</script>", " ", fragment)
  text = re.sub(r"(?is)<style\b[^>]*>.*?</style>", " ", text)
  text = re.sub(r"(?i)<br\s*/?>", "\n", text)
  text = re.sub(r"(?i)</p>", "\n\n", text)
  text = re.sub(r"(?i)</div>", "\n", text)
  text = re.sub(r"(?i)<[^>]+>", " ", text)
  text = html_lib.unescape(text)
  text = re.sub(r"[ \t]+\n", "\n", text)
  text = re.sub(r"\n{3,}", "\n\n", text)
  text = re.sub(r"[ \t]{2,}", " ", text)
  return text.strip()


def meta_content(html: str, names: list[str]) -> str:
  for name in names:
    patterns = [
      rf'(?is)<meta[^>]+(?:property|name)=["\']{re.escape(name)}["\'][^>]+content=["\']([^"\']+)["\']',
      rf'(?is)<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']{re.escape(name)}["\']',
    ]
    for pattern in patterns:
      match = re.search(pattern, html)
      if match:
        return clean_text(match.group(1))
  return ""


def extract_title(html: str) -> str:
  return meta_content(html, ["og:title", "twitter:title"]) or clean_text(
    (re.search(r"(?is)<title[^>]*>(.*?)</title>", html) or ["", ""])[1]
  )


def build_opener_with_proxy():
  if HTTP_PROXY:
    return build_opener(ProxyHandler({"http": HTTP_PROXY, "https": HTTP_PROXY}))
  return build_opener()


OPENER = build_opener_with_proxy()


def fetch_bytes(
  url: str,
  accept: str = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  user_agent: str = UA,
  extra_headers: dict | None = None,
) -> tuple[str, bytes]:
  headers = {
    "User-Agent": user_agent,
    "Accept": accept,
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": f"{urlparse(url).scheme}://{urlparse(url).netloc}/",
  }
  cookie = _active_cookie.get() or COOKIE_ENV.strip()
  if cookie:
    headers["Cookie"] = cookie
  if extra_headers:
    headers.update(extra_headers)
  req = Request(url, headers=headers)
  with OPENER.open(req, timeout=25) as response:
    final = response.geturl()
    return final, response.read()


def fetch_json(url: str) -> dict | None:
  try:
    _, raw = fetch_bytes(url, accept="application/json")
    return json.loads(raw.decode("utf-8", "ignore"))
  except Exception:
    return None


def summarize(text: str, title: str = "") -> str:
  body = clean_text(text) or clean_text(title)
  if not body:
    return ""
  if len(body) <= 140:
    return body
  return body[:140] + "…"


def result(
  *,
  platform: str,
  title: str = "",
  author_name: str = "",
  content_text: str = "",
  caption_text: str = "",
  subtitle_text: str = "",
  summary: str = "",
  playback_mode: str | None = None,
  playback_url: str = "",
  quality: str = "partial",
  canonical_url: str = "",
) -> dict:
  content_text = clean_text(content_text)
  caption_text = clean_text(caption_text)
  title = clean_text(title)
  if not content_text:
    content_text = caption_text or title
  if not summary:
    summary = summarize(content_text, title)
  return {
    "platform": platform,
    "title": title,
    "author_name": clean_text(author_name),
    "caption_text": caption_text,
    "content_text": content_text,
    "summary": summary,
    "subtitle_text": clean_text(subtitle_text),
    "playback_mode": playback_mode,
    "playback_url": playback_url,
    "quality": quality,
    "canonical_url": canonical_url,
  }


def extract_bilibili_id(url: str) -> tuple[str, str] | None:
  bv = re.search(r"\b(BV[\w]+)\b", url, re.I)
  if bv:
    return "bvid", bv.group(1)
  av = re.search(r"/video/av(\d+)", url, re.I) or re.search(r"[?&]aid=(\d+)", url, re.I)
  if av:
    return "aid", av.group(1)
  return None


def parse_bilibili(url: str) -> dict | None:
  final = url
  ident = extract_bilibili_id(url)
  if not ident:
    try:
      final, _ = fetch_html(url)
      ident = extract_bilibili_id(final)
    except Exception:
      ident = None
  if not ident:
    return None

  kind, value = ident
  query = f"bvid={value}" if kind == "bvid" else f"aid={value}"
  payload = fetch_json(f"https://api.bilibili.com/x/web-interface/view?{query}")
  embed = (
    f"https://player.bilibili.com/player.html?bvid={value}&autoplay=0"
    if kind == "bvid"
    else f"https://player.bilibili.com/player.html?aid={value}&autoplay=0"
  )
  if not payload or payload.get("code") != 0 or not payload.get("data"):
    label = value if kind == "bvid" else f"av{value}"
    return result(
      platform="bilibili",
      title=f"B站视频 {label}",
      content_text=f"已收藏 B 站视频 {label}。源站暂未返回简介，可先播放或打开原站。",
      caption_text="",
      summary=f"已收藏 B 站视频 {label}。完整简介待补全。",
      playback_mode="embed",
      playback_url=embed,
      quality="partial",
      canonical_url=final,
    )

  data = payload["data"]
  title = clean_text(data.get("title") or "")
  desc = clean_text(data.get("desc") or data.get("description") or "")
  if len(desc) < 8:
    desc = ""
  author = clean_text(((data.get("owner") or {}).get("name")) or "")
  body = desc or f"已收藏视频「{title}」。源站未提供简介。"
  return result(
    platform="bilibili",
    title=title,
    author_name=author,
    caption_text=desc,
    content_text=body,
    summary=summarize(desc, title) if desc else f"视频「{title}」已入库。源站未提供简介，可先播放观看。",
    playback_mode="embed",
    playback_url=embed,
    quality="full" if desc else "partial",
    canonical_url=final,
  )


def run_ytdlp(url: str, *, session_cookie: str = "", platform: str = "") -> dict | None:
  import tempfile

  attempts: list[list[str]] = []
  temp_cookie_path: Path | None = None
  if session_cookie.strip():
    domain = COOKIE_DOMAINS.get(str(platform or "").strip().lower(), ".douyin.com")
    extra = [".iesdouyin.com"] if str(platform or "") == "douyin" else []
    session = load_platform_session(str(platform or "").strip().lower()) if platform else None
    items = session.get("cookie_items") if isinstance(session, dict) else None
    fd, temp_name = tempfile.mkstemp(prefix="refind-cookies-", suffix=".txt")
    os.close(fd)
    temp_cookie_path = Path(temp_name)
    write_netscape_cookie_file(
      session_cookie,
      temp_cookie_path,
      domain=domain,
      cookie_items=items if isinstance(items, list) else None,
      extra_domains=extra,
    )
    attempts.append(["--cookies", str(temp_cookie_path)])
  if Path(COOKIES_FILE).is_file():
    attempts.append(["--cookies", COOKIES_FILE])
  attempts.append([])  # anonymous

  last_error = ""
  try:
    for cookie_args in attempts:
      cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--skip-download",
        "--no-warnings",
        "--dump-json",
        *cookie_args,
        url,
      ]
      try:
        completed = subprocess.run(cmd, capture_output=True, text=True, timeout=45, check=False)
      except (OSError, subprocess.TimeoutExpired) as exc:
        last_error = str(exc)
        continue
      if completed.returncode != 0 or not completed.stdout.strip():
        err_lines = (completed.stderr or "").strip().splitlines()
        last_error = err_lines[-1] if err_lines else last_error
        continue
      try:
        data = json.loads(completed.stdout.splitlines()[-1])
      except json.JSONDecodeError:
        continue

      detected = detect_platform(url)
      title = clean_text(data.get("title") or "")
      description = clean_text(data.get("description") or "")
      uploader = clean_text(data.get("uploader") or data.get("creator") or "")
      playback_mode = None
      playback_url = ""
      if detected == "bilibili":
        ident = extract_bilibili_id(url) or extract_bilibili_id(title)
        if ident and ident[0] == "bvid":
          playback_mode = "embed"
          playback_url = f"https://player.bilibili.com/player.html?bvid={ident[1]}&autoplay=0"
      elif detected == "douyin":
        playback_mode = "external_url"
        playback_url = url

      return result(
        platform=detected,
        title=title,
        author_name=uploader,
        caption_text=description,
        content_text=description or title,
        summary=summarize(description, title),
        playback_mode=playback_mode,
        playback_url=playback_url,
        quality="full" if len(description) >= 40 else "partial",
      )
  finally:
    if temp_cookie_path is not None:
      try:
        temp_cookie_path.unlink(missing_ok=True)
      except OSError:
        pass

  return None


def extract_douyin_id(url: str) -> str:
  match = re.search(r"/video/(\d+)", url) or re.search(r"[?&]modal_id=(\d+)", url)
  return match.group(1) if match else ""


def _looks_like_douyin_placeholder(title: str, desc: str) -> bool:
  blob = f"{title} {desc}"
  return ("记录美好生活" in blob) and ("已经收获了" in blob or "来抖音" in blob)


def extract_douyin_embedded(html: str) -> dict[str, str]:
  """Pull title/desc/author from Douyin SSR JSON blobs when present."""
  out = {"title": "", "desc": "", "author": ""}
  if not html:
    return out

  candidates: list[Any] = []
  for pattern in (
    r'<script[^>]+id="RENDER_DATA"[^>]*>([^<]+)</script>',
    r'window\._ROUTER_DATA\s*=\s*(\{.+?\})\s*;?\s*</script>',
    r'id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>\s*(\{.+?\})\s*</script>',
  ):
    match = re.search(pattern, html, re.I | re.S)
    if not match:
      continue
    raw = match.group(1).strip()
    try:
      from urllib.parse import unquote
      text = unquote(raw)
      candidates.append(json.loads(text))
    except Exception:
      continue

  def walk(node: Any, depth: int = 0) -> None:
    if depth > 8 or not node:
      return
    if isinstance(node, list):
      for item in node[:40]:
        walk(item, depth + 1)
      return
    if not isinstance(node, dict):
      return
    desc = node.get("desc") or node.get("description") or node.get("share_title") or ""
    title = node.get("share_title") or node.get("title") or ""
    author = ""
    author_obj = node.get("author") or node.get("authorInfo") or {}
    if isinstance(author_obj, dict):
      author = author_obj.get("nickname") or author_obj.get("nickName") or ""
    if desc and len(str(desc)) > len(out["desc"]):
      out["desc"] = clean_text(str(desc))
    if title and len(str(title)) > len(out["title"]):
      out["title"] = clean_text(str(title))
    if author and not out["author"]:
      out["author"] = clean_text(str(author))
    for value in node.values():
      if isinstance(value, (dict, list)):
        walk(value, depth + 1)

  for item in candidates:
    walk(item)
  return out


def parse_douyin(url: str) -> dict | None:
  final = url
  html = ""
  try:
    final, html = fetch_html(url, user_agent=MOBILE_UA)
  except Exception:
    html = ""
  video_id = extract_douyin_id(final) or extract_douyin_id(url)

  embedded = extract_douyin_embedded(html)
  title = embedded.get("title") or (extract_title(html) if html else "")
  desc = embedded.get("desc") or (meta_content(html, ["og:description", "description"]) if html else "")
  author = embedded.get("author") or ""

  if video_id and (not title or _looks_like_douyin_placeholder(title, desc)):
    try:
      share_url = f"https://www.iesdouyin.com/share/video/{video_id}/"
      _, share_html = fetch_html(share_url, user_agent=MOBILE_UA)
      share_embedded = extract_douyin_embedded(share_html)
      title = share_embedded.get("title") or extract_title(share_html) or title
      desc = share_embedded.get("desc") or meta_content(share_html, ["og:description", "description"]) or desc
      author = share_embedded.get("author") or author
    except Exception:
      pass

  session_cookie = _active_cookie.get() or ""
  ytdlp = run_ytdlp(final or url, session_cookie=session_cookie, platform="douyin")
  if ytdlp and (ytdlp.get("content_text") or ytdlp.get("title")):
    if not _looks_like_douyin_placeholder(ytdlp.get("title") or "", ytdlp.get("content_text") or ""):
      return ytdlp

  if session_cookie:
    browser_parsed = parse_douyin_with_playwright(final or url)
    if browser_parsed:
      return browser_parsed

  if title or desc:
    if _looks_like_douyin_placeholder(title, desc) and not author:
      # Generic login-wall / dead-link OG tags — treat as failure so caller can surface cookie hint.
      return None
    body = desc or title
    return result(
      platform="douyin",
      title=title or f"抖音视频 {video_id or ''}".strip(),
      author_name=author,
      caption_text=desc,
      content_text=body,
      summary=summarize(desc, title),
      playback_mode="external_url",
      playback_url=final or url,
      quality="full" if len(body) >= 40 and not _looks_like_douyin_placeholder(title, desc) else "partial",
      canonical_url=final or url,
    )
  return None


def parse_douyin_with_playwright(url: str) -> dict | None:
  """Open the video URL in Chromium with the saved Douyin session and scrape metadata."""
  session = load_platform_session("douyin")
  items = cookie_items_for_playwright(session, ".douyin.com")
  if not items:
    return None
  # Also seed iesdouyin domain copies when only header cookies exist.
  seeded = list(items)
  names = {(c["name"], c["domain"]) for c in items}
  for item in items:
    twin = {**item, "domain": ".iesdouyin.com"}
    key = (twin["name"], twin["domain"])
    if key not in names:
      seeded.append(twin)
      names.add(key)

  try:
    from playwright.sync_api import sync_playwright
  except ImportError:
    return None

  try:
    with sync_playwright() as playwright:
      browser = playwright.chromium.launch(headless=True)
      context = browser.new_context(locale="zh-CN", user_agent=MOBILE_UA)
      context.add_cookies(seeded)
      page = context.new_page()
      page.goto(url, wait_until="domcontentloaded", timeout=45_000)
      page.wait_for_timeout(2500)
      html = page.content()
      final = page.url
      browser.close()
  except Exception:
    return None

  embedded = extract_douyin_embedded(html)
  title = embedded.get("title") or extract_title(html)
  desc = embedded.get("desc") or meta_content(html, ["og:description", "description"])
  author = embedded.get("author") or ""
  if not title and not desc:
    return None
  if _looks_like_douyin_placeholder(title, desc) and not author:
    return None
  body = desc or title
  return result(
    platform="douyin",
    title=title or "抖音视频",
    author_name=author,
    caption_text=desc,
    content_text=body,
    summary=summarize(desc, title),
    playback_mode="external_url",
    playback_url=final or url,
    quality="full" if len(body) >= 40 else "partial",
    canonical_url=final or url,
  )


def fetch_html(url: str, user_agent: str = UA) -> tuple[str, str]:
  final, raw = fetch_bytes(url, user_agent=user_agent)
  for encoding in ("utf-8", "gb18030", "latin-1"):
    try:
      return final, raw.decode(encoding)
    except UnicodeDecodeError:
      continue
  return final, raw.decode("utf-8", "ignore")


def parse_zhihu(url: str) -> dict | None:
  html = ""
  final = url
  try:
    final, html = fetch_html(url, user_agent=UA)
  except Exception:
    try:
      final, html = fetch_html(url, user_agent=MOBILE_UA)
    except Exception:
      return None

  title = extract_title(html)
  desc = meta_content(html, ["og:description", "description"])
  body = ""
  for pattern in [
    r'(?is)class=["\'][^"\']*RichText[^"\']*["\'][^>]*>(.*?)</div>',
    r"(?is)<article\b[^>]*>(.*?)</article>",
    r'(?is)itemProp=["\']text["\'][^>]*>(.*?)</div>',
  ]:
    match = re.search(pattern, html)
    if match:
      body = html_to_text(match.group(1))
      if len(body) >= 40:
        break
  if not body:
    body = desc

  if not title and not body:
    return None
  if title in {"知乎", "安全验证", "请先登录", "404 - 知乎"} and len(body) < 20:
    return None

  return result(
    platform="zhihu",
    title=title or "知乎内容",
    content_text=body,
    summary=summarize(body or desc, title),
    quality="full" if len(body) >= 80 else "partial",
    canonical_url=final,
  )


def parse_wechat(url: str) -> dict | None:
  try:
    final, html = fetch_html(url)
  except Exception:
    return None
  title = extract_title(html) or meta_content(html, ["twitter:title"])
  author = meta_content(html, ["author", "og:article:author"])
  desc = meta_content(html, ["og:description", "description"])
  body = ""
  match = re.search(r'(?is)id=["\']js_content["\'][^>]*>(.*?)</div>', html)
  if match:
    body = html_to_text(match.group(1))
  if not body:
    body = desc
  if not (title or body):
    return None
  return result(
    platform="wechat_mp",
    title=title or "微信公众号文章",
    author_name=author,
    content_text=body,
    caption_text="",
    summary=summarize(body or desc, title),
    quality="full" if len(body) >= 80 else "partial",
    canonical_url=final,
  )


def parse_xhs(url: str) -> dict | None:
  try:
    final, html = fetch_html(url)
  except Exception:
    return None
  title = extract_title(html)
  desc = meta_content(html, ["og:description", "description"])
  body = desc
  # Best-effort parse of embedded state for note pages.
  state_match = re.search(r"window\.__INITIAL_STATE__\s*=\s*(\{.+?\})</script>", html, re.S)
  if state_match:
    raw = state_match.group(1)
    raw = raw.replace("undefined", "null")
    try:
      state = json.loads(raw)
    except json.JSONDecodeError:
      state = None
    if isinstance(state, dict):
      note_map = (
        ((state.get("note") or {}).get("noteDetailMap"))
        or state.get("noteDetailMap")
        or {}
      )
      if isinstance(note_map, dict):
        for item in note_map.values():
          note = (item or {}).get("note") if isinstance(item, dict) else None
          if not isinstance(note, dict):
            continue
          title = clean_text(note.get("title") or title)
          body = clean_text(note.get("desc") or note.get("description") or body)
          break
  if not (title or body):
    return None
  return result(
    platform="xhs",
    title=title or "小红书笔记",
    content_text=body or title,
    summary=summarize(body, title),
    quality="full" if len(body or "") >= 40 else "partial",
    canonical_url=final,
  )


def parse_generic(url: str, platform: str) -> dict | None:
  try:
    final, html = fetch_html(url)
  except Exception:
    return None
  title = extract_title(html)
  desc = meta_content(html, ["og:description", "description"])
  body = ""
  for pattern in [
    r"(?is)<article\b[^>]*>(.*?)</article>",
    r"(?is)<main\b[^>]*>(.*?)</main>",
  ]:
    match = re.search(pattern, html)
    if match:
      body = html_to_text(match.group(1))
      if len(body) >= 80:
        break
  if not body:
    body = desc
  if not (title or body):
    return None
  return result(
    platform=platform,
    title=title or final,
    content_text=body,
    summary=summarize(body, title),
    quality="full" if len(body) >= 80 else "partial",
    canonical_url=final,
  )


def parse_url(url: str, *, prefer_session: bool = False) -> dict:
  platform = detect_platform(url)
  parsed = None
  errors: list[str] = []
  session_mode = "saved" if prefer_session else "anonymous"
  cookie = resolve_request_cookie(platform, prefer_session=prefer_session)
  token = _active_cookie.set(cookie) if cookie else None

  try:
    if platform == "bilibili":
      parsed = parse_bilibili(url) or run_ytdlp(url, session_cookie=cookie, platform=platform)
    elif platform == "douyin":
      parsed = parse_douyin(url)
    elif platform == "wechat_mp":
      parsed = parse_wechat(url)
    elif platform == "zhihu":
      parsed = parse_zhihu(url)
    elif platform == "xhs":
      parsed = parse_xhs(url)
    else:
      parsed = parse_generic(url, platform)
  except (HTTPError, URLError, TimeoutError) as exc:
    errors.append(str(exc))
  except Exception as exc:  # noqa: BLE001
    errors.append(str(exc))
  finally:
    if token is not None:
      _active_cookie.reset(token)

  used_saved = bool(prefer_session and bool(cookie or has_saved_session(platform)))
  if parsed and (parsed.get("content_text") or parsed.get("title")):
    parsed["session_mode"] = session_mode
    parsed["used_saved_session"] = used_saved
    return parsed

  detail = "; ".join(errors) if errors else "no extractable content"
  if prefer_session and platform in SESSION_PLATFORMS and not has_saved_session(platform):
    detail = (
      "设置中已标记该平台为已连接，但本机解析器还没有可用会话 Cookie。"
      "请在设置页对该平台重新「连接」完成扫码，或把 Cookie 放到 tools/platform-parser/cookies.txt。"
    )
  elif platform == "zhihu":
    detail = (
      "知乎需要登录态才能抓取。请在本机设置 PLATFORM_COOKIE（浏览器里复制 Cookie），"
      "或把 Netscape 格式 cookies 放到 tools/platform-parser/cookies.txt 后重启解析器。"
    )
  elif platform == "douyin":
    if used_saved:
      detail = (
        "已使用本机抖音登录会话，但仍未能解析该视频。"
        "请确认链接可打开（完整 https://v.douyin.com/… 短链或 www.douyin.com/video/…），"
        "或在设置页「重新连接」抖音后再试。"
      )
    else:
      detail = (
        "抖音全文抓取常需登录 Cookie。请在设置页连接抖音，或导出 cookies 到 tools/platform-parser/cookies.txt；"
        "短链请用包含 https://v.douyin.com/ 的完整分享文案。"
      )
  return {
    "error": "parse_failed",
    "platform": platform,
    "detail": detail,
    "session_mode": session_mode,
    "used_saved_session": used_saved,
  }

class Handler(BaseHTTPRequestHandler):
  def _cors(self) -> None:
    self.send_header("Access-Control-Allow-Origin", "*")
    self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    self.send_header("Access-Control-Allow-Headers", "content-type")

  def _json(self, status: int, payload: dict) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    self.send_response(status)
    self._cors()
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(body)))
    self.end_headers()
    self.wfile.write(body)

  def _read_json(self) -> dict:
    length = int(self.headers.get("Content-Length") or 0)
    raw = self.rfile.read(length) if length else b"{}"
    return json.loads(raw.decode("utf-8"))

  def do_OPTIONS(self) -> None:  # noqa: N802
    self.send_response(204)
    self._cors()
    self.end_headers()

  def do_GET(self) -> None:  # noqa: N802
    path = self.path.split("?", 1)[0].rstrip("/") or "/"
    if path == "/health":
      self._json(200, {"ok": True})
      return
    if path == "/sessions":
      from session_store import (
        SUPPORTED_LOGIN_PLATFORMS,
        cookie_header_from_session,
        load_platform_session,
      )
      sessions = {
        code: bool(cookie_header_from_session(load_platform_session(code)))
        for code in sorted(SUPPORTED_LOGIN_PLATFORMS)
      }
      self._json(200, {"ok": True, "sessions": sessions})
      return
    if path.startswith("/login/"):
      login_id = path.split("/login/", 1)[1].strip()
      from login_flow import snapshot_job
      snap = snapshot_job(login_id)
      if not snap:
        self._json(404, {"error": "login_not_found"})
        return
      self._json(200, snap)
      return
    self._json(404, {"error": "not found"})

  def do_POST(self) -> None:  # noqa: N802
    path = self.path.split("?", 1)[0].rstrip("/") or "/"
    try:
      payload = self._read_json()
    except json.JSONDecodeError:
      self._json(400, {"error": "invalid json"})
      return

    if path == "/login":
      from login_flow import start_login
      platform = (payload.get("platform") or "").strip().lower()
      try:
        login_id = start_login(platform)
      except ValueError as exc:
        self._json(400, {"error": str(exc)})
        return
      except Exception as exc:  # noqa: BLE001
        self._json(500, {"error": str(exc)})
        return
      self._json(200, {"login_id": login_id})
      return

    if path == "/logout":
      from login_flow import logout_platform
      platform = (payload.get("platform") or "").strip().lower()
      try:
        logout_platform(platform)
      except ValueError as exc:
        self._json(400, {"error": str(exc)})
        return
      self._json(200, {"ok": True, "platform": platform})
      return

    if path != "/parse":
      self._json(404, {"error": "not found"})
      return
    url = (payload.get("url") or "").strip()
    if not url:
      self._json(400, {"error": "url required"})
      return
    prefer_session = bool(payload.get("use_saved_session"))
    parsed = parse_url(url, prefer_session=prefer_session)
    if parsed.get("error"):
      self._json(422, parsed)
      return
    self._json(200, parsed)

  def log_message(self, fmt: str, *args) -> None:  # noqa: A003
    sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main() -> None:
  server = ThreadingHTTPServer((HOST, PORT), Handler)
  print(f"platform-parser listening on http://{HOST}:{PORT}", flush=True)
  print("login: POST /login {platform:xhs|douyin} ; GET /login/:id ; POST /logout", flush=True)
  server.serve_forever()


if __name__ == "__main__":
  main()
