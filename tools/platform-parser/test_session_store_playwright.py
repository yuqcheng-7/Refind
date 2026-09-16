from __future__ import annotations

import unittest

from session_store import playwright_cookies_from_session


class PlaywrightCookieTests(unittest.TestCase):
  def test_zhihu_duplicates_host_only_auth_cookies(self) -> None:
    payload = {
      "cookie_items": [
        {
          "name": "q_c1",
          "value": "abc",
          "domain": "www.zhihu.com",
          "path": "/",
          "expires": 1234567890,
        },
        {
          "name": "z_c0",
          "value": "token",
          "domain": ".zhihu.com",
          "path": "/",
          "httpOnly": True,
          "secure": True,
          "sameSite": "Lax",
        },
      ],
    }
    cookies = playwright_cookies_from_session(payload, "zhihu")
    domains = {(item["name"], item["domain"]) for item in cookies}
    self.assertIn(("q_c1", "www.zhihu.com"), domains)
    self.assertIn(("q_c1", ".zhihu.com"), domains)
    zc0 = next(item for item in cookies if item["name"] == "z_c0")
    self.assertTrue(zc0.get("httpOnly"))
    self.assertTrue(zc0.get("secure"))
    self.assertEqual(zc0.get("sameSite"), "Lax")


if __name__ == "__main__":
  unittest.main()
