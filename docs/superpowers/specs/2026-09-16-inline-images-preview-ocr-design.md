# 平台正文文内图：预览展示 + OCR 入 RAG

**日期：** 2026-09-16  
**状态：** 已确认，实现中  
**关联：** MediaCrawler 接入、小红书 `media_urls` OCR、封面 `persistRemoteCover`

## 1. 目标

平台链接资料（知乎 / 微信 / B 站图文 / 小红书等）在解析时：

1. **预览可见文内图**：资料详情「原文」按正文顺序显示图片。  
2. **文内图 OCR 进 RAG**：识别图内文字，追加进 `content_text`，参与分块与检索。

导入体验：**先出文字可用，图与 OCR 后台补齐**（不阻塞 `ready`）。

## 2. 非目标

- 不做视频帧抽图 / ASR。  
- 不追求 1:1 还原原站排版与全部 CSS。  
- 不无限下载；每篇有上限。  
- 列表缩略图策略不变（主流平台列表仍可用平台 logo；本切片只管详情正文）。

## 3. 已确认决策

| 项 | 选择 |
|----|------|
| 方案 | A：正文插图位置 + OCR 附录 |
| 存储 | 下载到拾藏 `materials` Storage（防盗链 / 过期） |
| 节奏 | 同步只保证文字；插图落库与 OCR 后台 |
| 上限 | 每篇最多处理 **10** 张文内图（可配置） |

## 4. 数据流

```
platform-parser / extractLinkContent
  → content_text（纯文字，保留段落）
  → media_urls[]（按正文出现顺序的图片 URL，去重，≤10）

parse-material（同步）
  → 写入 content_text / ready（与现网一致）
  → 若有 media_urls：登记后台任务（复用现有 deferredImageOcr / waitUntil）

后台
  1. 下载每张图 → Storage：`{userId}/{materialId}.inline.{n}.{ext}`
  2. 生成预览正文：在合适位置插入 Markdown 图片
     `![](storage:{objectKey})`（或等价约定，前端解析）
  3. OCR 每张图 → 追加
     `【文内图片识别】\n【图1】…\n【图2】…`
  4. 更新 content_text + content_excerpt；重分块 + embed
```

### 预览正文格式约定

- `content_text` 仍是单一文本字段（避免新列阻塞上线）。  
- 插图用 Markdown：`![](storage:user/…/xxx.inline.1.jpg)`。  
- OCR 块放在文末，标题固定 `【文内图片识别】`，便于去重与二次补跑跳过。  
- 前端预览：识别 `![](storage:…)` → 换 signed URL → `<img>`；其余段落沿用现有 `buildReadableBlocks`。

## 5. 解析侧改动

### 5.1 platform-parser / Edge extractLinkContent

- 从正文 HTML 抽取 `<img src>` / 常见懒加载属性（`data-src`、`data-original`）。  
- 绝对化 URL；过滤追踪像素与过小占位图（启发式：跳过明显 1×1 / data URI 空图）。  
- 写入结果字段 `media_urls`（已有 MC 路径沿用并合并）。  
- **微信 / 知乎 HTML 路径**目前只 `html_to_text`，需补抽图。  
- **B 站**：视频仍以封面 + 播放为主；专栏/图文若有正文图则纳入。

### 5.2 parse-material

- 将「仅 xhs 才 OCR media_urls」扩展为：**凡 prefetched/extracted 带 `media_urls` 均走后台**。  
- 新增（或扩展）`persistRemoteInlineImages`：批量下载上传，返回 `[{ index, objectKey, sourceUrl }]`。  
- 用 objectKey 回写预览 Markdown；OCR 复用 `extractRemoteMediaImages` / `extractImageContent`。  
- 失败单张 soft-fail，不拖垮整篇。

## 6. 前端

- `MaterialPreviewPage` / `ParagraphBlock`：支持混合段落 + 图片块。  
- `materials.js` map：无需新列时可不改 API；若后续加 `inline_image_keys jsonb` 可作增强，**本切片不强制迁移**。  
- Signed URL：复用 `createMaterialSignedUrl`。

## 7. 性能与限额

| 项 | 值 |
|----|-----|
| 每篇最多图 | 10 |
| 单图最大 | 与现 OCR 一致（约 10MB） |
| 同步路径 | 不下载、不 OCR |
| 后台超时 | 单张 fetch/OCR 已有 timeout；整体靠 Edge `waitUntil` |

用户体感：导入后很快可看文字与摘要；稍后再开预览可见图；再稍后提问可命中图内字。

## 8. 验收

1. 知乎专栏 / 微信图文：导入后详情原文出现文内图（非仅 logo）。  
2. 同篇 `content_text` 含 `【文内图片识别】`，RAG 可命中图内明显文字（有字的图）。  
3. 无图链接：行为与现在一致，不报错。  
4. 超过 10 张：只处理前 10 张。  
5. 外链防盗链场景：预览仍能显示（来自 Storage）。

## 9. 风险

- 部分图 CDN 连服务端也拉不下 → 该张跳过，正文仍可用。  
- Markdown 插入位置与原文不完全对齐（HTML 结构复杂时）→ 接受「顺序大致正确」。  
- OCR 费用 / 耗时 → 靠限额 + 后台。
