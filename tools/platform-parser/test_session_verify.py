#!/usr/bin/env python3
from __future__ import annotations

import unittest
from unittest import mock

import session_verify


class SessionVerifyTests(unittest.TestCase):
  def test_zhihu_ok(self) -> None:
    with mock.patch.object(session_verify, "load_platform_session", return_value={"cookies": "z_c0=" + "x" * 20}):
      with mock.patch.object(session_verify, "cookie_header_from_session", return_value="z_c0=" + "x" * 20):
        with mock.patch.object(
          session_verify,
          "_get_json",
          return_value=({"id": "1", "name": "测", "url_token": "t"}, ""),
        ):
          result = session_verify.verify_saved_session("zhihu")
    self.assertTrue(result["ok"])
    self.assertEqual(result["account_display_name"], "测")

  def test_zhihu_invalid(self) -> None:
    # Anti-bot 403 with a real-looking z_c0 must soft-ok (do not wipe session).
    with mock.patch.object(session_verify, "load_platform_session", return_value={"cookies": "z_c0=" + "x" * 20}):
      with mock.patch.object(session_verify, "cookie_header_from_session", return_value="z_c0=" + "x" * 20):
        with mock.patch.object(session_verify, "_get_json", return_value=(None, "session_invalid")):
          result = session_verify.verify_saved_session("zhihu")
    self.assertTrue(result["ok"])
    self.assertEqual(result["detail"], "soft_ok_cookie_shape")

  def test_zhihu_missing_cookie_invalid(self) -> None:
    with mock.patch.object(session_verify, "load_platform_session", return_value={"cookies": "q_c1=abc"}):
      with mock.patch.object(session_verify, "cookie_header_from_session", return_value="q_c1=abc"):
        with mock.patch.object(session_verify, "_get_json", return_value=(None, "session_invalid")):
          result = session_verify.verify_saved_session("zhihu")
    self.assertFalse(result["ok"])
    self.assertEqual(result["detail"], "session_invalid")


if __name__ == "__main__":
  unittest.main()
