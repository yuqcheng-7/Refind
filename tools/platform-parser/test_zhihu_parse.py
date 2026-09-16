from __future__ import annotations

import json
import unittest
from unittest import mock

import server


class ZhihuParseTests(unittest.TestCase):
  def test_zhihu_ids(self) -> None:
    self.assertEqual(
      server.zhihu_article_id("https://zhuanlan.zhihu.com/p/163125365"),
      "163125365",
    )
    self.assertEqual(server.zhihu_article_id("https://www.zhihu.com/question/1"), "")
    self.assertEqual(server.zhihu_question_id("https://www.zhihu.com/question/19550225"), "19550225")
    self.assertEqual(
      server.zhihu_answer_id("https://www.zhihu.com/question/19550225/answer/1994097885189521699"),
      "1994097885189521699",
    )

  def test_parse_zhihu_via_api_article(self) -> None:
    payload = {
      "title": "测试文章",
      "content": "<p>正文内容足够长" + ("x" * 80) + "</p>",
      "excerpt": "摘要",
      "url": "https://zhuanlan.zhihu.com/p/163125365",
      "author": {"name": "作者A"},
    }

    class FakeResponse:
      def __enter__(self):
        return self

      def __exit__(self, *args):
        return False

      def read(self):
        return json.dumps(payload).encode("utf-8")

    with mock.patch.object(server.OPENER, "open", return_value=FakeResponse()):
      parsed = server.parse_zhihu_via_api(
        "https://zhuanlan.zhihu.com/p/163125365",
        cookie="z_c0=" + "a" * 20,
      )
    self.assertIsNotNone(parsed)
    assert parsed is not None
    self.assertEqual(parsed["title"], "测试文章")
    self.assertIn("正文内容", parsed["content_text"])
    self.assertEqual(parsed["author_name"], "作者A")
    self.assertEqual(parsed["quality"], "full")

  def test_parse_zhihu_question_api(self) -> None:
    payload = {
      "data": [
        {
          "content": "<p>回答内容足够长" + ("y" * 80) + "</p>",
          "author": {"name": "答主甲"},
          "question": {"id": "19550225", "title": "如何正确使用知乎？"},
        }
      ]
    }

    class FakeResponse:
      def __enter__(self):
        return self

      def __exit__(self, *args):
        return False

      def read(self):
        return json.dumps(payload).encode("utf-8")

    with mock.patch.object(server.OPENER, "open", return_value=FakeResponse()):
      parsed = server.parse_zhihu_via_api(
        "https://www.zhihu.com/question/19550225",
        cookie="z_c0=" + "a" * 20,
      )
    self.assertIsNotNone(parsed)
    assert parsed is not None
    self.assertEqual(parsed["title"], "如何正确使用知乎？")
    self.assertIn("回答内容", parsed["content_text"])
    self.assertIn("答主甲", parsed["content_text"])

  def test_parse_zhihu_answer_api(self) -> None:
    payload = {
      "content": "<p>单条回答足够长" + ("z" * 80) + "</p>",
      "author": {"name": "答主乙"},
      "question": {"id": "19550225", "title": "如何正确使用知乎？"},
    }

    class FakeResponse:
      def __enter__(self):
        return self

      def __exit__(self, *args):
        return False

      def read(self):
        return json.dumps(payload).encode("utf-8")

    with mock.patch.object(server.OPENER, "open", return_value=FakeResponse()):
      parsed = server.parse_zhihu_via_api(
        "https://www.zhihu.com/question/19550225/answer/1994097885189521699",
        cookie="z_c0=" + "a" * 20,
      )
    self.assertIsNotNone(parsed)
    assert parsed is not None
    self.assertEqual(parsed["title"], "如何正确使用知乎？")
    self.assertEqual(parsed["author_name"], "答主乙")
    self.assertIn("单条回答", parsed["content_text"])

  def test_parse_zhihu_prefers_api_when_cookie_present(self) -> None:
    api_result = server.result(
      platform="zhihu",
      title="API",
      content_text="content" * 20,
      summary="summary",
      quality="full",
      canonical_url="https://zhuanlan.zhihu.com/p/1",
    )
    token = server._active_cookie.set("z_c0=" + "a" * 20)
    try:
      with mock.patch.object(server, "parse_zhihu_via_api", return_value=api_result) as api_mock:
        parsed = server.parse_zhihu("https://zhuanlan.zhihu.com/p/163125365")
      api_mock.assert_called_once()
      self.assertEqual(parsed["title"], "API")
    finally:
      server._active_cookie.reset(token)


if __name__ == "__main__":
  unittest.main()
