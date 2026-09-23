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
import base64

HOST = os.environ.get("PLATFORM_PARSER_HOST", "127.0.0.1").strip() or "127.0.0.1"
PORT = int(os.environ.get("PLATFORM_PARSER_PORT", "8787") or "8787")
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
SESSION_PLATFORMS = {"xhs", "douyin", "zhihu", "bilibili"}

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


def absolutize_cover(value: str, base_url: str = "") -> str:
  cover = clean_text(value)
  if not cover:
    return ""
  if cover.startswith("//"):
    return f"https:{cover}"
  if cover.startswith("http://") or cover.startswith("https://"):
    return cover
  if base_url:
    try:
      from urllib.parse import urljoin
      return urljoin(base_url, cover)
    except Exception:
      return ""
  return ""


INLINE_IMAGE_LIMIT = 10
_IMG_ATTR_RE = re.compile(
  r"""(?is)<img\b[^>]*?\b(?:src|data-src|data-original|data-actualsrc)=["']([^"']+)["']""",
)


def extract_media_urls_from_html(html: str, base_url: str = "", *, limit: int = INLINE_IMAGE_LIMIT) -> list[str]:
  """Ordered unique image URLs from body HTML (for preview + OCR)."""
  cap = max(1, int(limit or INLINE_IMAGE_LIMIT))
  out: list[str] = []
  seen: set[str] = set()
  for match in _IMG_ATTR_RE.finditer(str(html or "")):
    raw = clean_text(match.group(1))
    if not raw or raw.startswith("data:"):
      continue
    url = absolutize_cover(raw, base_url)
    if not url.startswith("http"):
      continue
    if url in seen:
      continue
    seen.add(url)
    out.append(url)
    if len(out) >= cap:
      break
  return out


