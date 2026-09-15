# 平台真实连接（阶段 B · 本机开发版）设计

> 日期：2026-09-15  
> 状态：**已落地**（本机开发版；小红书 + 抖音）  
> 前置：阶段 A（设置页演示连接 + `use_saved_session`）已落地  
> 范围确认：本机开发版；先做 **小红书 + 抖音**；方案 A（本地 `platform-parser` 开登录窗）
> 实现计划：`docs/superpowers/plans/2026-09-15-platform-real-login-local.md`  
> Parser 安装：见 `tools/platform-parser/README.md`

## 1. 目标

把设置页「连接」从演示标记升级为：**本机受控浏览器扫码/登录 → 拿到真实 Cookie 会话 → 写入 `platform_connections` → 解析时由本机 parser 消费**。

成功标准：

1. 用户在设置页对小红书或抖音点「连接」，本机弹出浏览器，完成登录后卡片变为「已连接」并显示账号名（可取到则显示）。
2. `platform_connections.encrypted_session` 不再是 `refind-demo-session-pending`，而是真实会话载荷（本机阶段允许简易加密）。
3. 粘贴对应平台链接且该平台已连接时，预取请求带 `use_saved_session: true`，parser 使用该平台 Cookie，登录墙内容解析成功率高于未连接。
4. 「断开」清除 DB 会话与本机该平台 Cookie 缓存；前端列表接口永不返回会话密文。

## 2. 非目标（本切片）

- 知乎 / B 站 / 微信公众号真实登录
- 托管登录/解析服务（生产部署）
- MediaCrawler 全量替换现有 parser（本切片增强现有 `tools/platform-parser`）
- 生产级 KMS / 硬件密钥；跨设备会话同步
- 阶段 C（DeepSeek 真摘要）

## 3. 用户流程

```
设置 → 连接内容平台 → [小红书|抖音] → 连接
  → POST 本机 parser /login { platform }
  → 本机 Playwright 弹窗（可见浏览器）
  → 用户扫码/账密登录
  → GET /login/:id 轮询至 success|failed|expired
  → 前端 upsert platform_connections（status=connected, session, account_display_name, last_verified_at）
  → UI「已连接」（去掉「演示态」文案）

断开 → 二次确认 → DB 置 disconnected + 清空 session 字段
  → 可选 POST /logout { platform } 清本机缓存
```

重新连接：等同断开后的连接，或直接再开 `/login` 覆盖会话。

## 4. 本机 Parser API

