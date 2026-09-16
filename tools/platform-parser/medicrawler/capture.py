"""In-memory capture hooks for MediaCrawler store modules."""

from __future__ import annotations

from typing import Any


def empty_capture() -> dict[str, Any]:
  return {"content": None, "comments": [], "media_urls": []}


def _append_comment(capture: dict[str, Any], item: Any) -> None:
  if item is None:
    return
  if hasattr(item, "model_dump"):
    capture["comments"].append(item.model_dump())
  elif isinstance(item, dict):
    capture["comments"].append(item)
  else:
    capture["comments"].append({"content": str(item)})


def install_capture_hooks(mc_platform: str, capture: dict[str, Any]) -> None:
  code = str(mc_platform or "").strip().lower()

  if code == "xhs":
    import store.xhs as mod

    async def capture_note(note_item: dict) -> None:
      capture["content"] = note_item
      image_list = note_item.get("image_list") or []
      for img in image_list:
        if not isinstance(img, dict):
          continue
        url = img.get("url") or img.get("url_default") or ""
        if url:
          capture["media_urls"].append(url)

    async def capture_comments(_note_id: str, comments: list) -> None:
      for item in comments or []:
        _append_comment(capture, item)

    mod.update_xhs_note = capture_note
    mod.batch_update_xhs_note_comments = capture_comments
    mod.update_xhs_note_image = lambda *_args, **_kwargs: None
    mod.update_xhs_note_video = lambda *_args, **_kwargs: None
    return

  if code == "dy":
    import store.douyin as mod

    async def capture_aweme(aweme_item: dict) -> None:
      capture["content"] = aweme_item
      for url in _douyin_media_urls(aweme_item):
        capture["media_urls"].append(url)

    async def capture_comments(_aweme_id: str, comments: list) -> None:
      for item in comments or []:
        _append_comment(capture, item)

    mod.update_douyin_aweme = capture_aweme
    mod.batch_update_dy_aweme_comments = capture_comments
    mod.update_dy_aweme_image = lambda *_args, **_kwargs: None
    mod.update_dy_aweme_video = lambda *_args, **_kwargs: None
    return

  if code == "bili":
    import store.bilibili as mod

    async def capture_video(video_item: dict) -> None:
      capture["content"] = video_item
      view = (video_item or {}).get("View") or {}
      pic = view.get("pic") or ""
      if pic:
        capture["media_urls"].append(pic)

    async def capture_comments(_video_id: str, comments: list) -> None:
      for item in comments or []:
        _append_comment(capture, item)

    mod.update_bilibili_video = capture_video
    mod.batch_update_bilibili_video_comments = capture_comments
    mod.update_up_info = lambda *_args, **_kwargs: None
    return

  if code == "zhihu":
    import store.zhihu as mod

    async def capture_content(content_item) -> None:
      capture["content"] = content_item.model_dump() if hasattr(content_item, "model_dump") else content_item

    async def capture_comments(comments: list) -> None:
      for item in comments or []:
        _append_comment(capture, item)

    mod.update_zhihu_content = capture_content
    mod.batch_update_zhihu_note_comments = capture_comments
    return

  raise ValueError(f"unsupported MediaCrawler platform: {mc_platform}")


def _douyin_media_urls(aweme_item: dict) -> list[str]:
  urls: list[str] = []
  images = aweme_item.get("images") or []
  if isinstance(images, list):
    for image in images:
      if not isinstance(image, dict):
        continue
      for candidate in (image.get("url_list") or []):
        if candidate:
          urls.append(str(candidate))
          break
  video = aweme_item.get("video") or {}
  play_addr = video.get("play_addr") or {}
  for candidate in (play_addr.get("url_list") or []):
    if candidate:
      urls.append(str(candidate))
      break
  return urls
