import { Editor } from '@tiptap/core';
import { createNoteExtensions } from './noteSchema.js';
import { NOTE_DEFAULT_STYLE_ID } from './noteTypography.js';

const EMPTY_HTML = '<p data-body="body1"></p>';

/**
 * Strip external paste noise: keep text, force body1 paragraphs / simple marks.
 */
export function normalizePastedHtml(html = '') {
  if (typeof document === 'undefined') {
    return String(html || '')
      .replace(/style="[^"]*"/gi, '')
      .replace(/class="[^"]*"/gi, '')
      || EMPTY_HTML;
  }
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  template.content.querySelectorAll('script,style').forEach((node) => node.remove());
  template.content.querySelectorAll('*').forEach((el) => {
    [...el.attributes].forEach((attr) => {
      if (attr.name === 'href' && el.tagName === 'A') return;
      if (attr.name === 'data-body') return;
      if (attr.name === 'data-citation' || attr.name === 'data-card-id' || attr.name === 'data-label') return;
      el.removeAttribute(attr.name);
    });
  });
  const editor = new Editor({
    extensions: createNoteExtensions(),
    content: template.innerHTML || '<p></p>',
  });
  // Force all paragraphs to body1
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      editor.commands.command(({ tr }) => {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, body: NOTE_DEFAULT_STYLE_ID });
        return true;
      });
    }
  });
  // Convert headings stay; body styles reset via paragraph attrs above
  const out = editor.getHTML() || EMPTY_HTML;
  editor.destroy();
  return out;
}

export function htmlFromNoteContent(content = {}) {
  if (content?.html && String(content.html).trim()) return content.html;
  if (Array.isArray(content?.sections) && content.sections.length) {
    return content.sections.map((section) => {
      if (section?.type === 'heading') {
        const text = escapeHtml(section?.text || '');
        if (!text) return '';
        const level = section.level === 3 ? 3 : 2;
        return `<h${level}>${text}</h${level}>`;
      }
      if (section?.type === 'bullet_list' || section?.type === 'ordered_list') {
        const tag = section.type === 'ordered_list' ? 'ol' : 'ul';
        const items = (Array.isArray(section.items) ? section.items : [])
          .map((item) => String(item || '').trim())
          .filter(Boolean)
          .map((item) => `<li><p data-body="body1">${escapeHtml(item)}</p></li>`)
          .join('');
        return items ? `<${tag}>${items}</${tag}>` : '';
      }
      const text = escapeHtml(section?.text || '');
      if (!text) return '';
      if (section?.cardId != null && section?.citationIndex != null) {
        const labelAttr = section.citationLabel
          ? ` data-label="${escapeAttr(section.citationLabel)}"`
          : '';
        return `<p data-body="body1">${text}<span data-citation="${section.citationIndex}" data-card-id="${escapeAttr(section.cardId)}"${labelAttr}>[${section.citationIndex}]</span></p>`;
      }
      return `<p data-body="body1">${text}</p>`;
    }).filter(Boolean).join('');
  }
  if (content?.text && String(content.text).trim()) {
    return String(content.text)
      .split(/\n+/)
      .map((line) => `<p data-body="body1">${escapeHtml(line)}</p>`)
      .join('');
  }
  return EMPTY_HTML;
}

export function noteContentFromEditor({ html = '', text = '', json = null } = {}) {
  return {
    text: String(text || ''),
    html: html || EMPTY_HTML,
    json: json || null,
    blocks: [],
    sections: [],
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return String(value).replace(/"/g, '&quot;');
}
