"""Map MediaCrawler capture payloads to Refind prefetch JSON."""

from __future__ import annotations

import re
from typing import Any

from .platform_map import mc_platform_to_refind


def clean_text(value: Any) -> str:
  text = re.sub(r"\s+", " ", str(value or "")).strip()
  return text


def format_comments(comments: list[Any], *, limit: int = 30) -> str:
  lines: list[str] = []
  for index, item in enumerate(comments[:limit], start=1):
    if not isinstance(item, dict):
      continue
    body = clean_text(
      item.get("content")
      or item.get("text")
      or ((item.get("content") or {}).get("message") if isinstance(item.get("content"), dict) else "")
    )
    if not body:
      continue
    nickname = clean_text(item.get("nickname") or (item.get("user_info") or {}).get("nickname") or "")
    prefix = f"{nickname}: " if nickname else ""
    lines.append(f"{index}. {prefix}{body}")
  return "\n".join(lines)


def append_stats_footer(content: str, stats: dict[str, Any]) -> str:
  pairs = [(key, value) for key, value in stats.items() if clean_text(value)]
  if not pairs:
    return content
  footer = " | ".join(f"{key}: {value}" for key, value in pairs)
  if not content:
    return footer
  return f"{content}\n\n---\n{footer}"


def normalize_capture(
  *,
  mc_platform: str,
  capture: dict[str, Any],
  canonical_url: str,
) -> dict[str, Any] | None:
  refind_platform = mc_platform_to_refind(mc_platform)
  if mc_platform == "xhs":
    return _normalize_xhs(capture, refind_platform, canonical_url)
  if mc_platform == "dy":
    return _normalize_douyin(capture, refind_platform, canonical_url)
  if mc_platform == "bili":
    return _normalize_bilibili(capture, refind_platform, canonical_url)
  if mc_platform == "zhihu":
    return _normalize_zhihu(capture, refind_platform, canonical_url)
  return None


def _normalize_xhs(capture: dict[str, Any], platform: str, canonical_url: str) -> dict[str, Any] | None:
  note = capture.get("content")
  if not isinstance(note, dict):
    return None
  title = clean_text(note.get("title") or note.get("desc") or "小红书笔记")
  body = clean_text(note.get("desc") or note.get("title") or "")
  user = note.get("user") or {}
  interact = note.get("interact_info") or {}
  image_list = note.get("image_list") or []
  cover = ""
  if isinstance(image_list, list) and image_list and isinstance(image_list[0], dict):
    cover = clean_text(image_list[0].get("url_default") or image_list[0].get("url") or "")
  tags = [
    clean_text(tag.get("name"))
    for tag in (note.get("tag_list") or [])
    if isinstance(tag, dict) and clean_text(tag.get("name"))
  ]
  stats = {
    "点赞": interact.get("liked_count"),
    "收藏": interact.get("collected_count"),
    "评论": interact.get("comment_count"),
  }
  if tags:
    stats["标签"] = ", ".join(tags)
  content_text = append_stats_footer(body, stats)
  comments_text = format_comments(capture.get("comments") or [])
  playback_url = ""
  playback_mode = None
  if note.get("type") == "video":
    from store.xhs import get_video_url_arr

    videos = get_video_url_arr(note)
    if videos:
      playback_url = clean_text(videos[0])
      playback_mode = "external_url"
  quality = "full" if len(body) >= 40 or comments_text else "partial"
  return _result(
    platform=platform,
    title=title,
    author_name=clean_text(user.get("nickname") or ""),
    content_text=content_text or title,
    caption_text=body,
    subtitle_text=comments_text,
    cover_image_url=cover,
    playback_mode=playback_mode,
    playback_url=playback_url,
    quality=quality,
    canonical_url=canonical_url,
    media_urls=list(dict.fromkeys(capture.get("media_urls") or [])),
    parse_engine="mediacrawler",
  )


