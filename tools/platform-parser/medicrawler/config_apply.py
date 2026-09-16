"""Apply Refind runtime settings onto MediaCrawler config modules."""

from __future__ import annotations

import os


def apply_refind_config(*, mc_platform: str, url: str, cookie_str: str) -> None:
  import config
  import config.bilibili_config as bilibili_config
  import config.dy_config as dy_config
  import config.xhs_config as xhs_config
  import config.zhihu_config as zhihu_config

  config.PLATFORM = mc_platform
  config.CRAWLER_TYPE = "detail"
  config.LOGIN_TYPE = "cookie"
  config.COOKIES = cookie_str or ""
  config.HEADLESS = os.environ.get("REFIND_MC_HEADLESS", "1") != "0"
  config.ENABLE_CDP_MODE = os.environ.get("REFIND_MC_CDP", "0") == "1"
  config.CDP_HEADLESS = config.HEADLESS
  config.SAVE_LOGIN_STATE = False
  config.ENABLE_GET_COMMENTS = True
  config.ENABLE_GET_SUB_COMMENTS = os.environ.get("REFIND_MC_SUB_COMMENTS", "1") != "0"
  config.ENABLE_GET_MEIDAS = os.environ.get("REFIND_MC_DOWNLOAD_MEDIA", "0") == "1"
  config.ENABLE_GET_WORDCLOUD = False
  config.ENABLE_IP_PROXY = False
  config.MAX_CONCURRENCY_NUM = 1
  config.CRAWLER_MAX_SLEEP_SEC = float(os.environ.get("REFIND_MC_SLEEP_SEC", "1"))
  config.CRAWLER_MAX_COMMENTS_COUNT_SINGLENOTES = int(
    os.environ.get("REFIND_MC_MAX_COMMENTS", "30"),
  )
  config.SAVE_DATA_OPTION = "jsonl"

  if mc_platform == "xhs":
    xhs_config.XHS_SPECIFIED_NOTE_URL_LIST = [url]
  elif mc_platform == "dy":
    dy_config.DY_SPECIFIED_ID_LIST = [url]
  elif mc_platform == "bili":
    bilibili_config.BILI_SPECIFIED_ID_LIST = [url]
  elif mc_platform == "zhihu":
    zhihu_config.ZHIHU_SPECIFIED_ID_LIST = [url]
  else:
    raise ValueError(f"unsupported MediaCrawler platform: {mc_platform}")
