import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect } from 'react';
import { createNoteExtensions } from './noteSchema.js';
import { normalizePastedHtml } from './noteContentCodec.js';
import { NoteEditorToolbar } from './NoteEditorToolbar.jsx';
import './noteTypography.css';

/**
 * TipTap note body + toolbar.
 */
export function NoteRichEditor({
  contentHtml = '',
  editable = true,
  placeholder = '开始记录…',
  onUpdate,
  onReady,
  editorRef,
  className = '',
  showToolbar = true,
}) {
  const editor = useEditor({
    extensions: createNoteExtensions({ placeholder }),
    content: contentHtml || '<p data-body="body1"></p>',
    editable,
    autofocus: false,
    editorProps: {
      attributes: {
        class: 'note-rich-editor__prose',
        spellcheck: 'false',
        'aria-label': '笔记正文',
        role: 'textbox',
      },
      transformPastedHTML: (html) => normalizePastedHtml(html),
    },
    onUpdate: ({ editor: current, transaction }) => {
      if (!transaction?.docChanged) return;
      onUpdate?.({
        html: current.getHTML(),
        text: current.getText(),
        json: current.getJSON(),
      });
    },
  });

  useEffect(() => {
    if (!editorRef) return undefined;
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);

  useEffect(() => {
    onReady?.(editor || null);
  }, [editor, onReady]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    const next = contentHtml || '<p data-body="body1"></p>';
    if (next === editor.getHTML()) return;
    if (editor.isFocused) return;
    editor.commands.setContent(next, false);
  }, [editor, contentHtml]);

  return (
    <div className={`note-rich-editor ${className}`.trim()} data-testid="note-rich-editor">
      {showToolbar ? <NoteEditorToolbar editor={editor} disabled={!editable} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}
