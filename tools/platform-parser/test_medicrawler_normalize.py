#!/usr/bin/env python3

import unittest

from medicrawler.normalize import format_comments, normalize_capture


class MedicrawlerNormalizeTest(unittest.TestCase):
  def test_xhs_note_with_comments(self) -> None:
    capture = {
      "content": {
        "note_id": "abc",
        "type": "normal",
        "title": "测试标题",
        "desc": "正文内容足够长" * 5,
        "user": {"nickname": "作者A"},
        "interact_info": {"liked_count": "10", "collected_count": "2", "comment_count": "1"},
        "tag_list": [{"type": "topic", "name": "Python"}],
        "image_list": [{"url_default": "https://example.com/cover.jpg"}],
      },
      "comments": [{"content": "第一条评论", "user_info": {"nickname": "读者"}}],
      "media_urls": ["https://example.com/cover.jpg"],
    }
    payload = normalize_capture(mc_platform="xhs", capture=capture, canonical_url="https://xhs/link")
    self.assertIsNotNone(payload)
    assert payload is not None
    self.assertEqual(payload["platform"], "xhs")
    self.assertEqual(payload["title"], "测试标题")
    self.assertIn("正文内容足够长", payload["content_text"])
    self.assertIn("Python", payload["content_text"])
    self.assertIn("第一条评论", payload["subtitle_text"])
    self.assertEqual(payload["parse_engine"], "mediacrawler")

  def test_douyin_aweme(self) -> None:
    capture = {
      "content": {
        "desc": "抖音描述",
        "author": {"nickname": "达人"},
        "statistics": {"digg_count": 100, "comment_count": 5, "collect_count": 1},
        "video": {"play_addr": {"url_list": ["https://example.com/video.mp4"]}, "cover": {"url_list": []}},
      },
      "comments": [],
      "media_urls": [],
    }
    payload = normalize_capture(mc_platform="dy", capture=capture, canonical_url="https://douyin/video/1")
    self.assertIsNotNone(payload)
    assert payload is not None
    self.assertEqual(payload["platform"], "douyin")
    self.assertEqual(payload["playback_mode"], "external_url")

  def test_format_comments_skips_empty(self) -> None:
    text = format_comments([{"content": "好"}, {"content": ""}, {"content": "赞"}])
    self.assertEqual(text.count("\n"), 1)


if __name__ == "__main__":
  unittest.main()
