# 知乎 / B 站真实登录 + 微信「无需登录」设计

> 日期：2026-09-16  
> 状态：**已落地**（本机开发版；知乎 + B 站真实登录；微信「无需登录」）  
> 前置：`2026-09-15-platform-real-login-local-design.md`（小红书 + 抖音本机登录已落地）  
> 产品确认：知乎、B 站按小红书同款本机登录；微信公众号显示「无需登录」，不接真实登录。  
> 实现计划：`docs/superpowers/plans/2026-09-16-zhihu-bilibili-login-wechat-no-login.md`

## 1. 目标

1. **知乎 `zhihu`、B 站 `bilibili`**：设置页可「连接 / 重新连接 / 断开」，流程与小红书一致（本机 Playwright 登录窗 → Cookie 落盘 → `platform_connections` → 解析 `use_saved_session`）。
2. **微信公众号 `wechat_mp`**：不提供真实登录；设置卡片状态/按钮文案为「无需登录」；公开文章继续匿名 HTML 解析。
3. 知乎登录墙失败时，错误文案引导用户去设置页连接（不再只提 `PLATFORM_COOKIE` / `cookies.txt`）。

## 2. 非目标

- 微信公众号 Playwright / App 扫码真实登录
- 托管登录服务（生产 B·托管）
- 改 Edge `extractLinkContent` 的 B 站公开 API 主路径（仍优先匿名；有会话时可选带 Cookie）
- 生产级 KMS、跨设备会话同步

## 3. 用户流程

### 3.1 知乎 / B 站（与小红书同构）

```
设置 → 连接内容平台 → [知乎|B 站] → 连接
  → POST 本机 parser /login { platform }
  → Playwright 可见浏览器
  → 用户扫码/账密登录
  → 轮询 GET /login/:id → success
  → upsert platform_connections
  → UI「已连接」+ 账号名（可取到则显示）

断开 → 清 DB 会话 + 本机 sessions/{zhihu|bilibili}.json
解析链接且已连接 → prefetch use_saved_session: true → parser 带 Cookie
```

### 3.2 微信公众号

```
设置卡片：状态「无需登录」；主按钮 disabled 或中性文案「无需登录」
不写 platform_connections 登录会话
解析：继续 parse_wechat / #js_content / OG，不依赖 use_saved_session
```

## 4. 技术方案

复用现有本机登录机，不新开通路。

| 层 | 改动 |
| --- | --- |
| `session_store.py` | `SUPPORTED_LOGIN_PLATFORMS` += `zhihu`, `bilibili`；`COOKIE_DOMAINS` 补 `.zhihu.com`、`.bilibili.com` |
| `login_flow.py` | `LOGIN_URLS` / `SUCCESS_COOKIE_KEYS` / `PROFILE_BOOTSTRAP`；ready 检测与昵称抓取按平台扩展 |
| `server.py` | `SESSION_PLATFORMS` 含 bilibili（可选带会话）；知乎失败文案改「请在设置页连接知乎」；启动日志列出新平台 |
| `platformSession.js` | `REAL_LOGIN_PLATFORMS = ['xhs','douyin','zhihu','bilibili']` |
| `SettingsPage.jsx` | hint 文案；`wechat_mp` 走「无需登录」分支（非 realLogin、非「即将支持」） |
| 测试 | parser 单测 + `platformSession` / `SettingsPage` 前端测 |

### 4.1 登录探测（初值，实现时可按实机微调）

| 平台 | 登录入口（建议） | 成功 Cookie 线索 |
| --- | --- | --- |
| 知乎 | `https://www.zhihu.com/signin` 或首页 | `z_c0`（必选） |
| B 站 | `https://passport.bilibili.com/login` | `SESSDATA` 和/或 `DedeUserID` |

昵称：优先页面/接口可读字段；取不到则空字符串或 UID 简写（与现有 xhs/douyin 策略一致）。

### 4.2 解析行为

| 平台 | 未连接 | 已连接 |
| --- | --- | --- |
| 知乎 | 公开页尽量抓；登录墙 → 明确提示去设置连接 | Cookie → `parse_zhihu` |
| B 站 | 公开 API（现状） | 同公开 API；请求可附带 Cookie（会员/受限内容兜底） |
| 微信 | 公开文章 HTML（现状） | N/A（无登录） |

## 5. 设置页文案

- Hint：小红书、抖音、知乎、B 站支持本机扫码登录；微信公众号公开文章无需登录即可解析。
- 微信卡片：`statusLabel` / 按钮 →「无需登录」（disabled）。
- 去掉知乎 / B 站的「即将支持」。

## 6. 成功标准

1. 设置页对知乎、B 站可完成连接与断开，DB 有 `connected` + 非演示 session。
2. 已连接时粘贴知乎链接，预取带 `use_saved_session: true`，登录墙内容可解析概率明显高于未连接。
3. B 站未连接仍可解析公开视频；已连接不破坏现有公开路径。
4. 微信卡片显示「无需登录」，无连接按钮可用态；公开文章解析不受影响。
5. 相关单测通过；本机 parser 启动日志含 zhihu / bilibili。

## 7. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 知乎反爬 / 验证码 | 与 xhs 相同：用户手动完成；超时 `expired` |
| B 站登录对公开解析无增益 | 产品一致性优先；解析仍匿名优先 |
| Cookie 键名变更 | ready 检测允许多键 OR；实机校准 |
| 用户未启 parser | 现有 Settings 连接错误提示沿用 |
