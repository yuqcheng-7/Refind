import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Palette,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { applyNoteStyle, getActiveNoteStyleId } from './noteStyleCommands.js';
import { NOTE_STYLE_MENU } from './noteTypography.js';

const TEXT_COLORS = [
  { label: '默认黑', value: '#1D2129' },
  { label: '灰', value: '#4E5969' },
  { label: '红', value: '#C2410C' },
  { label: '橙', value: '#D97706' },
  { label: '绿', value: '#059669' },
  { label: '蓝', value: '#2563EB' },
];

const HIGHLIGHT_COLORS = [
  { label: '无', value: null },
  { label: '黄', value: '#FEF08A' },
  { label: '绿', value: '#BBF7D0' },
  { label: '蓝', value: '#BFDBFE' },
  { label: '粉', value: '#FBCFE8' },
];

function ToolButton({ label, active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      className={`note-editor__tool${active ? ' is-active' : ''}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function NoteEditorToolbar({ editor, disabled = false }) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!editor) return undefined;
    const refresh = () => tick((n) => n + 1);
    editor.on('selectionUpdate', refresh);
    editor.on('transaction', refresh);
    return () => {
      editor.off('selectionUpdate', refresh);
      editor.off('transaction', refresh);
    };
  }, [editor]);

  if (!editor) return null;

  const styleId = getActiveNoteStyleId(editor);
  const canUndo = editor.can().undo();
  const canRedo = editor.can().redo();

  const setLink = () => {
    const previous = editor.getAttributes('link').href || '';
    const url = window.prompt('输入链接地址', previous);
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  return (
    <div className="note-editor__tool-list note-editor__tool-list--rich" role="toolbar" aria-label="富文本工具">
      <ToolButton label="撤销" disabled={disabled || !canUndo} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 size={15} />
      </ToolButton>
      <ToolButton label="重做" disabled={disabled || !canRedo} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 size={15} />
      </ToolButton>

      <label className="note-editor__style-select">
        <span className="sr-only">段落样式</span>
        <select
          aria-label="段落样式"
          disabled={disabled}
          value={styleId}
          onChange={(event) => applyNoteStyle(editor, event.target.value)}
        >
          {NOTE_STYLE_MENU.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </label>

      <ToolButton label="加粗" disabled={disabled} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold size={15} />
      </ToolButton>
      <ToolButton label="斜体" disabled={disabled} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic size={15} />
      </ToolButton>
      <ToolButton label="下划线" disabled={disabled} active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon size={15} />
      </ToolButton>
      <ToolButton label="删除线" disabled={disabled} active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough size={15} />
      </ToolButton>

      <label className="note-editor__color-select" title="字体颜色">
        <Palette size={15} aria-hidden />
        <span className="sr-only">字体颜色</span>
        <select
          aria-label="字体颜色"
          disabled={disabled}
          value={editor.getAttributes('textStyle').color || '#1D2129'}
          onChange={(event) => {
            const value = event.target.value;
            if (value === '#1D2129') editor.chain().focus().unsetColor().run();
            else editor.chain().focus().setColor(value).run();
          }}
        >
          {TEXT_COLORS.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </label>

      <label className="note-editor__color-select" title="高亮">
        <Highlighter size={15} aria-hidden />
        <span className="sr-only">高亮</span>
        <select
          aria-label="高亮"
          disabled={disabled}
          value={editor.getAttributes('highlight').color || ''}
          onChange={(event) => {
            const value = event.target.value;
            if (!value) editor.chain().focus().unsetHighlight().run();
            else editor.chain().focus().toggleHighlight({ color: value }).run();
          }}
        >
          {HIGHLIGHT_COLORS.map((item) => (
            <option key={item.label} value={item.value || ''}>{item.label}</option>
          ))}
        </select>
      </label>

      <ToolButton label="左对齐" disabled={disabled} active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
        <AlignLeft size={15} />
      </ToolButton>
      <ToolButton label="居中" disabled={disabled} active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
        <AlignCenter size={15} />
      </ToolButton>
      <ToolButton label="右对齐" disabled={disabled} active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
        <AlignRight size={15} />
      </ToolButton>

      <ToolButton label="无序列表" disabled={disabled} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List size={15} />
      </ToolButton>
      <ToolButton label="有序列表" disabled={disabled} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered size={15} />
      </ToolButton>
      <ToolButton label="引用" disabled={disabled} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote size={15} />
      </ToolButton>
      <ToolButton label="链接" disabled={disabled} active={editor.isActive('link')} onClick={setLink}>
        <Link2 size={15} />
      </ToolButton>
    </div>
  );
}

export function noteToolbarStyleLabels() {
  return NOTE_STYLE_MENU.map((item) => item.label);
}
