# MediaCrawler 接入设计

**日期：** 2026-09-16  
**状态：** 已实现 Phase 1（链接 detail 解析）

## 目标

将 Refind 本地 `platform-parser` 与 [MediaCrawler](https://github.com/NanmiCoder/MediaCrawler) 对接，在粘贴链接入库时启用 MC 已支持的能力：

| 能力 | Refind 用法 |
|------|-------------|
| detail 详情 | 单链接解析（主路径） |
| 评论抓取 | 写入 `subtitle_text`，参与 RAG 正文拼接 |
| 媒体 URL | `media_urls` 字段；可选下载（环境变量） |
| 互动数据 / 标签 | 追加到 `content_text` 统计区 |
| Cookie 会话 | 注入 Refind `sessions/{platform}.json` |
| 微信公众号 | **不走 MC**（MC 不支持），保留现有 HTML 解析 |

## 架构

```
浏览器 ingest
  → POST /parse (platform-parser)
      → medicrawler_adapter.try_medicrawler_parse()
          → subprocess medicrawler/detail_runner.py (cwd=tools/MediaCrawler)
              → MC CrawlerFactory + detail 模式
              → capture hooks 拦截 store 落盘
              → normalize → Refind prefetch JSON
      → 失败则 fallback 现有 HTML / yt-dlp 解析
  → parse-material Edge（prefetched）
```

## 平台映射

| Refind | MediaCrawler |
|--------|--------------|
| xhs | xhs |
| douyin | dy |
| bilibili | bili |
| zhihu | zhihu |
| wechat_mp | （legacy） |

快手 / 微博 / 贴吧：**不在 Refind 产品范围内**，不接入。

## 配置

环境变量（可选）：

| 变量 | 默认 | 说明 |
|------|------|------|
| `MEDIACRAWLER_ROOT` | `tools/MediaCrawler` | MC 根目录 |
| `REFIND_DISABLE_MEDIACRAWLER` | `0` | 设为 `1` 强制走 legacy |
| `REFIND_MC_TIMEOUT_SEC` | `180` | 单次解析超时 |
| `REFIND_MC_MAX_COMMENTS` | `30` | 每帖评论上限 |
| `REFIND_MC_SUB_COMMENTS` | `1` | 是否抓二级评论 |
| `REFIND_MC_DOWNLOAD_MEDIA` | `0` | 是否下载媒体二进制（默认只保留 URL） |
| `REFIND_MC_HEADLESS` | `1` | Playwright 无头 |
| `REFIND_MC_CDP` | `0` | 是否启用 CDP 模式 |

## 安装

```bash
cd tools/MediaCrawler
uv sync
uv run playwright install chromium
```

`GET /health` 返回 `mediacrawler.available` 与 `enabled`。

## 合规

MediaCrawler 采用 NON-COMMERCIAL LEARNING LICENSE 1.1。Refind 集成仅供学习与个人知识管理；请遵守各平台服务条款，控制频率，勿用于商业爬取。

## 小红书图片 OCR

MediaCrawler detail 返回的 `media_urls`（笔记轮播图）在 `parse-material` 中后台 OCR：

- 最多 9 张，单张 ≤ 10MB
- 识别结果追加为 `【文内图片识别】` 块写入 `content_text` 并重新分块 embed
- 需配置 `DASHSCOPE_API_KEY`

## Phase 2（未做）

- search / creator 批量模式（独立「采集任务」UI，非单链接 ingest）
