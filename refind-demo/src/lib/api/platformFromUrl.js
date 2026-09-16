export function inferPlatformFromUrl(sourceUrl) {
  if (!sourceUrl) return 'web';
  let hostname = '';
  try {
    hostname = new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    return 'web';
  }

  if (/(^|\.)xiaohongshu\.com$|(^|\.)xhslink\.com$/.test(hostname)) return 'xhs';
  if (/(^|\.)douyin\.com$|(^|\.)iesdouyin\.com$|(^|\.)v\.douyin\.com$/.test(hostname)) return 'douyin';
  if (/(^|\.)zhihu\.com$/.test(hostname)) return 'zhihu';
  if (/(^|\.)bilibili\.com$|(^|\.)b23\.tv$/.test(hostname)) return 'bilibili';
  if (/(^|\.)mp\.weixin\.qq\.com$/.test(hostname)) return 'wechat_mp';
  return 'web';
}