def _normalize_douyin(capture: dict[str, Any], platform: str, canonical_url: str) -> dict[str, Any] | None:
  aweme = capture.get("content")
  if not isinstance(aweme, dict):
    return None
  author = aweme.get("author") or {}
  stats_raw = aweme.get("statistics") or {}
  body = clean_text(aweme.get("desc") or "")
  title = body[:80] or "抖音视频"
  stats = {
    "点赞": stats_raw.get("digg_count"),
    "评论": stats_raw.get("comment_count"),
    "收藏": stats_raw.get("collect_count"),
  }
  content_text = append_stats_footer(body, stats)
  comments_text = format_comments(capture.get("comments") or [])
  video = aweme.get("video") or {}
  play_addr = video.get("play_addr") or {}
  playback_url = ""
  url_list = play_addr.get("url_list") or []
  if url_list:
    playback_url = clean_text(url_list[0])
  cover = ""
  cover_obj = aweme.get("video") or {}
  cover_info = cover_obj.get("cover") or {}
  cover_urls = cover_info.get("url_list") or []
  if cover_urls:
    cover = clean_text(cover_urls[0])
  quality = "full" if body or comments_text else "partial"
  return _result(
    platform=platform,
    title=title,
    author_name=clean_text(author.get("nickname") or ""),
    content_text=content_text or title,
    caption_text=body,
    subtitle_text=comments_text,
    cover_image_url=cover,
    playback_mode="external_url" if playback_url else None,
    playback_url=playback_url,
    quality=quality,
    canonical_url=canonical_url,
    media_urls=list(dict.fromkeys(capture.get("media_urls") or [])),
    parse_engine="mediacrawler",
  )


def _normalize_bilibili(capture: dict[str, Any], platform: str, canonical_url: str) -> dict[str, Any] | None:
  payload = capture.get("content")
  if not isinstance(payload, dict):
    return None
  view = payload.get("View") or {}
  if not view:
    return None
  owner = view.get("owner") or {}
  stat = view.get("stat") or {}
  title = clean_text(view.get("title") or "B站视频")
  body = clean_text(view.get("desc") or "")
  stats = {
    "播放": stat.get("view"),
    "点赞": stat.get("like"),
    "投币": stat.get("coin"),
    "收藏": stat.get("favorite"),
    "评论": stat.get("reply"),
  }
  content_text = append_stats_footer(body or title, stats)
  comments_text = format_comments(capture.get("comments") or [])
  bvid = clean_text(view.get("bvid") or "")
  playback_url = f"https://player.bilibili.com/player.html?bvid={bvid}&page=1" if bvid else canonical_url
  quality = "full" if body or comments_text else "partial"
  return _result(
    platform=platform,
    title=title,
    author_name=clean_text(owner.get("name") or ""),
    content_text=content_text,
    caption_text=body,
    subtitle_text=comments_text,
    cover_image_url=clean_text(view.get("pic") or ""),
    playback_mode="embed",
    playback_url=playback_url,
    quality=quality,
    canonical_url=canonical_url,
    media_urls=list(dict.fromkeys(capture.get("media_urls") or [])),
    parse_engine="mediacrawler",
  )


def _normalize_zhihu(capture: dict[str, Any], platform: str, canonical_url: str) -> dict[str, Any] | None:
  content = capture.get("content")
  if not isinstance(content, dict):
    return None
  title = clean_text(content.get("title") or content.get("question_title") or "知乎内容")
  body = clean_text(content.get("content_text") or content.get("desc") or content.get("content") or "")
  author = clean_text(content.get("user_nickname") or content.get("author_name") or "")
  stats = {
    "点赞": content.get("voteup_count") or content.get("liked_count"),
    "评论": content.get("comment_count"),
  }
  content_text = append_stats_footer(body or title, stats)
  comments_text = format_comments(capture.get("comments") or [])
  quality = "full" if len(body) >= 40 or comments_text else "partial"
  return _result(
    platform=platform,
    title=title,
    author_name=author,
    content_text=content_text or title,
    caption_text=body,
    subtitle_text=comments_text,
    cover_image_url=clean_text(content.get("cover_url") or content.get("image_url") or ""),
    quality=quality,
    canonical_url=canonical_url,
    media_urls=list(dict.fromkeys(capture.get("media_urls") or [])),
    parse_engine="mediacrawler",
  )


def _result(**kwargs: Any) -> dict[str, Any]:
  summary_source = clean_text(kwargs.get("content_text") or kwargs.get("title") or "")
  summary = summary_source[:140] + ("…" if len(summary_source) > 140 else "")
  payload = {
    "platform": kwargs.get("platform"),
    "title": clean_text(kwargs.get("title") or ""),
    "author_name": clean_text(kwargs.get("author_name") or ""),
    "caption_text": clean_text(kwargs.get("caption_text") or ""),
    "content_text": clean_text(kwargs.get("content_text") or ""),
    "summary": summary,
    "subtitle_text": clean_text(kwargs.get("subtitle_text") or ""),
    "cover_image_url": clean_text(kwargs.get("cover_image_url") or ""),
    "playback_mode": kwargs.get("playback_mode"),
    "playback_url": clean_text(kwargs.get("playback_url") or ""),
    "quality": kwargs.get("quality") or "partial",
    "canonical_url": clean_text(kwargs.get("canonical_url") or ""),
    "parse_engine": kwargs.get("parse_engine") or "mediacrawler",
    "media_urls": kwargs.get("media_urls") or [],
  }
  return payload
