# 拾藏 Refind — Agent Guide

个人资料收藏 + RAG 问答 + 笔记。已上线：https://www.refind.cloud

## 架构

| 部分 | 位置 | 运行在 |
| --- | --- | --- |
| 前端 SPA（React 19 + Vite 6） | `refind-demo/` | Cloudflare Pages，push `main` 自动构建（`npm run build:web`） |
| 数据 / Auth / Storage / Edge Functions | `supabase/` | Supabase 东京，project ref `ngrerfmwxsdothniuorb` |
| 平台解析服务（Python + Playwright） | `tools/platform-parser/` | 阿里云轻量香港 `47.243.250.188`，`parser.refind.cloud`，systemd `refind-parser` |
| 浏览器扩展「拾藏连接」 | `extensions/refind-connect/` | 用户自己的 Chrome（未上架，手动加载） |

前端界面与交互的已定决策见 `refind-demo/AGENTS.md`；产品与技术规格见 `output/Refind拾藏PRD_V1.0.md`、`output/Refind拾藏开发Spec_V1.0.md`、`output/design.md`；设计稿与实施计划在 `docs/superpowers/{specs,plans}/`。

## 测试（改完必须跑相关的，声明完成前跑全套）

```bash
cd refind-demo && npx vitest run                         # 前端
cd supabase/functions && node --test */*.test.js         # Edge 纯逻辑
cd refind-demo && npm run test:sites                      # Sites worker
cd tools/platform-parser && python3 -m py_compile *.py medicrawler/*.py \
  && python3 -m unittest discover -p 'test_*.py'          # 解析服务
```

CI（`.github/workflows/ci.yml`）在每次 push / PR 上跑同样四组。

## 部署

- **前端**：push 到 `main` 即可；用户需硬刷新（Cmd+Shift+R）。
- **Edge Functions**：`npx supabase functions deploy <name> --project-ref ngrerfmwxsdothniuorb`。改了 `supabase/functions/_shared/` 就要重新部署所有引用它的函数（`rg -l "_shared/<file>" supabase/functions`）。
- **数据库**：新增 `supabase/migrations/<timestamp>_<name>.sql`，`npx supabase db push`。
- **解析服务**：需要用户在服务器上执行 `cd ~/Refind && git pull && sudo systemctl restart refind-parser`。服务器直接跑 `main`，push 前务必过 `py_compile`。健康检查：`curl https://parser.refind.cloud/health`。
- **扩展**：改代码要同步升 `manifest.json` 的 `version` 和 `README.md`，并提醒用户在 `chrome://extensions` 重新加载。

## AI 模型（全部在 `supabase/functions/_shared/ai.ts` 与 `parse-material/extractImageContent.js`）

| 用途 | 模型 |
| --- | --- |
| 问答 / 摘要标签 / 笔记大纲 / 生成笔记 | 百炼 `deepseek-v4-flash`（DS快速=非思考，DS深度=思考）；兜底官方 `deepseek-flash` |
| 检索改写 | 百炼 `qwen3.6-flash`（非思考，1200ms 超时后回退规则） |
| 向量 / 重排 / 联网 | `text-embedding-v4`（1024 维）/ `qwen3-rerank` / `qwen-plus` |
| 图片 OCR | `qwen3.5-ocr` → `qwen3.6-flash` → `qwen-vl-ocr` |

百炼和 DeepSeek 都会下线旧模型 ID（2026-10-10 一批）。收到下线通知时先 `rg` 全部模型 ID 对照公告，新模型要在线上实测后再声明完成。可用 secrets 覆盖：`BAILIAN_DEEPSEEK_MODEL`、`DEEPSEEK_DIRECT_MODEL`、`GENERATE_NOTE_MODEL`、`RAG_REWRITE_MODEL`、`IMAGE_VISION_MODEL`、`BAILIAN_ONLINE_MODEL`。

## 踩过的坑

- **机房 IP 抓不到国内平台**：Supabase Edge 和香港服务器访问微信公众号、抖音、知乎常被验证码或 403 拦截。正文抓取以扩展（用户住宅 IP + 已登录 Cookie）为主，服务端只做兜底；验证码页、登录壳页必须判为失败，不能当正文入库。
- **抖音搜索页链接**带 `modal_id`，要先归一化成 `/video/{id}`（`normalizeSourceUrl.js`）。
- **微信整页超过 2MB** 会被丢弃，扩展只抽取 `#js_content` 等正文节点。
- `materials` 的 `canonical_url` 唯一约束排除了 `status='deleted'`；删除是软删除。
- Supabase 返回的错误不一定是 `Error` 实例，记录时用统一的 `errorMessage()`，否则只会看到「解析失败」。
- `npx supabase secrets list` 可能要等 2 分钟以上，属正常。

## 约定

- 密钥（`service_role`、`DASHSCOPE_API_KEY`、`DEEPSEEK_API_KEY`）只放 Edge secrets，绝不能以 `VITE_*` 暴露给前端。
- 生产环境 `VITE_PLATFORM_PARSER_URL` 不能指向 `127.0.0.1`。
- `refind-demo/dist/`、`refind-demo/node_modules/.vite/` 的本地改动是构建噪音，不要提交。
- 改了产品行为就同步更新 PRD / Spec 对应章节。
- 声明「已修复」「已上线」前，要有测试输出或线上实测作为证据。
