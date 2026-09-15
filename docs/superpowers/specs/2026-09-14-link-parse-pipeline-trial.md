# 链接解析分级流水线（方案 A）试跑说明 — 2026-09-14

> 最近修订：2026-09-15（东京 Supabase、`use_saved_session`、托管解析规划）

## 目标（验收）

预览页必须能清楚看到：

- 标题、来源、类型、时间、标签（有则显示）
- AI 摘要（无真实简介时显示诚实占位，不拿 BV 号冒充）
- 可读分段正文 / 视频文案
- 视频：播放器 + 文案/简介；字幕仅在有时显示

## 关键架构

### 开发期（本机预取）

Supabase Edge 在海外常拉不到 B 站/国内站。开发改为：

1. 浏览器（国内网络）先请求本地 `platform-parser`
2. 把结果作为 `prefetched` 传给 `parse-material` 落库
3. 本地解析器不可用时，才走 Edge 远端抓取（易失败）

```bash
python3 tools/platform-parser/server.py
# 默认 http://127.0.0.1:8787
# refind-demo/.env：VITE_PLATFORM_PARSER_URL=http://127.0.0.1:8787
```

### 平台连接与会话（阶段 A 已接）

- 设置页标记某平台「已连接」后，前端预取请求带 `use_saved_session: true`
- 本地 parser 优先使用本机 Cookie（`cookies.txt` / `PLATFORM_COOKIE`）；无 Cookie 时给出明确错误
- **真实扫码会话**属阶段 B，当前仍为演示标记

### 生产期（待做）

- **托管解析服务**：部署可访问国内平台的解析端（建议港区 / 国内 VPS），替换本机 `8787`
- 前端通过环境变量指向托管 URL；终端用户**不得**自行启动 Python parser
- 后端数据面：当前生产 Supabase 项目位于 **东京 `ap-northeast-1`**（相对美区更利于亚太延迟）

本地 parser 覆盖：

| 平台 | 策略 |
| --- | --- |
| B 站 | 公开 view API + embed |
| 抖音 | yt-dlp |
| 微信 | 抓 HTML + `#js_content` |
| 知乎 / 小红书 | 尽力 OG / 页面态；登录墙仍可能失败 |
| 其他 | OG + article/main |

## 成功分级

| quality | 行为 |
| --- | --- |
| full | `ready`，正文可用于 RAG |
| partial | 仍 `ready`（标题+播放/简介有限） |
| none | `link_only` |

## 尚未完成

- **B**：受控登录 + 真实加密会话 + MediaCrawler 消费
- **托管解析**上线与密钥 / Cookie 运维
- Phase 3 真实 DeepSeek 摘要（当前为正文种子 stub）
