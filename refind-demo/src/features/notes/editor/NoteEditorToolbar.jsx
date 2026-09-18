import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDismissable } from '../../../hooks/useDismissable.js';
import { applyNoteStyle, getActiveNoteStyleId } from './noteStyleCommands.js';
import { getNoteStyleToken, NOTE_FONT_STACK, NOTE_STYLE_MENU } from './noteTypography.js';

const TEXT_COLORS = [
  { label: '默认黑', value: '#1D2129' },
  { label: '灰', value: '#4E5969' },
  { label: '红', value: '#C2410C' },
  { label: '橙', value: '#D97706' },
  { label: '绿', value: '#059669' },
  { label: '蓝', value: '#2563EB' },
];

const HIGHLIGHT_COLORS = [
  { label: '无高亮', value: null },
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

function ColorSwatchPicker({
  label,
  disabled,
  colors,
  value,
  onPick,
  kind = 'text',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuId = useId();

  useDismissable({ open, onClose: () => setOpen(false), rootRef });

  const active = colors.find((item) => (item.value || '') === (value || '')) || colors[0];
  const swatch = active?.value;

  return (
    <div className="note-editor__swatch-picker" ref={rootRef}>
      <button
        type="button"
        className={`note-editor__tool note-editor__swatch-trigger${open ? ' is-active' : ''}`}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={`note-editor__swatch-preview note-editor__swatch-preview--${kind}${swatch ? '' : ' is-empty'}`}
          style={swatch ? (kind === 'text' ? { color: swatch } : { background: swatch }) : undefined}
          aria-hidden
        >
          {kind === 'text' ? 'A' : null}
        </span>
      </button>
      {open ? (
        <div id={menuId} className="note-editor__swatch-menu" role="listbox" aria-label={label}>
          {colors.map((item) => {
            const selected = (item.value || '') === (value || '');
            return (
              <button
                key={item.label}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={item.label}
                title={item.label}
                className={`note-editor__swatch${selected ? ' is-selected' : ''}${item.value ? '' : ' is-none'}`}
                style={item.value ? { background: item.value } : undefined}
                disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onPick(item.value);
                  setOpen(false);
                }}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function StyleSelect({ disabled, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();
  const active = NOTE_STYLE_MENU.find((item) => item.id === value) || NOTE_STYLE_MENU[3];

  useDismissable({ open, onClose: () => setOpen(false), rootRef: menuRef, triggerRef: rootRef });

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return undefined;
    const place = () => {
      const rect = rootRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 6, left: rect.left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  return (
    <div className={`note-editor__style-select${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="note-editor__style-trigger"
        aria-label="段落样式"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{active.label}</span>
      </button>
      {open
        ? createPortal(
          <div
            id={menuId}
            ref={menuRef}
            className="note-editor__style-menu"
            role="listbox"
            aria-label="段落样式"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            {NOTE_STYLE_MENU.map((item) => {
              const selected = item.id === value;
              const token = getNoteStyleToken(item.id);
              const previewSize = Math.max(10, Math.round(Number.parseFloat(token.fontSize) * 0.72));
              const previewLine = Math.max(14, Math.round(Number.parseFloat(token.lineHeight) * 0.72));
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`note-editor__style-option${selected ? ' is-selected' : ''}`}
                  disabled={disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                >
                  <span className="note-editor__style-check" aria-hidden>{selected ? '✓' : ''}</span>
                  <span
                    className="note-editor__style-preview"
                    style={{
                      fontFamily: NOTE_FONT_STACK,
                      fontSize: `${previewSize}px`,
                      fontWeight: token.fontWeight,
                      lineHeight: `${previewLine}px`,
                      color: token.color,
                    }}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body,
        )
        : null}
    </div>
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
  const textColor = editor.getAttributes('textStyle').color || '#1D2129';
  const highlightColor = editor.getAttributes('highlight').color || null;

  return (
    <div className="note-editor__tool-list note-editor__tool-list--rich" role="toolbar" aria-label="富文本工具">
      <ToolButton label="撤销" disabled={disabled || !canUndo} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 size={15} />
      </ToolButton>
      <ToolButton label="重做" disabled={disabled || !canRedo} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 size={15} />
      </ToolButton>

      <StyleSelect
        disabled={disabled}
        value={styleId}
        onChange={(nextId) => applyNoteStyle(editor, nextId)}
      />

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

      <ColorSwatchPicker
        label="字体颜色"
        kind="text"
        disabled={disabled}
        colors={TEXT_COLORS}
        value={textColor}
        onPick={(value) => {
          if (!value || value === '#1D2129') editor.chain().focus().unsetColor().run();
          else editor.chain().focus().setColor(value).run();
        }}
      />

      <ColorSwatchPicker
        label="高亮"
        kind="highlight"
        disabled={disabled}
        colors={HIGHLIGHT_COLORS}
        value={highlightColor}
        onPick={(value) => {
          if (!value) editor.chain().focus().unsetHighlight().run();
          else editor.chain().focus().toggleHighlight({ color: value }).run();
        }}
      />

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
      <ToolButton
        label="引用"
        disabled={disabled}
        active={editor.isActive('blockquote')}
        onClick={() => {
          const chain = editor.chain().focus();
          if (!editor.isActive('blockquote')) {
            chain.unsetColor().unsetHighlight();
          }
          chain.toggleBlockquote().run();
        }}
      >
        <Quote size={15} />
      </ToolButton>
    </div>
  );
}

export function noteToolbarStyleLabels() {
  return NOTE_STYLE_MENU.map((item) => item.label);
}
