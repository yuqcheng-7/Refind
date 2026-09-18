/**
 * Build downloadable note payloads for context-menu export.
 */

export function notePlainText(note = {}) {
  const title = String(note.title || '未命名笔记').trim();
  const body = String(note.content?.text || '').trim();
  if (!body && Array.isArray(note.content?.sections) && note.content.sections.length) {
    const fromSections = note.content.sections.map((section) => section?.text || '').filter(Boolean).join('\n\n');
    return `${title}\n\n${fromSections}`.trim();
  }
  return body ? `${title}\n\n${body}` : title;
}

export function noteMarkdown(note = {}) {
  const title = String(note.title || '未命名笔记').trim();
  const html = String(note.content?.html || '').trim();
  let body = String(note.content?.text || '').trim();
  if (!body && Array.isArray(note.content?.sections)) {
    body = note.content.sections.map((section) => section?.text || '').filter(Boolean).join('\n\n');
  }
  if (html) {
    // Lightweight HTML → markdown-ish for export (headings / paragraphs)
    body = html
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n')
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n')
      .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '> $1\n\n')
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return `# ${title}\n\n${body}`.trim();
}

export function downloadNoteFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function safeNoteFilename(title, ext) {
  const base = String(title || '未命名笔记')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .trim() || '未命名笔记';
  return `${base}.${ext}`;
}
