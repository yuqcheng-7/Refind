from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from session_store import (
  clear_platform_session,
  cookie_header_from_session,
  load_platform_session,
  save_platform_session,
  sessions_dir,
  write_netscape_cookie_file,
)


class SessionStoreTests(unittest.TestCase):
  def setUp(self) -> None:
    self._tmp = tempfile.TemporaryDirectory()
    self.root = Path(self._tmp.name)
    self.addCleanup(self._tmp.cleanup)

  def test_save_load_clear_roundtrip(self) -> None:
    payload = {
      "cookies": "a=1; b=2",
      "ua": "TestUA",
      "captured_at": "2026-09-15T00:00:00.000Z",
      "account_display_name": "知夏",
    }
    path = save_platform_session("xhs", payload, root=self.root)
    self.assertTrue(path.is_file())
    self.assertEqual(load_platform_session("xhs", root=self.root), payload)
    clear_platform_session("xhs", root=self.root)
    self.assertIsNone(load_platform_session("xhs", root=self.root))

  def test_cookie_header_from_session(self) -> None:
    self.assertEqual(cookie_header_from_session({"cookies": " a=1; b=2 "}), "a=1; b=2")
    self.assertEqual(cookie_header_from_session({}), "")
    self.assertEqual(cookie_header_from_session(None), "")

  def test_write_netscape_cookie_file(self) -> None:
    path = self.root / "cookies.txt"
    write_netscape_cookie_file("sessionid=abc; uid_tt=1", path, domain=".douyin.com")
    text = path.read_text(encoding="utf-8")
    self.assertIn("sessionid\tabc", text)
    self.assertIn(".douyin.com", text)


if __name__ == "__main__":
  unittest.main()
