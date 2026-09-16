#!/usr/bin/env python3
from __future__ import annotations

import unittest
from unittest import mock

import server


class InlineImageExtractTests(unittest.TestCase):
  def test_extracts_ordered_unique_urls(self) -> None:
    html = """
      <div id="js_content">
        <p>一段</p>
        <img src="https://mmbiz.qpic.cn/a.jpg" />
        <img data-src="//mmbiz.qpic.cn/b.jpg" />
        <img src="https://mmbiz.qpic.cn/a.jpg" />
        <img data-original="https://mmbiz.qpic.cn/c.png" />
      </div>
    """
    urls = server.extract_media_urls_from_html(html, "https://mp.weixin.qq.com/s/x", limit=10)
    self.assertEqual(
      urls,
      [
        "https://mmbiz.qpic.cn/a.jpg",
        "https://mmbiz.qpic.cn/b.jpg",
        "https://mmbiz.qpic.cn/c.png",
      ],
    )

  def test_skips_data_uri_and_respects_limit(self) -> None:
    html = """
      <img src="data:image/png;base64,aaa" />
      <img src="https://cdn.example.com/1.jpg" />
      <img src="https://cdn.example.com/2.jpg" />
      <img src="https://cdn.example.com/3.jpg" />
    """
    urls = server.extract_media_urls_from_html(html, "https://example.com/", limit=2)
    self.assertEqual(urls, ["https://cdn.example.com/1.jpg", "https://cdn.example.com/2.jpg"])

  def test_parse_wechat_includes_media_urls(self) -> None:
    html = (
      "<html><head><title>测</title>"
      '<meta property="og:title" content="测文章" />'
      "</head><body>"
      '<div id="js_content"><p>正文足够长用来通过质量门槛的一段话。</p>'
      '<img src="https://mmbiz.qpic.cn/cover.jpg" />'
      "</div></body></html>"
    )
    with mock.patch.object(server, "fetch_html", return_value=("https://mp.weixin.qq.com/s/x", html)):
      parsed = server.parse_wechat("https://mp.weixin.qq.com/s/x")
    self.assertIsNotNone(parsed)
    self.assertEqual(parsed["media_urls"], ["https://mmbiz.qpic.cn/cover.jpg"])


if __name__ == "__main__":
  unittest.main()