def extract_og_cover(html: str, base_url: str = "") -> str:
  return absolutize_cover(meta_content(html, ["og:image", "twitter:image"]), base_url)


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
  cover_image_url: str = "",
  playback_mode: str | None = None,
  playback_url: str = "",
  quality: str = "partial",
  canonical_url: str = "",
  media_urls: list[str] | None = None,
) -> dict:
  content_text = clean_text(content_text)
  caption_text = clean_text(caption_text)
  title = clean_text(title)
  if not content_text:
    content_text = caption_text or title
  if not summary:
    summary = summarize(content_text, title)
  cover = clean_text(cover_image_url)
  if cover.startswith("//"):
    cover = f"https:{cover}"
  urls: list[str] = []
  seen: set[str] = set()
  for item in media_urls or []:
    url = clean_text(item)
    if not url or url in seen:
      continue
    seen.add(url)
    urls.append(url)
    if len(urls) >= INLINE_IMAGE_LIMIT:
      break
  return {
    "platform": platform,
    "title": title,
    "author_name": clean_text(author_name),
    "caption_text": caption_text,
    "content_text": content_text,
    "summary": summary,
    "subtitle_text": clean_text(subtitle_text),
    "cover_image_url": cover,
    "playback_mode": playback_mode,
    "playback_url": playback_url,
    "quality": quality,
    "canonical_url": canonical_url,
    "media_urls": urls,
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
  cover = clean_text(data.get("pic") or data.get("cover") or "")
  if cover.startswith("//"):
    cover = f"https:{cover}"
  return result(
    platform="bilibili",
    title=title,
    author_name=author,
    caption_text=desc,
    content_text=body,
    summary=summarize(desc, title) if desc else f"视频「{title}」已入库。源站未提供简介，可先播放观看。",
    cover_image_url=cover,
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
        completed = subprocess.run(cmd, capture_output=True, text=True, timeout=18, check=False)
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
      cover = clean_text(data.get("thumbnail") or "")
      if not cover:
        thumbs = data.get("thumbnails") or []
        if isinstance(thumbs, list) and thumbs:
          last = thumbs[-1] if isinstance(thumbs[-1], dict) else {}
          cover = clean_text(last.get("url") or "")
      if cover.startswith("//"):
        cover = f"https:{cover}"
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
        cover_image_url=cover,
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
  """Pull title/desc/author/cover from Douyin SSR JSON blobs when present."""
  out = {"title": "", "desc": "", "author": "", "cover": ""}
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
    cover = (
      node.get("origin_cover")
      or node.get("originCover")
      or node.get("cover")
      or node.get("dynamic_cover")
      or node.get("dynamicCover")
      or ""
    )
    if isinstance(cover, dict):
      url_list = cover.get("url_list") or cover.get("urlList") or []
      cover = url_list[0] if isinstance(url_list, list) and url_list else (cover.get("url") or "")
    if desc and len(str(desc)) > len(out["desc"]):
      out["desc"] = clean_text(str(desc))
    if title and len(str(title)) > len(out["title"]):
      out["title"] = clean_text(str(title))
    if author and not out["author"]:
      out["author"] = clean_text(str(author))
    if cover and not out["cover"]:
      out["cover"] = clean_text(str(cover))
    for value in node.values():
      if isinstance(value, (dict, list)):
        walk(value, depth + 1)

  for item in candidates:
    walk(item)
  return out


def parse_douyin(url: str) -> dict | None:
  final = url
  html = ""
  share_html = ""
  try:
    final, html = fetch_html(url, user_agent=MOBILE_UA)
  except Exception:
    html = ""
  video_id = extract_douyin_id(final) or extract_douyin_id(url)

  embedded = extract_douyin_embedded(html)
  title = embedded.get("title") or (extract_title(html) if html else "")
  desc = embedded.get("desc") or (meta_content(html, ["og:description", "description"]) if html else "")
  author = embedded.get("author") or ""
  cover = (
    absolutize_cover(embedded.get("cover") or "", final or url)
    or extract_og_cover(html, final or url)
  )

  if video_id and (not title or _looks_like_douyin_placeholder(title, desc)):
    try:
      share_url = f"https://www.iesdouyin.com/share/video/{video_id}/"
      _, share_html = fetch_html(share_url, user_agent=MOBILE_UA)
      share_embedded = extract_douyin_embedded(share_html)
      title = share_embedded.get("title") or extract_title(share_html) or title
      desc = share_embedded.get("desc") or meta_content(share_html, ["og:description", "description"]) or desc
      author = share_embedded.get("author") or author
      cover = (
        cover
        or absolutize_cover(share_embedded.get("cover") or "", final or url)
        or extract_og_cover(share_html, final or url)
      )
    except Exception:
      pass

  session_cookie = _active_cookie.get() or ""
  ytdlp = run_ytdlp(final or url, session_cookie=session_cookie, platform="douyin")
  if ytdlp and (ytdlp.get("content_text") or ytdlp.get("title")):
    if not _looks_like_douyin_placeholder(ytdlp.get("title") or "", ytdlp.get("content_text") or ""):
      if cover and not ytdlp.get("cover_image_url"):
        ytdlp = {**ytdlp, "cover_image_url": cover}
      return ytdlp

  if session_cookie:
    browser_parsed = parse_douyin_with_playwright(final or url)
    if browser_parsed:
      if cover and not browser_parsed.get("cover_image_url"):
        browser_parsed = {**browser_parsed, "cover_image_url": cover}
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
      cover_image_url=cover or extract_og_cover(html, final or url) or extract_og_cover(share_html, final or url),
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
      page.goto(url, wait_until="domcontentloaded", timeout=18_000)
      page.wait_for_timeout(1200)
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
    cover_image_url=(
      absolutize_cover(embedded.get("cover") or "", final or url)
      or extract_og_cover(html, final or url)
    ),
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


def zhihu_article_id(url: str) -> str:
  """Extract Zhihu column article id from common share URLs."""
  text = str(url or "").strip()
  for pattern in (
    r"zhuanlan\.zhihu\.com/p/(\d+)",
    r"(?:www\.)?zhihu\.com/p/(\d+)",
  ):
    match = re.search(pattern, text)
    if match:
      return match.group(1)
  return ""


def zhihu_question_id(url: str) -> str:
  match = re.search(r"(?:www\.)?zhihu\.com/question/(\d+)", str(url or ""))
  return match.group(1) if match else ""


def zhihu_answer_id(url: str) -> str:
  text = str(url or "")
  match = re.search(r"(?:www\.)?zhihu\.com/question/\d+/answer/(\d+)", text)
  if match:
    return match.group(1)
  match = re.search(r"(?:www\.)?zhihu\.com/answer/(\d+)", text)
  return match.group(1) if match else ""


def _zhihu_api_json(
  api_url: str,
  *,
  cookie: str,
  user_agent: str,
  referer: str,
) -> dict | None:
  req = Request(
    api_url,
    headers={
      "User-Agent": user_agent,
      "Cookie": cookie,
      "Accept": "application/json, text/plain, */*",
      "Referer": referer,
      "x-requested-with": "fetch",
    },
  )
  try:
    with OPENER.open(req, timeout=20) as response:
      raw = response.read().decode("utf-8", errors="replace")
    body = json.loads(raw)
  except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, OSError):
    return None
  return body if isinstance(body, dict) else None


def _zhihu_author_name(payload: dict | None) -> str:
  if not isinstance(payload, dict):
    return ""
  author = payload.get("author")
  if isinstance(author, dict):
    return clean_text(str(author.get("name") or ""))
  return ""


def _zhihu_result_from_html_fields(
  *,
  title: str,
  html_content: str,
  excerpt: str = "",
  author: str = "",
  canonical: str = "",
  cover: str = "",
) -> dict | None:
  text_body = html_to_text(html_content) if html_content else clean_text(excerpt)
  title = clean_text(title)
  if not title and not text_body:
    return None
  if title in {"知乎", "安全验证", "请先登录", "404 - 知乎"} and len(text_body) < 20:
    return None
  if "没有知识存在的荒原" in (title or ""):
    return None
  if text_body and len(text_body) < 280 and "中文互联网高质量的问答社区" in text_body:
    return None
  return result(
    platform="zhihu",
    title=title or "知乎内容",
    author_name=author,
    content_text=text_body,
    summary=summarize(text_body or excerpt, title),
    cover_image_url=absolutize_cover(cover, canonical) if cover else "",
    quality="full" if len(text_body) >= 80 else "partial",
    canonical_url=canonical or "",
    media_urls=extract_media_urls_from_html(html_content, canonical),
  )


def parse_zhihu_article_api(article_id: str, *, cookie: str, user_agent: str) -> dict | None:
  body = _zhihu_api_json(
    f"https://zhuanlan.zhihu.com/api/articles/{article_id}",
    cookie=cookie,
    user_agent=user_agent,
    referer=f"https://zhuanlan.zhihu.com/p/{article_id}",
  )
  if not body:
    return None
  return _zhihu_result_from_html_fields(
    title=str(body.get("title") or ""),
    html_content=str(body.get("content") or ""),
    excerpt=str(body.get("excerpt") or ""),
    author=_zhihu_author_name(body),
    canonical=str(body.get("url") or f"https://zhuanlan.zhihu.com/p/{article_id}").strip(),
    cover=str(body.get("image_url") or body.get("title_image") or "").strip(),
  )


def parse_zhihu_answer_api(answer_id: str, *, cookie: str, user_agent: str, question_id: str = "") -> dict | None:
  referer = (
    f"https://www.zhihu.com/question/{question_id}/answer/{answer_id}"
    if question_id
    else f"https://www.zhihu.com/answer/{answer_id}"
  )
  body = _zhihu_api_json(
    f"https://www.zhihu.com/api/v4/answers/{answer_id}?include=content,author,question,question.title,excerpt",
    cookie=cookie,
    user_agent=user_agent,
    referer=referer,
  )
  if not body:
    return None
  question = body.get("question") if isinstance(body.get("question"), dict) else {}
  title = clean_text(str(question.get("title") or "")) or f"知乎回答 {answer_id}"
  qid = str(question.get("id") or question_id or "").strip()
  canonical = (
    f"https://www.zhihu.com/question/{qid}/answer/{answer_id}"
    if qid
    else f"https://www.zhihu.com/answer/{answer_id}"
  )
  return _zhihu_result_from_html_fields(
    title=title,
    html_content=str(body.get("content") or ""),
    excerpt=str(body.get("excerpt") or ""),
    author=_zhihu_author_name(body),
    canonical=canonical,
  )


def parse_zhihu_question_api(question_id: str, *, cookie: str, user_agent: str) -> dict | None:
  """Question detail API is often 403; answers list still works and carries question title."""
  body = _zhihu_api_json(
    (
      f"https://www.zhihu.com/api/v4/questions/{question_id}/answers"
      "?include=data[*].is_normal,content,excerpt,author,question,question.title,voteup_count"
      "&limit=5&offset=0&sort_by=default"
    ),
    cookie=cookie,
    user_agent=user_agent,
    referer=f"https://www.zhihu.com/question/{question_id}",
  )
  if not body:
    return None
  answers = body.get("data")
  if not isinstance(answers, list) or not answers:
    return None

  title = ""
  chunks: list[str] = []
  authors: list[str] = []
  for idx, item in enumerate(answers[:5], start=1):
    if not isinstance(item, dict):
      continue
    if not title:
      question = item.get("question") if isinstance(item.get("question"), dict) else {}
      title = clean_text(str(question.get("title") or ""))
    author = _zhihu_author_name(item) or f"回答{idx}"
    authors.append(author)
    text = html_to_text(str(item.get("content") or "")) or clean_text(str(item.get("excerpt") or ""))
    if not text:
      continue
    chunks.append(f"【{author}】\n{text}")

  if not chunks:
    return None
  combined = "\n\n".join(chunks)
  author = authors[0] if len(authors) == 1 else ""
  return result(
    platform="zhihu",
    title=title or f"知乎问题 {question_id}",
    author_name=author,
    content_text=combined,
    summary=summarize(combined, title),
    cover_image_url="",
    quality="full" if len(combined) >= 80 else "partial",
    canonical_url=f"https://www.zhihu.com/question/{question_id}",
  )


def parse_zhihu_via_api(url: str, *, cookie: str = "", user_agent: str = UA) -> dict | None:
  """Fetch Zhihu content through first-party JSON APIs (works with saved session cookies)."""
  header = str(cookie or "").strip()
  if not header:
    return None

  article_id = zhihu_article_id(url)
  if article_id:
    return parse_zhihu_article_api(article_id, cookie=header, user_agent=user_agent)

  answer_id = zhihu_answer_id(url)
  question_id = zhihu_question_id(url)
  if answer_id:
    return parse_zhihu_answer_api(
      answer_id,
      cookie=header,
      user_agent=user_agent,
      question_id=question_id,
    )
  if question_id:
    return parse_zhihu_question_api(question_id, cookie=header, user_agent=user_agent)
  return None


def parse_zhihu(url: str) -> dict | None:
  cookie = _active_cookie.get() or COOKIE_ENV.strip()
  session = load_platform_session("zhihu") if cookie else None
  user_agent = UA
  if isinstance(session, dict) and str(session.get("ua") or "").strip():
    user_agent = str(session["ua"]).strip()

  if cookie:
    api_parsed = parse_zhihu_via_api(url, cookie=cookie, user_agent=user_agent)
    if api_parsed:
      return api_parsed

  html = ""
  final = url
  try:
    final, html = fetch_html(url, user_agent=user_agent)
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
  if (title in {"知乎", "安全验证", "请先登录", "404 - 知乎"} and len(body) < 20:
    return None
  if "没有知识存在的荒原" in (title or ""):
    return None
  if body and len(body) < 280 and "中文互联网高质量的问答社区" in body:
    return None

  return result(
    platform="zhihu",
    title=title or "知乎内容",
    content_text=body,
    summary=summarize(body or desc, title),
    cover_image_url=extract_og_cover(html, final),
    quality="full" if len(body) >= 80 else "partial",
    canonical_url=final,
    media_urls=extract_media_urls_from_html(html, final),
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
  body_html = ""
  match = re.search(r'(?is)id=["\']js_content["\'][^>]*>(.*?)</div>', html)
  if match:
    body_html = match.group(1)
    body = html_to_text(body_html)
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
    cover_image_url=extract_og_cover(html, final),
    quality="full" if len(body) >= 80 else "partial",
    canonical_url=final,
    media_urls=extract_media_urls_from_html(body_html or html, final),
  )


def parse_xhs(url: str) -> dict | None:
  try:
    final, html = fetch_html(url)
  except Exception:
    return None
  title = extract_title(html)
  desc = meta_content(html, ["og:description", "description"])
  body = desc
  cover = extract_og_cover(html, final)
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
          if not cover:
            image_list = note.get("imageList") or note.get("image_list") or []
            if isinstance(image_list, list) and image_list:
              first = image_list[0] if isinstance(image_list[0], dict) else {}
              info_list = first.get("infoList") if isinstance(first, dict) else None
              info_url = ""
              if isinstance(info_list, list) and info_list and isinstance(info_list[0], dict):
                info_url = info_list[0].get("url") or ""
              cover = absolutize_cover(
                first.get("urlDefault") or first.get("url") or info_url or "",
                final,
              )
          break
  if not (title or body):
    return None
  return result(
    platform="xhs",
    title=title or "小红书笔记",
    content_text=body or title,
    summary=summarize(body, title),
    cover_image_url=cover,
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
    cover_image_url=extract_og_cover(html, final),
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
    from medicrawler_adapter import try_medicrawler_parse

    mc_parsed = try_medicrawler_parse(url, platform, cookie=cookie)
    if mc_parsed and (mc_parsed.get("content_text") or mc_parsed.get("title")):
      used_saved = bool(prefer_session and bool(cookie or has_saved_session(platform)))
      mc_parsed["session_mode"] = session_mode
      mc_parsed["used_saved_session"] = used_saved
      return mc_parsed
  except Exception as exc:  # noqa: BLE001
    errors.append(f"mediacrawler: {exc}")

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
    if used_saved:
      detail = (
        "已使用本机知乎登录会话，但仍未能解析该链接。"
        "请确认链接为专栏（zhuanlan.zhihu.com/p/…）、问题或回答（zhihu.com/question/…），"
        "或在设置页「重新连接」知乎后再试。"
      )
    else:
      detail = (
        "知乎需要登录态才能抓取。请在设置页连接知乎完成本机扫码登录后重试；"
        "也可临时设置 PLATFORM_COOKIE 或把 Netscape cookies 放到 tools/platform-parser/cookies.txt。"
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
      from office_convert import resolve_soffice
      ppt = Path("/Applications/Microsoft PowerPoint.app").is_dir()
      excel = Path("/Applications/Microsoft Excel.app").is_dir()
      from medicrawler_adapter import medicrawler_status
      self._json(200, {
        "ok": True,
        "office_convert": bool(resolve_soffice() or ppt or excel),
        "powerpoint": ppt,
        "excel": excel,
        "libreoffice": bool(resolve_soffice()),
        "mediacrawler": medicrawler_status(),
      })
      return
    if path == "/sessions":
      from session_store import (
        SUPPORTED_LOGIN_PLATFORMS,
        cookie_header_from_session,
        load_platform_session,
      )
      from session_verify import verify_saved_session
      sessions = {
        code: bool(cookie_header_from_session(load_platform_session(code)))
        for code in sorted(SUPPORTED_LOGIN_PLATFORMS)
      }
      verified: dict[str, bool] = {}
      accounts: dict[str, str] = {}
      details: dict[str, str] = {}
      for code, present in sessions.items():
        if not present:
          verified[code] = False
          accounts[code] = ""
          details[code] = "no_local_session"
          continue
        result = verify_saved_session(code)
        verified[code] = bool(result.get("ok"))
        accounts[code] = str(result.get("account_display_name") or "")
        details[code] = str(result.get("detail") or "")
      self._json(200, {
        "ok": True,
        "sessions": sessions,
        "verified": verified,
        "accounts": accounts,
        "details": details,
      })
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

    if path.startswith("/login/") and path.endswith("/sms/resend"):
      from login_flow import request_login_sms_resend
      login_id = path[len("/login/"):-len("/sms/resend")].strip("/")
      try:
        request_login_sms_resend(login_id)
      except ValueError as exc:
        self._json(400, {"error": str(exc)})
        return
      self._json(200, {"ok": True, "login_id": login_id})
      return

    if path.startswith("/login/") and path.endswith("/sms"):
      from login_flow import submit_login_sms
      login_id = path[len("/login/"):-len("/sms")].strip("/")
      code = str(payload.get("code") or payload.get("sms_code") or "").strip()
      try:
        submit_login_sms(login_id, code)
      except ValueError as exc:
        self._json(400, {"error": str(exc)})
        return
      self._json(200, {"ok": True, "login_id": login_id})
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

    if path == "/sessions/import":
      from session_store import clear_platform_session, import_platform_cookies, save_platform_session
      from session_verify import verify_saved_session
      platform = (payload.get("platform") or "").strip().lower()
      cookies = str(payload.get("cookies") or payload.get("cookie") or "").strip()
      account = str(payload.get("account_display_name") or "").strip()
      try:
        saved = import_platform_cookies(platform, cookies, account_display_name=account)
      except ValueError as exc:
        self._json(400, {"error": str(exc)})
        return
      check = verify_saved_session(platform)
      if not check.get("ok"):
        clear_platform_session(platform)
        detail = check.get("detail") or "session_invalid"
        self._json(400, {
          "error": "Cookie 无效或已过期，请重新从已登录的浏览器复制",
          "detail": detail,
        })
        return
      name = check.get("account_display_name") or saved.get("account_display_name") or ""
      if name and name != saved.get("account_display_name"):
        saved["account_display_name"] = name
        save_platform_session(platform, saved)
      self._json(200, {
        "ok": True,
        "platform": platform,
        "account_display_name": name,
        "verified": True,
      })
      return

    if path == "/convert-office":
      from office_convert import convert_office_to_pdf
      filename = str(payload.get("filename") or payload.get("file_name") or "document.bin")
      b64 = str(payload.get("content_base64") or "").strip()
      if not b64:
        self._json(400, {"error": "content_base64 required"})
        return
      try:
        raw = base64.b64decode(b64, validate=False)
        pdf = convert_office_to_pdf(filename, raw)
      except ValueError as exc:
        self._json(400, {"error": str(exc)})
        return
      except RuntimeError as exc:
        self._json(503, {"error": str(exc)})
        return
      except Exception as exc:  # noqa: BLE001
        self._json(500, {"error": str(exc)})
        return
      self._json(200, {
        "ok": True,
        "filename": Path(filename).with_suffix(".pdf").name,
        "content_base64": base64.b64encode(pdf).decode("ascii"),
        "byte_length": len(pdf),
      })
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
  print("login: POST /login {platform:xhs|douyin|zhihu|bilibili} ; GET /login/:id ; POST /logout", flush=True)
  print("office: POST /convert-office {filename, content_base64}", flush=True)
  server.serve_forever()


if __name__ == "__main__":
  main()
