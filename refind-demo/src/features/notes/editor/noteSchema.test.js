import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import {
  applyNoteStyle,
  createNoteExtensions,
  getActiveNoteStyleId,
} from './noteSchema.js';

function makeEditor(html = '<p data-body="body1">你好</p>') {
  return new Editor({
    extensions: createNoteExtensions(),
    content: html,
  });
}

describe('noteSchema', () => {
  it('defaults paragraph body to body1', () => {
    const editor = makeEditor('<p>纯段落</p>');
    editor.commands.focus('start');
    expect(getActiveNoteStyleId(editor)).toBe('body1');
    editor.destroy();
  });

  it('applies heading and body styles', () => {
    const editor = makeEditor();
    applyNoteStyle(editor, 'h2');
    expect(getActiveNoteStyleId(editor)).toBe('h2');
    applyNoteStyle(editor, 'body2');
    expect(getActiveNoteStyleId(editor)).toBe('body2');
    expect(editor.getHTML()).toContain('data-body="body2"');
    editor.destroy();
  });

  it('supports underline color highlight and align extensions', () => {
    const editor = makeEditor();
    editor.chain().focus().selectAll().setUnderline().setColor('#2563EB').toggleHighlight({ color: '#FEF08A' }).setTextAlign('center').run();
    expect(editor.isActive('underline')).toBe(true);
    expect(editor.getAttributes('textStyle').color).toBe('#2563EB');
    expect(editor.isActive('highlight')).toBe(true);
    expect(editor.isActive({ textAlign: 'center' })).toBe(true);
    editor.destroy();
  });
});
