# Local platform parser

HTTP service for CN platform link parse + **local Playwright login**（小红书 / 抖音 / 知乎 / B 站）。

**MediaCrawler 接入：** 小红书 / 抖音 / 知乎 / B 站链接会优先走 [MediaCrawler](https://github.com/NanmiCoder/MediaCrawler) detail 模式（正文 + 评论 + 媒体 URL + 互动数据），失败时回退到原有 HTML / yt-dlp 解析。微信公众号仍走 legacy（MC 不支持）。

## Setup

```bash
cd tools/platform-parser
python3 -m pip install -r requirements.txt
python3 -m playwright install chromium

# MediaCrawler（推荐，启用评论/完整详情）
./setup_medicrawler.sh
# 或手动：cd ../MediaCrawler && uv sync && uv run playwright install chromium

cd ../platform-parser
python3 server.py
# → http://127.0.0.1:8787
```

`GET /health` 会返回 `mediacrawler.available`。若未安装 MC，解析仍可用 legacy 路径。

可选环境变量：`REFIND_DISABLE_MEDIACRAWLER=1` 关闭 MC；`REFIND_MC_MAX_COMMENTS=50` 调整评论条数。详见 `docs/superpowers/specs/2026-09-16-mediacrawler-integration-design.md`。

Optional legacy cookie file: copy `cookies.txt.example` → `cookies.txt`, or set `PLATFORM_COOKIE`.

## Login API (Phase B · local)

- `POST /login` `{ "platform": "xhs" | "douyin" | "zhihu" | "bilibili" }` → `{ "login_id" }`
- `GET /login/:id` → `{ status, account_display_name?, session_payload?, error? }`
- `POST /logout` `{ "platform": "xhs" | "douyin" | "zhihu" | "bilibili" }`

Sessions are stored under `sessions/` (gitignored). Frontend also persists `dev1:`-encoded payload into Supabase `platform_connections.encrypted_session`.

## Parse

`POST /parse` `{ "url", "use_saved_session": true }` prefers `sessions/{platform}.json` over `cookies.txt`.

## Office → PDF (`POST /convert-office`)

Used by the material preview page to restore PPT / Excel layout as PDF.

**Conversion order (macOS):**
1. **Microsoft PowerPoint / Excel**（保真度最好，本机已装 Office 时优先）
2. **LibreOffice**（回退；复杂 PPT 可能丢图/字体）

```bash
# optional LibreOffice path override
export LIBREOFFICE_PATH="/Applications/LibreOffice.app/Contents/MacOS/soffice"
```

首次用 PowerPoint/Excel 自动化导出时，macOS 可能弹出「辅助功能 / 自动化」授权，请允许 Terminal（或运行 `server.py` 的进程）控制 Microsoft Office。

```bash
# Request
POST /convert-office
{ "filename": "deck.pptx", "content_base64": "..." }

# Response
{ "ok": true, "filename": "deck.pdf", "content_base64": "...", "byte_length": 12345 }
```

`GET /health` includes `"office_convert": true` when `soffice` is available.

可选环境变量：

- `PLATFORM_PARSER_HOST`（默认 `127.0.0.1`；托管时设 `0.0.0.0`）
- `PLATFORM_PARSER_PORT`（默认 `8787`）

托管部署见 [`HOSTED.md`](./HOSTED.md)。
