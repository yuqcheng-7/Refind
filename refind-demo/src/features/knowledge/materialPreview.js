const VIDEO_PLATFORMS = new Set(['douyin', 'bilibili']);

export function isVideoMaterial(material) {
  return material?.kind === 'link' && VIDEO_PLATFORMS.has(material.platform);
}

export function getPreviewOriginLabel(material) {
  if (!material) return '';
  if (material.kind !== 'link') return '本地上传';
  if (material.url) {
    try {
      return new URL(material.url).hostname.replace(/^www\./, '');
    } catch {
      /* fall through */
    }
  }
  return material.source || '网页';
}

export function getPreviewTypeLabel(material) {
  if (!material) return '';
  if (isVideoMaterial(material)) {
    if (material.platform === 'douyin') return '抖音视频';
    if (material.platform === 'bilibili') return 'B 站视频';
  }
  return material.typeLabel || material.source || (material.kind === 'link' ? '链接' : '文件');
}

export function getPreviewTags(material) {
  if (!material) return [];
  if (Array.isArray(material.tags) && material.tags.length) {
    return material.tags.filter(Boolean);
  }
  return material.tag ? [material.tag] : [];
}

export function isWeakPreviewText(text, title = '') {
  const value = String(text || '').trim();
  const heading = String(title || '').trim();
  if (!value) return true;
  if (heading && value === heading) return true;
  if (/^B站视频\s+BV/i.test(value) && value.length < 48) return true;
  if (/完整简介与 AI 摘要待源站数据可用后补全/.test(value)) return true;
  return false;
}

export function getPreviewSummary(material) {
  const title = material?.title || '';
  const raw = String(material?.summary || '').trim();
  if (!raw || isWeakPreviewText(raw, title)) {
    if (material?.status === 'failed') return material.lastParseError || '解析失败，暂无摘要。';
    if (material?.status === 'processing') return '正在解析，完成后可查看摘要。';
    if (material?.status === 'link_only') return '暂无法生成摘要，已保留为仅链接。';
    const body = String(material?.body || '').trim();
    if (
      body
      && !isWeakPreviewText(body, title)
      && body !== raw
      && !/^已收藏/.test(body)
      && !/源站暂未返回简介/.test(body)
    ) {
      return body.length > 140 ? `${body.slice(0, 140)}…` : body;
    }
    return '暂无可用 AI 摘要。正文更充足后会自动补全。';
  }
  return raw;
}

export function getPreviewCaption(material) {
  const caption = String(material?.caption || '').trim();
  if (caption && !isWeakPreviewText(caption, material?.title)) return caption;
  if (isVideoMaterial(material)) {
    const body = String(material?.body || '').trim();
    if (body && !/^B站视频\s+BV/i.test(body)) return body;
  }
  return '';
}

function normalizePreviewText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\u3000/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Insert breaks before numbered outline markers in a single wall of text. */
function insertSectionBreaks(text) {
  return String(text || '')
    .replace(/(?<=[。！？；.!?\n]|^)\s*(?=[一二三四五六七八九十百千]+[、.．])/g, '\n\n')
    .replace(/(?<=[。！？；.!?\n]|^)\s*(?=[（(][一二三四五六七八九十百千]+[）)])/g, '\n\n')
    .replace(/(?<=[。！？；.!?\n\s]|^)(?=\d{1,2}[\.、．]\s*[^\s\d])/g, '\n\n')
    .replace(/(?<=[。！？；.!?:\n]|^)\s*(?=(?:[•●○◆■▪▫·‧∙]|[-–—*＋+])\s+\S)/g, '\n\n')
    .replace(/(?<=[。！？；.!?:\n]|^)\s*(?=[（(]\d{1,2}[）)]\s*\S)/g, '\n\n')
    .replace(/(?<=[。！？；.!?:\n]|^)\s*(?=\d{1,2}[）)]\s*\S)/g, '\n\n')
    .replace(/(?<=[。！？；.!?:\n]|^)\s*(?=[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]\s*\S)/g, '\n\n');
}

export function isPreviewListItem(line) {
  const text = String(line || '').trim();
  if (!text || text.length > 200) return false;
  if (/^(?:[•●○◆■▪▫·‧∙]|[-–—*＋+])\s+\S/.test(text)) return true;
  if (/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]\s*\S/.test(text)) return true;
  if (/^[（(]\d{1,2}[）)]\s*\S/.test(text)) return true;
  if (/^\d{1,2}[）)]\s*\S/.test(text)) return true;
  return false;
}

