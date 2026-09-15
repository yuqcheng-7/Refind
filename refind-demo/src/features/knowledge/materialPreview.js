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

export function splitReadableParagraphs(text) {
  const value = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!value) return [];

  const byBlank = value.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (byBlank.length > 1) return byBlank;

  const byLine = value.split('\n').map((part) => part.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine;

  const bySentence = value
    .split(/(?<=[。！？；])\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (bySentence.length > 1) {
    const grouped = [];
    for (let index = 0; index < bySentence.length; index += 2) {
      grouped.push(bySentence.slice(index, index + 2).join(''));
    }
    return grouped;
  }

  return [value];
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
