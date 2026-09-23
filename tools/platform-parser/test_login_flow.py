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
      login_flow.start_login("wechat_mp")

  def test_zhihu_and_bilibili_success_cookies(self) -> None:
    self.assertTrue(login_flow.has_success_cookies("zhihu", [{"name": "z_c0", "value": "tok"}]))
    self.assertTrue(login_flow.has_success_cookies("bilibili", [{"name": "SESSDATA", "value": "s"}]))
    self.assertTrue(login_flow.has_success_cookies("bilibili", [{"name": "DedeUserID", "value": "1"}]))
    self.assertFalse(login_flow.has_success_cookies("zhihu", [{"name": "SESSDATA", "value": "s"}]))

  def test_platform_login_ready_rejects_guest_xhs_dom(self) -> None:
    page = mock.Mock()
    cookies = [{"name": "web_session", "value": "guest-session-token"}]
    captured: dict = {}
    with mock.patch.object(login_flow, "fetch_xhs_me", return_value={"guest": True}):
      with mock.patch.object(login_flow, "xhs_state_logged_in", return_value=False):
        with mock.patch.object(login_flow, "login_page_visible", return_value=False):
          self.assertFalse(login_flow.platform_login_ready(page, "xhs", cookies, captured))

  def test_platform_login_ready_accepts_xhs_user_me(self) -> None:
    page = mock.Mock()
    cookies = [{"name": "web_session", "value": "real-session-token"}]
    captured: dict = {}
    with mock.patch.object(
      login_flow,
      "fetch_xhs_me",
      return_value={"guest": False, "nickname": "拾藏", "user_id": "1"},
    ):
      with mock.patch.object(login_flow, "login_page_visible", return_value=False):
        self.assertTrue(login_flow.platform_login_ready(page, "xhs", cookies, captured))
    self.assertTrue(captured.get("login_verified"))

  def test_platform_login_ready_rejects_zhihu_cookie_without_verified_flag(self) -> None:
    page = mock.Mock()
    cookies = [{"name": "z_c0", "value": "0123456789abcdef0123456789abcdef"}]
    with mock.patch.object(login_flow, "probe_browser_session", return_value=False):
      with mock.patch.object(login_flow, "login_page_visible", return_value=False):
        self.assertFalse(login_flow.platform_login_ready(page, "zhihu", cookies, {}))

  def test_platform_login_ready_accepts_zhihu_via_probe(self) -> None:
    page = mock.Mock()
    cookies = [{"name": "z_c0", "value": "0123456789abcdef0123456789abcdef"}]
    captured: dict = {}
    with mock.patch.object(login_flow, "probe_browser_session", return_value=True) as probe:
      self.assertTrue(login_flow.platform_login_ready(page, "zhihu", cookies, captured))
    probe.assert_called()

  def test_zhihu_weak_account_label_allowed(self) -> None:
    self.assertFalse(login_flow.weak_account_label("zhihu", "会话 abcdefghij"))
    self.assertTrue(login_flow.weak_account_label("zhihu", ""))
    # Cookie-derived labels are accepted once the session is API-verified.
    self.assertFalse(login_flow.weak_account_label("xhs", "会话 abcdefghij"))

  def test_start_login_accepts_zhihu_with_fake_runner(self) -> None:
    def fake_runner(platform: str, timeout_sec: float, on_authenticated=None):
      self.assertEqual(platform, "zhihu")
      result = {
        "cookies": "z_c0=ok",
        "account_display_name": "知乎用户",
        "ua": "UA",
      }
      if on_authenticated:
        on_authenticated(result)
      return result

    with mock.patch("login_flow.save_platform_session") as save:
      login_id = login_flow.start_login("zhihu", runner=fake_runner, timeout_sec=5)
      for _ in range(50):
        snap = login_flow.snapshot_job(login_id)
        if snap and snap["status"] != "pending":
          break
        time.sleep(0.05)
      snap = login_flow.snapshot_job(login_id)
      self.assertEqual(snap["status"], "success")
      self.assertEqual(snap["account_display_name"], "知乎用户")
      save.assert_called()

  def test_zhihu_uses_persistent_browser_profile(self) -> None:
    self.assertIn("zhihu", login_flow.PERSISTENT_BROWSER_PLATFORMS)
    self.assertNotIn("zhihu", login_flow.KEEP_BROWSER_OPEN_AFTER_LOGIN)
    self.assertNotIn("xhs", login_flow.PERSISTENT_BROWSER_PLATFORMS)


if __name__ == "__main__":
  unittest.main()
