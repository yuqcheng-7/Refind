# DeepSeek 真摘要与标签（阶段三 · C）设计

> 日期：2026-09-15  
> 状态：**已实现（待本地 E2E 验收）**（`phase3-deepseek-summary-tags`；PRD/Spec 已同步）  
> 前置：资料解析与 `parse-material`、聊天用 `deepseekChat`（`_shared/ai.ts`）已落地  
> 关联：路线图阶段 C；Spec §8.2；PRD「AI 摘要仍为 stub」已收口  
> 用户确认要点：新资料优先（旧资料回填另开）；失败保资料；约 3 标签；重新解析不覆盖手改标签但重写摘要；右键菜单精简；标签进首页/知识库 `#` 筛选  
> 说明：§10 清单仍待 Docker/密钥环境下的本地 E2E 勾选，当前不以「已落地」冒充验收完成

## 1. 目标

把资料入库后的「截断正文当摘要」升级为 DeepSeek 生成的**简明摘要 + 约 3 个资料标签**，并支持手动编辑与重新解析。

成功标准：

1. 新解析成功的资料：`materials.summary` 为 AI 摘要（非纯截断 stub）；并写入约 3 个 `material_tags` 关系。
2. AI 失败时资料仍可 `ready`（或保留已有正文）：摘要可回退截断；标签可空；用户可「重新解析」。
3. 用户手改过的标签，重新解析时**不被覆盖**；摘要每次重新解析都由 AI 重写。
4. 资料标签可供首页 AI、知识库 AI 输入框 `#` 筛选使用。
5. 本切片**不做**历史资料一键回填（另开任务）。

## 2. 非目标

- 批量回填已有 `ready` 资料的摘要/标签  
- 知乎 / B 站 / 微信等平台登录扩展  
- 托管解析服务、生产部署  
- 摘要单独「重新生成」按钮（与「重新解析」合并）  
- 图片 OCR 补强、MediaCrawler 大改（非本切片）

## 3. 用户确认摘要

| 项 | 选择 |
| --- | --- |
| 范围 | 先新入库；旧资料回填以后做 |
| AI 失败 | 资料保留；截断摘要顶上；可重新解析 |
| 标签数量 | 约 3 个 |
| 重新解析 | 一次重跑正文/摘要/标签逻辑；手改标签不覆盖；摘要总是重写 |
| 手动编辑 | 支持编辑标签 |
| 入口 | 列表右键 + 预览页「重新解析」 |
| `#` 筛选 | 首页与知识库 AI 均可选资料标签 |

## 4. 架构与数据流

```
添加资料 / 重新解析
  → parse-material（抽正文、写 chunks…）
  → deepseekChat（摘要 + 3 tags JSON）
  → 写 materials.summary
  → 若 tags_user_edited ≠ true：替换 material_tag_relations
  → embed-material（既有）
  → status = ready
```

复用：`supabase/functions/_shared/ai.ts` 的 `deepseekChat`（与 chat-message 相同密钥与 Bailian/DeepSeek 回退）。

建议抽纯函数（便于单测）：

- `buildMaterialEnrichmentPrompt({ title, platform, contentText })`
- `parseMaterialEnrichmentResponse(raw)` → `{ summary, tags: string[≤3] }`
- `shouldReplaceTags({ tagsUserEdited })`

调用时机：正文可用且即将标 `ready` 时同步调用（方案 1）。`link_only` / 无正文：不调 AI；沿用现有降级文案。

## 5. 数据模型

在 `materials` 增加（迁移）：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `tags_user_edited` | `boolean not null default false` | 用户是否手动改过标签 |

规则：

- 用户通过「编辑标签」保存成功 → `tags_user_edited = true`
- 重新解析 / 首次 AI 打标：仅当 `tags_user_edited = false` 时替换标签关系
- 摘要字段仍用 `materials.summary`；无单独「摘要手改」锁（按确认：重新解析总是重写摘要）

标签写入：复用 `material_tags`（按用户维度 name upsert）+ `material_tag_relations`；不默认 `#待整理`。

## 6. AI 输出约定

- 模型：`deepseek-chat`（快速、低温度，如 `0.2`）
- 输入：标题、平台、正文截断（控制 token，例如前 6k～8k 字）
- 输出：严格 JSON，例如  
  `{ "summary": "…", "tags": ["标签1", "标签2", "标签3"] }`
- `summary`：中文简明，约 40～120 字，不堆砌原文  
- `tags`：中文短词，**恰好最多 3 个**，去重、去空、去掉 `#` 前缀  
- 解析失败：回退 `buildSummary` 截断；标签跳过写入（保留原关系或空）

## 7. 前端交互

### 7.1 资料列表右键菜单（精简）

仅四项，**不展示资料标题**：

1. 重新解析  
2. 编辑标签  
3. 移动到 → **另开**知识库列表弹层（菜单内不再内嵌库列表）  
4. 删除资料  

### 7.2 资料预览页

工具区提供「重新解析」；行为与列表一致（`force` 解析 + AI 摘要；标签按 `tags_user_edited`）。

### 7.3 编辑标签

- 入口：右键「编辑标签」  
- 可增删改，保存写库并设 `tags_user_edited = true`  
- 失败 toast，不静默丢改

### 7.4 `#` 筛选数据源

- **知识库 AI**：当前知识库下资料出现过的标签  
- **首页 AI**：当前用户各库资料标签并集（或可检索集合）  
- 替换首页/知识库 composer 中的硬编码演示标签列表

### 7.5 添加失败队列

现有「重试」保留；成功路径同样走 AI 摘要+标签。

## 8. 错误与边界

| 情况 | 行为 |
| --- | --- |
| DeepSeek 超时/报错 | 不删资料；截断摘要；不强制失败整单；可重新解析 |
| JSON 不合法 | 同失败回退 |
| 正文过短 | 仍可调 AI；质量差时可回退截断 |
| `tags_user_edited` | 永远不因 AI 结果清空手改标签 |
| 密钥缺失 | 与 chat 一致：可观测错误日志 + 回退截断，不把 Key 打进前端 |

## 9. 测试要点

- 单元：prompt/解析 JSON、tag 规范化、`shouldReplaceTags`  
- 解析路径：mock `deepseekChat` → summary + 3 tags 落库  
- `tags_user_edited=true` 时重新解析不改 relations、仍更新 summary  
- 右键菜单结构；移动到二级弹层  
- `#` 选项来自真实标签 API，非写死文案  

## 10. 验收清单

> **延期说明：** 下列项依赖本机 Docker、`supabase db push` 与 DeepSeek/平台密钥，当前环境未跑通 E2E，勾选暂缓。

- [ ] 新链接/文件 ready 后摘要明显非纯截断 stub，且约有 3 标签  
- [ ] AI 失败资料仍在，可重新解析  
- [ ] 手改标签后重新解析：标签不变，摘要更新  
- [ ] 右键仅四项；移动到为二级弹窗；预览页有重新解析  
- [ ] 首页与知识库 `#` 能选到资料标签  
- [ ] 无 API Key 进前端包；本切片无批量回填  

## 11. 后续切片

- 历史资料摘要/标签回填  
- 摘要手改锁定（若产品需要）  
- 标签数量可配置 / 平台原生话题合并策略增强  