export function isPreviewHeading(line) {
  const text = String(line || '').trim();
  if (!text || text.length > 48) return false;
  if (/^[一二三四五六七八九十百千]+[、.．]/.test(text)) return true;
  if (/^[（(][一二三四五六七八九十百千]+[）)]/.test(text)) return true;
  if (/^\d{1,2}[\.、．]\s*\S/.test(text)) return true;
  return false;
}

function expandStructuralLines(chunk) {
  const lines = String(chunk || '')
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean);
  if (lines.length <= 1) return lines;

  const parts = [];
  let buffer = [];
  const flush = () => {
    if (!buffer.length) return;
    parts.push(buffer.join('\n'));
    buffer = [];
  };

  for (const line of lines) {
    if (isPreviewHeading(line) || isPreviewListItem(line)) {
      flush();
      parts.push(line);
      continue;
    }
    buffer.push(line);
  }
  flush();
  return parts;
}

export function splitReadableParagraphs(text) {
  const value = normalizePreviewText(insertSectionBreaks(text));
  if (!value) return [];

  const expandChunks = (chunks) => chunks.flatMap((chunk) => expandStructuralLines(chunk));

  const byBlank = value.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const expandedBlank = expandChunks(byBlank);
  if (expandedBlank.length >= 2) return expandedBlank;

  // Scraped bodies often keep only single newlines between paragraphs.
  const bySentenceBreak = value
    .replace(/([。！？；.!?;」』）\]])\s*\n(?!\n)/g, '$1\n\n')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const expandedSentence = expandChunks(bySentenceBreak);
  if (expandedSentence.length >= 2) return expandedSentence;

  const lines = value.split('\n').map((part) => part.trim()).filter(Boolean);
  if (lines.length >= 3) return expandChunks(lines);

  return expandedBlank.length ? expandedBlank : [value];
}

const IMAGE_APPENDIX_HEADER = '【文内图片识别】';

export function splitPreviewBodyAndImageAppendix(text = '') {
  const value = String(text || '');
  const at = value.indexOf(IMAGE_APPENDIX_HEADER);
  if (at < 0) return { body: value.trim(), appendix: '' };
  return {
    body: value.slice(0, at).trim(),
    appendix: value.slice(at).trim(),
  };
}

export function buildReadableBlocks(text) {
  const value = String(text || '');
  if (!value.trim()) return [];

  const segments = [];
  const imageRe = /!\[[^\]]*]\(storage:([^)\s]+)\)/g;
  let lastIndex = 0;
  let match = imageRe.exec(value);
  while (match) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: value.slice(lastIndex, match.index) });
    }
    const storageKey = String(match[1] || '').trim();
    if (storageKey) segments.push({ type: 'image', storageKey });
    lastIndex = match.index + match[0].length;
    match = imageRe.exec(value);
  }
  if (lastIndex < value.length) {
    segments.push({ type: 'text', text: value.slice(lastIndex) });
  }
  if (!segments.length) {
    segments.push({ type: 'text', text: value });
  }

  const blocks = [];
  for (const segment of segments) {
    if (segment.type === 'image') {
      blocks.push({ type: 'image', storageKey: segment.storageKey });
      continue;
    }
    for (const line of splitReadableParagraphs(segment.text)) {
      blocks.push({
        type: isPreviewHeading(line) ? 'heading' : 'paragraph',
        text: line,
      });
    }
  }
  return blocks;
}


export function getBilibiliEmbedUrl(sourceUrl) {
  if (!sourceUrl) return '';
  const bv = String(sourceUrl).match(/\b(BV[\w]+)\b/i)?.[1];
  if (bv) return `https://player.bilibili.com/player.html?bvid=${bv}&autoplay=0`;
  try {
    const url = new URL(sourceUrl);
    const aidMatch = url.pathname.match(/\/video\/av(\d+)/i);
    const aid = aidMatch?.[1] || url.searchParams.get('aid');
    if (aid) return `https://player.bilibili.com/player.html?aid=${aid}&autoplay=0`;
  } catch {
    return '';
  }
  return '';
}

export function getVideoPlayback(material) {
  if (!isVideoMaterial(material)) return null;
  if (material.playbackEmbedHtml) {
    return { mode: 'html', html: material.playbackEmbedHtml };
  }
  if (material.playbackUrl) {
    return { mode: 'iframe', src: material.playbackUrl };
  }
  if (material.platform === 'bilibili') {
    const embed = getBilibiliEmbedUrl(material.url);
    if (embed) return { mode: 'iframe', src: embed };
  }
  return { mode: 'external', url: material.url || '' };
}
