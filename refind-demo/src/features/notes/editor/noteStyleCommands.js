import { NOTE_DEFAULT_STYLE_ID } from './noteTypography.js';

/** Apply one of the six styles to the current selection / block. */
export function applyNoteStyle(editor, styleId) {
  if (!editor) return;
  if (styleId === 'h1') {
    editor.chain().focus().setHeading({ level: 1 }).run();
    return;
  }
  if (styleId === 'h2') {
    editor.chain().focus().setHeading({ level: 2 }).run();
    return;
  }
  if (styleId === 'h3') {
    editor.chain().focus().setHeading({ level: 3 }).run();
    return;
  }
  const body = ['body1', 'body2', 'body3'].includes(styleId) ? styleId : NOTE_DEFAULT_STYLE_ID;
  editor.chain().focus().setParagraph().updateAttributes('paragraph', { body }).run();
}

export function getActiveNoteStyleId(editor) {
  if (!editor) return NOTE_DEFAULT_STYLE_ID;
  if (editor.isActive('heading', { level: 1 })) return 'h1';
  if (editor.isActive('heading', { level: 2 })) return 'h2';
  if (editor.isActive('heading', { level: 3 })) return 'h3';
  if (editor.isActive('paragraph')) {
    const body = editor.getAttributes('paragraph').body;
    if (body === 'body2' || body === 'body3') return body;
    return 'body1';
  }
  return NOTE_DEFAULT_STYLE_ID;
}
