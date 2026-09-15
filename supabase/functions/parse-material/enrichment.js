export const CONTENT_CHAR_LIMIT = 7000;

function cleanText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeTagList(tags) {
  if (!Array.isArray(tags)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    let name = raw.trim().replace(/^#+/, '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= 3) break;
  }
  return out;
}

export function parseMaterialEnrichmentResponse(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let text = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(text);
  if (fence) text = fence[1].trim();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      data = JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  const summary = typeof data?.summary === 'string' ? data.summary.trim() : '';
  if (!summary) return null;
  return { summary, tags: normalizeTagList(data.tags) };
}

export function shouldReplaceTags({ tagsUserEdited }) {
  return tagsUserEdited !== true;
}

export function buildMaterialEnrichmentPrompt({ title, platform, contentText }) {
  const body = String(contentText || '').slice(0, CONTENT_CHAR_LIMIT);
  return [
    {
      role: 'system',
      content:
        '你是资料整理助手。根据标题与正文，输出严格 JSON：{"summary":"中文简明摘要40-120字","tags":["标签1","标签2","标签3"]}。tags 最多 3 个中文短词，不要 # 前缀，不要 markdown。',
    },
    {
      role: 'user',
      content: `标题：${title || '未命名'}\n平台：${platform || 'web'}\n正文：\n${body}`,
    },
  ];
}

export function fallbackSummary(seed, text, title = '') {
  const value = cleanText(seed || text);
  const heading = cleanText(title);
  if (!value) return '暂无摘要';
  if (heading && (value === heading || value === `B站视频 ${heading}`)) {
    return `「${heading}」已入库。源站简介有限，完整 AI 摘要将在正文更充足后生成。`;
  }
  if (/^B站视频\s+BV/i.test(value) && value.length < 40) {
    return '视频已入库。完整简介与 AI 摘要待源站数据可用后补全。';
  }
  return value.length > 140 ? `${value.slice(0, 140)}…` : value;
}