监听：`http://127.0.0.1:8787`（与现网预取一致）。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/login` | Body: `{ "platform": "xhs" \| "douyin" }`。启动登录任务，返回 `{ "login_id": "..." }` |
| `GET` | `/login/:id` | 返回 `{ "status": "pending"\|"success"\|"failed"\|"expired", "account_display_name"?: string, "session_payload"?: string, "error"?: string }` |
| `POST` | `/logout` | Body: `{ "platform": "xhs"\|"douyin" }`。清除本机该平台会话缓存 |
| `POST` | `/parse` | **既有**：增加优先读取「按平台缓存的登录 Cookie」；`use_saved_session` 为 true 时若无会话，返回明确错误 |

### 4.1 登录实现要点

- 使用 Playwright（headed）打开平台登录页；检测登录成功信号（Cookie 关键 / URL 变化 / 已登录 DOM）。
- 超时（建议 180s）→ `expired`；用户关窗或异常 → `failed`。
- 成功后抽取 Cookie 串 + 尽力解析账号展示名（无则空字符串，UI 显示「—」或「已连接」即可）。
- `session_payload`：建议 JSON 字符串，形如 `{ "cookies": "...", "ua"?: "...", "captured_at": "ISO" }`，供前端加密后入库；**仅在 success 时返回一次**，轮询后续可不再回传密文（或仅回 `status`）。

### 4.2 本机缓存

- 路径建议：`tools/platform-parser/sessions/{platform}.json`（gitignore）
- `/parse` 在 `use_saved_session` 时：优先该文件 → 其次环境变量 / `cookies.txt`（兼容阶段 A）

## 5. 前端 / Supabase

### 5.1 设置页

- 仅 `xhs`、`douyin` 走真实登录流；其余三平台可保持「即将支持」或暂留演示（产品默认：**其余平台按钮仍可点但提示「本阶段请用演示连接」或禁用并文案「即将支持真实登录」** —— 推荐 **禁用 +「即将支持」**，避免再写入 demo marker 造成混淆）。
- 连接中：按钮 loading / 「扫码登录中…」；轮询间隔 ~1.5s。
- 本机 parser 不可达：明确提示启动 `python3 tools/platform-parser/server.py`（及安装 Playwright 依赖说明）。
- 成功文案：**已连接**（删除演示态说明）。

### 5.2 `platformConnections` API

- `connectPlatform` 改为接收真实 `sessionPayload` + `accountDisplayName`，写入 DB。
- 移除对成功路径写入 `refind-demo-session-pending` 的依赖（迁移旧演示行：下次连接覆盖即可）。
- `listPlatformConnections` 继续 **不 select** `encrypted_session`。
- 简易加密：前端或 Edge 均可；本机阶段可用 Web Crypto + 派生自用户 id 的对称密钥，或先存 base64 包装并在字段注释/文档标明 **dev-only**。推荐最小实现：`dev1:` + base64(utf8 cookie json)，服务端/parser 识别前缀解码；正式加密留托管阶段。

### 5.3 解析链路

- 保持阶段 A：`buildPlatformParsePayload` / `shouldUseSavedSession`；已连接则 `use_saved_session: true`。
- Parser 侧用平台 Cookie 解析小红书/抖音；无会话错误文案指向「请先在设置中连接」或「会话失效请重新连接」。

## 6. 数据模型

沿用 `platform_connections`：

| 字段 | B 行为 |
| --- | --- |
| `status` | `connected` / `disconnected` |
| `encrypted_session` | 真实会话载荷（dev 编码）；前端永不列表返回 |
| `account_display_name` | 登录成功尽量写入 |
| `last_verified_at` | 连接/重连成功时更新 |
| `expires_at` | 可选；未知则 null；失效时用户重连 |

无需新表。可选 migration：无。

## 7. 安全与隐私（本机）

- Parser 仅绑 `127.0.0.1`。
- 会话文件加入 `.gitignore`。
- 设置页/网络面板不展示 Cookie。
- 文档明确：本切片 Cookie 在本机与用户自己的 Supabase 行内，**不适合多设备/生产**。

## 8. 验收清单

- [ ] 本机启动 parser（含 Playwright）后，小红书可完成一次真实连接
- [ ] 抖音可完成一次真实连接
- [ ] 断开后状态与解析不再带有效会话
- [ ] 已连接下解析带 `use_saved_session`，且 parser 日志/行为显示使用了登录 Cookie
- [ ] 列表接口响应无 `encrypted_session`
- [ ] 知乎/B 站/微信不误走真实登录成功路径（禁用或明确未支持）
- [ ] 相关单测：连接 API payload、parser login 状态机（可 mock Playwright）

## 9. 文档联动（实现后）

- 更新 `2026-09-14-platform-connection-settings-ui.md`：B 本机版状态
- 更新路线图 §1.1：B 本机切片已落地 / 托管仍待做
- PRD §9.10 / Spec §5.10 边界从「纯演示」改为「小红书/抖音本机真实连接」

## 10. 风险

| 风险 | 缓解 |
| --- | --- |
| 平台改版导致登录检测失败 | 超时与失败文案；保留手动 Cookie 文件兜底 |
| Playwright 未安装 | `/login` 返回清晰安装提示 |
| 扫码二维码在 headed 窗内难用 | 使用系统可见窗口；文档说明窗口勿最小化 |
| 会话很快失效 | 「重新连接」；解析错误引导重连 |
