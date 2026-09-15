from __future__ import annotations

import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

import login_flow


class LoginFlowTests(unittest.TestCase):
  def setUp(self) -> None:
    self._tmp = tempfile.TemporaryDirectory()
    self.root = Path(self._tmp.name)
    self.addCleanup(self._tmp.cleanup)
    login_flow._jobs.clear()

  def test_cookies_to_header_and_success_detection(self) -> None:
    cookies = [
      {"name": "web_session", "value": "abc"},
      {"name": "a1", "value": "1"},
    ]
    self.assertTrue(login_flow.has_success_cookies("xhs", cookies))
    self.assertFalse(login_flow.has_success_cookies("douyin", cookies))
    self.assertEqual(login_flow.cookies_to_header(cookies), "web_session=abc; a1=1")

  def test_start_login_success_path_with_fake_runner(self) -> None:
    def fake_runner(platform: str, timeout_sec: float):
      self.assertEqual(platform, "xhs")
      return {
        "cookies": "web_session=ok",
        "account_display_name": "测试号",
        "ua": "UA",
      }

    with mock.patch("login_flow.save_platform_session") as save:
      login_id = login_flow.start_login("xhs", runner=fake_runner, timeout_sec=5)
      for _ in range(50):
        snap = login_flow.snapshot_job(login_id)
        if snap and snap["status"] != "pending":
          break
        time.sleep(0.05)
      self.assertEqual(snap["status"], "success")
      self.assertEqual(snap["account_display_name"], "测试号")
      self.assertIn("web_session=ok", snap["session_payload"])
      # payload only once
      again = login_flow.snapshot_job(login_id)
      self.assertIsNone(again["session_payload"])
      save.assert_called_once()

  def test_guess_account_name_from_cookies(self) -> None:
    cookies = [
      {"name": "web_session", "value": "abc"},
      {"name": "nickname", "value": "知夏"},
    ]
    self.assertEqual(login_flow.guess_account_name(cookies), "知夏")
    self.assertEqual(
      login_flow.resolve_account_display_name(cookies),
      "知夏",
    )

  def test_normalize_display_name_filters_noise(self) -> None:
    self.assertEqual(login_flow.normalize_display_name(" 拾藏 "), "拾藏")
    self.assertEqual(login_flow.normalize_display_name("登录"), "")
    self.assertEqual(login_flow.normalize_display_name("小红书账号"), "")

  def test_account_id_and_cookie_fallback(self) -> None:
    self.assertEqual(
      login_flow.account_id_from_mapping({"red_id": "123456"}),
      "小红书号 123456",
    )
    self.assertEqual(
      login_flow.account_id_from_mapping({"unique_id": "refind_dy"}),
      "抖音号 refind_dy",
    )
    cookies = [{"name": "uid_tt", "value": "abcdef1234567890"}]
    self.assertEqual(login_flow.account_label_from_cookies("douyin", cookies), "UID abcdef123456")
    self.assertEqual(
      login_flow.resolve_account_label("douyin", cookies, nickname="", account_id=""),
      "UID abcdef123456",
    )
    self.assertEqual(
      login_flow.resolve_account_label("douyin", cookies, nickname="知夏", account_id="抖音号 x"),
      "知夏",
    )

  def test_start_login_rejects_unsupported_platform(self) -> None:
    with self.assertRaises(ValueError):
      login_flow.start_login("zhihu")


if __name__ == "__main__":
  unittest.main()
