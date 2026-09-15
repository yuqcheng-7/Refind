# 设置页 · 平台连接 UI（2026-09-14）

> 最近修订：2026-09-15（B 本机真实登录：小红书/抖音 Playwright；其余平台「即将支持」）

## 入口

- 侧栏底部账号菜单 → **设置**（账号菜单仅保留「设置 / 退出登录」；注销账户只在设置内）
- 资料「仅链接」提醒卡 → **去连接平台**（可带 focus 平台）

## 信息架构

设置页两个 Tab：

1. **连接内容平台**（默认）
2. **账户与安全**

### 账户与安全（已落地）

- 展示邮箱；编辑展示用户名（`profiles.display_name`）
- 修改密码（先校验当前密码，再 `updateUser`）
- 危险操作：删除账号（二次确认后级联清理）

## 平台卡片（五平台）

小红书 / 抖音 / 知乎 / B 站 / 微信公众号：

- 单卡片列表 + 分隔线；名称、说明、连接状态（小圆点）、账号名、最近验证时间
- **小红书 / 抖音**：连接 / 重新连接 / 断开（本机 Playwright 扫码登录）
- **知乎 / B 站 / 微信公众号**：按钮禁用，文案「即将支持」（若残留演示连接可「断开演示连接」）
- **无「已过期」独立态**：过期按断开处理

## 连接能力分层（产品确认）

| 阶段 | 内容 | 状态（2026-09-15） |
| --- | --- | --- |
| **A** | UI + `platform_connections` 读写；已连接时解析请求带 `use_saved_session`，优先本机 Cookie | **已落地**（演示态，已被 B 本机版取代写入路径） |
| **B · 本机** | 小红书 / 抖音：本机 Playwright 登录 → `dev1:` 会话入库 + `sessions/{platform}.json` → parser 消费 | **已落地**（开发机） |
| **B · 托管** | 托管登录/解析服务；用户不依赖本机 `platform-parser` | **下一步（生产）** |
| **C** | 真实 DeepSeek 摘要（替换正文种子 stub） | 阶段三 |

## 本机 B 实现边界

- 点「连接」调本机 `POST /login`，轮询至成功后 upsert 真实 `encrypted_session`（`dev1:` + base64 JSON），**不再**写 `refind-demo-session-pending`
- 依赖：`pip install -r tools/platform-parser/requirements.txt && playwright install chromium`，并启动 `python3 tools/platform-parser/server.py`
- 生产前须完成 **B · 托管**，用户不得依赖本机 parser
