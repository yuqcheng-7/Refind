/**
 * Prefetch Zhihu content via the user's browser (拾藏连接).
 * Hosted parser IPs are often blocked even with valid cookies; first-party
 * APIs from the extension's residential network succeed when the user is logged in.
 */

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlToText(html) {
  return cleanText(
    String(html || '')
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' '),
  );
}

export function zhihuArticleId(url) {
  const text = String(url || '');
  const match = text.match(/zhuanlan\.zhihu\.com\/p\/(\d+)|(?:www\.)?zhihu\.com\/p\/(\d+)/i);
  return match?.[1] || match?.[2] || '';
}

export function zhihuQuestionId(url) {
  const match = String(url || '').match(/(?:www\.)?zhihu\.com\/question\/(\d+)/i);
  return match?.[1] || '';
}

export function zhihuAnswerId(url) {
  const text = String(url || '');
  let match = text.match(/(?:www\.)?zhihu\.com\/question\/\d+\/answer\/(\d+)/i);
  if (match) return match[1];
  match = text.match(/(?:www\.)?zhihu\.com\/answer\/(\d+)/i);
  return match?.[1] || '';
}

function authorName(payload) {
  const author = payload?.author;
  if (author && typeof author === 'object') return cleanText(author.name || '');
  return '';
}

function resultFromFields({ title, htmlContent, excerpt = '', author = '', canonical = '' }) {
  const textBody = htmlContent ? htmlToText(htmlContent) : cleanText(excerpt);
  const t = cleanText(title);
  if (!t && !textBody) return null;
  if (/没有知识存在的荒原|安全验证|请先登录|404\s*-\s*知乎|^知乎$|^验证码/.test(t) && textBody.length < 40) {
    return null;
  }
  return {
    platform: 'zhihu',
    title: t || '知乎内容',
    author_name: author,
    caption_text: '',
    content_text: textBody,
    summary: textBody.slice(0, 240),
    cover_image_url: '',
    quality: textBody.length >= 80 ? 'full' : 'partial',
    canonical_url: canonical,
    session_mode: 'extension',
    used_saved_session: true,
  };
}

/**
 * @param {string} sourceUrl
 * @param {(url: string, opts?: { accept?: string }) => Promise<{ text: string, finalUrl?: string }>} fetchJson
 */
export async function prefetchZhihuViaBrowserApi(sourceUrl, fetchJson) {
  const articleId = zhihuArticleId(sourceUrl);
  if (articleId) {
    const page = await fetchJson(`https://zhuanlan.zhihu.com/api/articles/${articleId}`, {
      accept: 'application/json',
    });
    const body = JSON.parse(page.text);
    return resultFromFields({
      title: body?.title || '',
      htmlContent: body?.content || '',
      excerpt: body?.excerpt || '',
      author: authorName(body),
      canonical: body?.url || `https://zhuanlan.zhihu.com/p/${articleId}`,
    });
  }

  const answerId = zhihuAnswerId(sourceUrl);
  const questionId = zhihuQuestionId(sourceUrl);
  if (answerId) {
    const api = `https://www.zhihu.com/api/v4/answers/${answerId}?include=content,author,question,question.title,excerpt`;
    const page = await fetchJson(api, { accept: 'application/json' });
    const body = JSON.parse(page.text);
    const question = body?.question && typeof body.question === 'object' ? body.question : {};
    const qid = String(question.id || questionId || '').trim();
    const title = cleanText(question.title || '') || `知乎回答 ${answerId}`;
    return resultFromFields({
      title,
      htmlContent: body?.content || '',
      excerpt: body?.excerpt || '',
      author: authorName(body),
      canonical: qid
        ? `https://www.zhihu.com/question/${qid}/answer/${answerId}`
        : `https://www.zhihu.com/answer/${answerId}`,
    });
  }

  if (questionId) {
    const api = (
      `https://www.zhihu.com/api/v4/questions/${questionId}/answers`
      + '?include=data[*].is_normal,content,excerpt,author,question,question.title,voteup_count'
      + '&limit=5&offset=0&sort_by=default'
    );
    const page = await fetchJson(api, { accept: 'application/json' });
    const body = JSON.parse(page.text);
    const answers = Array.isArray(body?.data) ? body.data : [];
    if (!answers.length) return null;
    let title = '';
    const chunks = [];
    const authors = [];
    for (let i = 0; i < Math.min(5, answers.length); i += 1) {
      const item = answers[i];
      if (!item || typeof item !== 'object') continue;
      if (!title) {
        const q = item.question && typeof item.question === 'object' ? item.question : {};
        title = cleanText(q.title || '');
      }
      const author = authorName(item) || `回答${i + 1}`;
      authors.push(author);
      const text = htmlToText(item.content || '') || cleanText(item.excerpt || '');
      if (!text) continue;
      chunks.push(`【${author}】\n${text}`);
    }
    if (!chunks.length) return null;
    const combined = chunks.join('\n\n');
    return {
      platform: 'zhihu',
      title: title || `知乎问题 ${questionId}`,
      author_name: authors.length === 1 ? authors[0] : '',
      caption_text: '',
      content_text: combined,
      summary: combined.slice(0, 240),
      cover_image_url: '',
      quality: combined.length >= 80 ? 'full' : 'partial',
      canonical_url: `https://www.zhihu.com/question/${questionId}`,
      session_mode: 'extension',
      used_saved_session: true,
    };
  }

  return null;
}
