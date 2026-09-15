# Local platform parser

HTTP service for CN platform link parse + **local Playwright login** (小红书 / 抖音).

## Setup

```bash
cd tools/platform-parser
python3 -m pip install -r requirements.txt
python3 -m playwright install chromium
python3 server.py
# → http://127.0.0.1:8787
```

Optional legacy cookie file: copy `cookies.txt.example` → `cookies.txt`, or set `PLATFORM_COOKIE`.

## Login API (Phase B · local)

- `POST /login` `{ "platform": "xhs" | "douyin" }` → `{ "login_id" }`
- `GET /login/:id` → `{ status, account_display_name?, session_payload?, error? }`
- `POST /logout` `{ "platform": "xhs" | "douyin" }`

Sessions are stored under `sessions/` (gitignored). Frontend also persists `dev1:`-encoded payload into Supabase `platform_connections.encrypted_session`.

## Parse

`POST /parse` `{ "url", "use_saved_session": true }` prefers `sessions/{platform}.json` over `cookies.txt`.
