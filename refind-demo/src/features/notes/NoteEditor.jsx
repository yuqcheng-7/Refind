import { ArrowDown, ArrowUp, Bold, ChevronLeft, GripVertical, Italic, Link2, List, ListOrdered, Maximize2, PanelBottomClose, PanelBottomOpen, Plus, Quote, Redo2, Trash2, Undo2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { generateNoteDocument } from './noteState.js';
import { CardDetailDialog } from './NoteDialogs.jsx';

const toolbarItems = [
  { label: '加粗', icon: Bold, command: 'bold' },
  { label: '斜体', icon: Italic, command: 'italic' },
  { label: '项目符号列表', icon: List, command: 'insertUnorderedList' },
  { label: '编号列表', icon: ListOrdered, command: 'insertOrderedList' },
  { label: '引用', icon: Quote, command: 'formatBlock', value: 'blockquote' },
  { label: '插入链接', icon: Link2, command: 'createLink' },
];

function CitationButton({ index, label, card, onOpenCard }) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState('end');
  const hideTimer = useRef(null);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);

  const showMenu = () => {
    window.clearTimeout(hideTimer.current);
    setOpen(true);
  };
  const hideMenu = () => {
    hideTimer.current = window.setTimeout(() => setOpen(false), 140);
  };

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  useEffect(() => {
    if (!open) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const menu = menuRef.current?.getBoundingClientRect();
      const wrap = wrapRef.current?.getBoundingClientRect();
      if (!menu || !wrap) return;
      const pad = 16;
      const width = menu.width;
      const endLeft = wrap.right - width;
      const startRight = wrap.left + width;
      if (endLeft >= pad) setAlign('end');
      else if (startRight <= window.innerWidth - pad) setAlign('start');
      else setAlign('end');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  return (
    <span
      ref={wrapRef}
      className="note-editor__citation-wrap"
      onMouseEnter={showMenu}
      onMouseLeave={hideMenu}
    >
      <button
        type="button"
        className="note-editor__citation"
        aria-label={`${label} 引用`}
        aria-expanded={open}
        onClick={() => {
          if (card) onOpenCard?.(card);
        }}
      >
        [{index}]
      </button>
      {open && (
        <button
          ref={menuRef}
          type="button"
          className={`note-editor__citation-menu note-editor__citation-menu--${align}`}
          onMouseEnter={showMenu}
          onMouseLeave={hideMenu}
          onClick={() => {
            if (card) onOpenCard?.(card);
            setOpen(false);
          }}
        >
          <span className="note-editor__citation-menu-source">{card?.sourceLabel || label}</span>
          <strong>{card?.contentSnapshot || label}</strong>
          {card?.questionSnapshot ? <p>{card.questionSnapshot}</p> : null}
          <span className="note-editor__citation-menu-hint">点击查看灵感卡片</span>
        </button>
      )}
    </span>
  );
}

function MaterialsPanel({ cards, thoughts, onReorder, onThoughtChange, onRemove }) {
  return <section className="materials-drawer" aria-label="素材面板">
    <header><div><span className="eyebrow">写作素材</span><h2>已选灵感卡片</h2></div><span>{cards.length} 张</span></header>
    <div className="materials-drawer__list">{cards.map((card, index) => <article className="material-card" data-testid="material-card" data-card-id={card.id} key={card.id}>
      <div className="material-card__order"><GripVertical size={16} /><span>{index + 1}</span></div>
      <div className="material-card__content"><p>{card.contentSnapshot}</p><small>{card.sourceLabel || (card.answerMode === 'rag' ? '知识库回答' : '首页通用 AI')}</small><label>我的想法<textarea value={thoughts[card.id] || ''} onChange={(event) => onThoughtChange(card.id, event.target.value)} placeholder="可选：补充你的看法或写作角度" /></label></div>
      <div className="material-card__actions"><button type="button" aria-label={`上移 ${card.id}`} disabled={index === 0} onClick={() => onReorder(index, index - 1)}><ArrowUp size={14} /></button><button type="button" aria-label={`下移 ${card.id}`} disabled={index === cards.length - 1} onClick={() => onReorder(index, index + 1)}><ArrowDown size={14} /></button><button type="button" aria-label={`移除 ${card.id}`} onClick={() => onRemove(card.id)}><Trash2 size={14} /></button></div>
    </article>)}</div>
  </section>;
}

export function NoteEditor({
  note,
  onChange,
  mode = 'plain',
  showMaterials,
  cards = [],
  onAttachCards,
  onGenerate,
  onAddToNote,
  onDeleteCard,
  onBack,
  onEnterFullscreen,
}) {
  const isFullscreen = mode === 'inspiration';
  const materialsEnabled = showMaterials ?? isFullscreen;
  const [saveState, setSaveState] = useState('已保存');
  const [activeTool, setActiveTool] = useState(null);
  const [panelOpen, setPanelOpen] = useState(materialsEnabled);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [revisions, setRevisions] = useState([]);
  const [detailCard, setDetailCard] = useState(null);
  const bodyRef = useRef(null);
  const syncTokenRef = useRef(`${note.id}:${note.content?.text || ''}`);
  const selectedCards = useMemo(() => note.inspirationCardIds.map((id) => cards.find((card) => card.id === id)).filter(Boolean), [note.inspirationCardIds, cards]);
  const availableCards = cards.filter((card) => !note.inspirationCardIds.includes(card.id));

  useEffect(() => {
    setSaveState('已保存');
    setUndoStack([]);
    setRedoStack([]);
    setPanelOpen(materialsEnabled);
  }, [note.id, mode, materialsEnabled]);

  useEffect(() => {
    if (saveState !== '正在保存') return undefined;
    const timer = window.setTimeout(() => setSaveState('已保存'), 550);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  // Keep contentEditable uncontrolled while typing; only sync on note switch / external content changes.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const nextText = note.content?.text || '';
    const token = `${note.id}:${nextText}`;
    const focused = document.activeElement === el;
    if (focused && syncTokenRef.current.startsWith(`${note.id}:`)) return;
    if (el.innerText !== nextText) el.innerText = nextText;
    syncTokenRef.current = token;
  }, [note.id, note.content?.text, generating]);

  const readBody = () => {
    const el = bodyRef.current;
    return el ? (el.innerText || '').replace(/\u00a0/g, ' ') : '';
  };

  const commit = (changes, { record = true } = {}) => {
    if (record) {
      setUndoStack((stack) => [...stack, { title: note.title, content: note.content, inspirationCardIds: note.inspirationCardIds, materialThoughts: note.materialThoughts || {} }]);
      setRedoStack([]);
    }
    setSaveState('正在保存');
    onChange({ ...note, ...changes, updatedLabel: '刚刚编辑' });
  };

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous || generating) return;
    setRedoStack((stack) => [...stack, { title: note.title, content: note.content, inspirationCardIds: note.inspirationCardIds, materialThoughts: note.materialThoughts || {} }]);
    setUndoStack((stack) => stack.slice(0, -1));
    syncTokenRef.current = '';
    commit(previous, { record: false });
  };
  const redo = () => {
    const next = redoStack.at(-1);
    if (!next || generating) return;
    setUndoStack((stack) => [...stack, { title: note.title, content: note.content, inspirationCardIds: note.inspirationCardIds, materialThoughts: note.materialThoughts || {} }]);
    setRedoStack((stack) => stack.slice(0, -1));
    syncTokenRef.current = '';
    commit(next, { record: false });
  };

  const updateBody = () => {
    const text = readBody();
    syncTokenRef.current = `${note.id}:${text}`;
    commit({ content: { ...note.content, text } });
  };

  const applyTool = (item) => {
    if (generating) return;
    const el = bodyRef.current;
    if (!el) return;
    el.focus();
    if (item.command === 'createLink') {
      const url = window.prompt('输入链接地址', 'https://');
      if (!url) return;
      document.execCommand('createLink', false, url);
    } else if (item.command === 'formatBlock') {
      document.execCommand('formatBlock', false, item.value);
    } else {
      document.execCommand(item.command, false);
    }
    setActiveTool(item.label);
    updateBody();
  };

  const reorderCards = (from, to) => {
    const next = [...note.inspirationCardIds];
    [next[from], next[to]] = [next[to], next[from]];
    commit({ inspirationCardIds: next });
  };
  const updateThought = (cardId, thought) => commit({ materialThoughts: { ...(note.materialThoughts || {}), [cardId]: thought } });
  const removeCard = (cardId) => commit({ inspirationCardIds: note.inspirationCardIds.filter((id) => id !== cardId) });
  const attachCard = (cardId) => {
    onAttachCards?.([cardId]);
    setPickerOpen(false);
  };
  const generate = () => {
    if (!selectedCards.length || generating) return;
    setGenerating(true);
    setRevisions((items) => [...items, { title: note.title, content: note.content }]);
    window.setTimeout(() => {
      const document = generateNoteDocument(note, cards);
      const thoughtText = note.inspirationCardIds.map((id) => note.materialThoughts?.[id]).filter(Boolean).join('\n');
      const next = thoughtText ? { ...document, text: `${document.text}\n\n${thoughtText}` } : document;
      syncTokenRef.current = '';
      commit({ content: next });
      onGenerate?.(next);
      setGenerating(false);
      if (!navigator.userAgent.includes('jsdom')) window.scrollTo?.({ top: 0, behavior: 'smooth' });
      window.requestAnimationFrame(() => bodyRef.current?.focus());
    }, 700);
  };
  const sections = note.content.sections;
  const hasSections = Array.isArray(sections) && sections.length > 0;

  return (
    <article className={`note-editor ${isFullscreen ? 'note-editor--inspiration' : ''}`}>
      <div className="note-editor__toolbar" aria-label="笔记工具栏">
        <div className="note-editor__toolbar-left">
          {isFullscreen && (
            <button type="button" className="note-editor__back" onClick={onBack}>
              <ChevronLeft size={17} />
              返回笔记
            </button>
          )}
          {!isFullscreen && onEnterFullscreen && (
            <button type="button" className="note-editor__fullscreen" aria-label="全屏编辑" title="全屏编辑" onClick={onEnterFullscreen}>
              <Maximize2 size={15} />
            </button>
          )}
          <span className={`note-editor__save-state ${saveState === '正在保存' ? 'is-saving' : ''}`} aria-live="polite">{saveState}</span>
        </div>
        <div className="note-editor__tool-list">
          <button type="button" className="note-editor__tool" title="撤销" aria-label="撤销" disabled={!undoStack.length || generating} onClick={undo}><Undo2 size={16} /></button>
          <button type="button" className="note-editor__tool" title="重做" aria-label="重做" disabled={!redoStack.length || generating} onClick={redo}><Redo2 size={16} /></button>
          {toolbarItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                className={`note-editor__tool ${activeTool === item.label ? 'is-active' : ''}`}
                title={item.label}
                aria-label={item.label}
                aria-pressed={activeTool === item.label}
                disabled={generating}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyTool(item)}
              >
                <Icon size={16} />
              </button>
            );
          })}
        </div>
        {isFullscreen && materialsEnabled && (
          <div className="note-editor__inspiration-actions">
            <button type="button" onClick={() => setPickerOpen((open) => !open)} disabled={generating}><Plus size={15} />添加灵感卡片</button>
            <button type="button" onClick={() => setPanelOpen((open) => !open)} disabled={generating}>
              {panelOpen ? <PanelBottomClose size={15} /> : <PanelBottomOpen size={15} />}
              素材面板
            </button>
            <button type="button" className="note-editor__generate" disabled={!selectedCards.length || generating} onClick={generate}>
              {generating ? '生成中' : '生成笔记'}
            </button>
            {pickerOpen && (
              <div className="note-editor__card-picker" role="menu">
                <header>
                  <strong>添加灵感卡片</strong>
                  <button type="button" aria-label="关闭添加卡片" onClick={() => setPickerOpen(false)}><X size={14} /></button>
                </header>
                {availableCards.length
                  ? availableCards.map((card) => <button type="button" role="menuitem" key={card.id} onClick={() => attachCard(card.id)}>{card.contentSnapshot}</button>)
                  : <p>没有更多可添加的卡片。</p>}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="note-editor__document">
        <input className="note-editor__title" aria-label="笔记标题" disabled={generating} value={note.title} onChange={(event) => commit({ title: event.target.value })} />
        {hasSections ? (
          <div className="note-editor__rich-body note-editor__rich-body--sections" aria-label="笔记正文">
            {sections.map((section, index) => (
              <p key={`${section.text}-${index}`}>
                <span>{section.text}</span>
                {section.citationLabel ? (
                  <CitationButton
                    index={section.citationIndex || index + 1}
                    label={section.citationLabel}
                    card={
                      cards.find((item) => item.id === section.cardId)
                      || cards.find((item) => item.id === note.inspirationCardIds[(section.citationIndex || 1) - 1])
                    }
                    onOpenCard={setDetailCard}
                  />
                ) : null}
              </p>
            ))}
          </div>
        ) : (
          <div
            className="note-editor__rich-body"
            ref={bodyRef}
            role="textbox"
            aria-label="笔记正文"
            aria-multiline="true"
            aria-disabled={generating}
            contentEditable={!generating}
            suppressContentEditableWarning
            onInput={updateBody}
            data-placeholder="开始记录你的想法…"
          />
        )}
      </div>
      {isFullscreen && materialsEnabled && panelOpen && (
        <MaterialsPanel cards={selectedCards} thoughts={note.materialThoughts || {}} onReorder={reorderCards} onThoughtChange={updateThought} onRemove={removeCard} />
      )}
      {isFullscreen && materialsEnabled && revisions.length > 0 && (
        <span className="note-editor__revision" aria-live="polite">已保留生成前版本，可用撤销返回。</span>
      )}
      <CardDetailDialog
        card={detailCard}
        onClose={() => setDetailCard(null)}
        onAddToNote={(card) => {
          onAddToNote?.(card);
          setDetailCard(null);
        }}
        onDelete={(card) => {
          onDeleteCard?.(card.id);
          setDetailCard(null);
        }}
      />
    </article>
  );
}
