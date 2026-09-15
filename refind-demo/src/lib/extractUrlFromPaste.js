/** Extract the first http(s) URL from pasted share text. */
export function extractUrlFromPaste(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  try {
    const direct = new URL(text);
    if (direct.protocol === 'http:' || direct.protocol === 'https:') return direct.href;
  } catch {
    /* fall through to embedded URL search */
  }

  const match = text.match(/https?:\/\/[^\s<>"'\u4e00-\u9fff【】（）()]+/i);
  if (!match) return '';
  return match[0].replace(/[),.;!?。，、！？]+$/g, '');
}

export function isHttpUrlLike(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

export function splitPasteLink(value) {
  const raw = String(value || '').trim();
  const url = extractUrlFromPaste(raw);
  if (!url) return { url: '', title: isHttpUrlLike(raw) ? '' : raw };
  const title = raw.replace(url, '').replace(/\s+/g, ' ').trim();
  // Never use the raw URL as the display title.
  return { url, title: isHttpUrlLike(title) ? '' : title };
}
