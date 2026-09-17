import { ArrowDown, ArrowUp, ChevronLeft, GripVertical, Maximize2, PanelBottomClose, PanelBottomOpen, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CardDetailDialog } from './NoteDialogs.jsx';
import { NoteEditorToolbar } from './editor/NoteEditorToolbar.jsx';
import { NoteRichEditor } from './editor/NoteRichEditor.jsx';
import { htmlFromNoteContent, noteContentFromEditor } from './editor/noteContentCodec.js';

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
  return (
    <section className="materials-drawer" aria-label="素材面板">
      <header>
        <div>
          <span className="eyebrow">写作素材</span>
          <h2>已选灵感卡片</h2>
        </div>
        <span>{cards.length} 张</span>
      </header>
      <div className="materials-drawer__list">
        {cards.map((card, index) => (
          <article className="material-card" data-testid="material-card" data-card-id={card.id} key={card.id}>
            <div className="material-card__order">
              <GripVertical size={16} />
              <span>{index + 1}</span>
            </div>
            <div className="material-card__content">
              <p>{card.contentSnapshot}</p>
              <small>{card.sourceLabel || (card.answerMode === 'rag' ? '知识库回答' : '首页通用 AI')}</small>
              <label>
                我的想法
                <textarea
                  value={thoughts[card.id] || ''}
                  onChange={(event) => onThoughtChange(card.id, event.target.value)}
                  placeholder="可选：补充你的看法或写作角度"
                />
              </label>
            </div>
            <div className="material-card__actions">
              <button type="button" aria-label={`上移 ${card.id}`} disabled={index === 0} onClick={() => onReorder(index, index - 1)}>
                <ArrowUp size={14} />
              </button>
              <button type="button" aria-label={`下移 ${card.id}`} disabled={index === cards.length - 1} onClick={() => onReorder(index, index + 1)}>
                <ArrowDown size={14} />
              </button>
              <button type="button" aria-label={`移除 ${card.id}`} onClick={() => onRemove(card.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function NoteEditor({
  note,
  onChange,
  onPersist,
  onMaterialsChange,
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
  const [panelOpen, setPanelOpen] = useState(materialsEnabled);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [revisions] = useState([]);
  const [detailCard, setDetailCard] = useState(null);
  const persistTimerRef = useRef(null);
  const pendingPersistRef = useRef(null);
  const onPersistRef = useRef(onPersist);
  const editorRef = useRef(null);
  const [tiptapEditor, setTiptapEditor] = useState(null);
  const lastHtmlRef = useRef(null);

  useEffect(() => {
    onPersistRef.current = onPersist;
  }, [onPersist]);

  const selectedCards = useMemo(
    () => note.inspirationCardIds.map((id) => cards.find((card) => card.id === id)).filter(Boolean),
    [note.inspirationCardIds, cards],
  );
  const availableCards = cards.filter((card) => !note.inspirationCardIds.includes(card.id));
  const sections = note.content?.sections;
  const hasSections = Array.isArray(sections) && sections.length > 0;
  const editorHtml = hasSections
    ? htmlFromNoteContent(note.content)
    : (note.content?.html || htmlFromNoteContent(note.content));

  useEffect(() => {
    setSaveState('已保存');
    setPanelOpen(materialsEnabled);
    lastHtmlRef.current = null;
    setTiptapEditor(null);
  }, [note.id, mode, materialsEnabled]);

  useEffect(() => {
    if (saveState !== '正在保存') return undefined;
    const timer = window.setTimeout(() => setSaveState('已保存'), 550);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  useEffect(() => () => {
    window.clearTimeout(persistTimerRef.current);
    if (pendingPersistRef.current) {
      onPersistRef.current?.(pendingPersistRef.current);
      pendingPersistRef.current = null;
    }
  }, []);

  const commit = (changes) => {
    setSaveState('正在保存');
    const nextNote = { ...note, ...changes, updatedLabel: '刚刚编辑' };
    onChange(nextNote);
    if (changes.title !== undefined || changes.content !== undefined) {
      pendingPersistRef.current = nextNote;
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = window.setTimeout(() => {
        const pending = pendingPersistRef.current;
        pendingPersistRef.current = null;
        onPersistRef.current?.(pending);
      }, 1200);
    }
    if (changes.inspirationCardIds !== undefined || changes.materialThoughts !== undefined) {
      onMaterialsChange?.(nextNote);
    }
  };

  const handleEditorUpdate = (payload) => {
    if (generating) return;
    const prevHtml = note.content?.html || htmlFromNoteContent(note.content);
    const prevText = note.content?.text || '';
    if (payload.html === prevHtml && payload.text === prevText) return;
    if (payload.html === lastHtmlRef.current) return;
    lastHtmlRef.current = payload.html;
    commit({
      content: {
        ...note.content,
        ...noteContentFromEditor(payload),
        sections: [],
      },
    });
  };

  const reorderCards = (from, to) => {
    const next = [...note.inspirationCardIds];
    [next[from], next[to]] = [next[to], next[from]];
    commit({ inspirationCardIds: next });
  };
  const updateThought = (cardId, thought) => commit({
    materialThoughts: { ...(note.materialThoughts || {}), [cardId]: thought },
  });
  const removeCard = (cardId) => commit({
    inspirationCardIds: note.inspirationCardIds.filter((id) => id !== cardId),
  });
  const attachCard = (cardId) => {
    onAttachCards?.([cardId]);
    setPickerOpen(false);
  };
  const generate = () => {
    if (!selectedCards.length || generating) return;
    setGenerating(true);
    try {
      onGenerate?.();
    } finally {
      window.setTimeout(() => setGenerating(false), 0);
    }
  };

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
          <span className={`note-editor__save-state ${saveState === '正在保存' ? 'is-saving' : ''}`} aria-live="polite">
            {saveState}
          </span>
        </div>
        {!hasSections ? (
          <NoteEditorToolbar editor={tiptapEditor} disabled={generating} />
        ) : null}
        {isFullscreen && materialsEnabled && (
          <div className="note-editor__inspiration-actions">
            <button type="button" onClick={() => setPickerOpen((open) => !open)} disabled={generating}>
              <Plus size={15} />
              添加灵感卡片
            </button>
            <button type="button" onClick={() => setPanelOpen((open) => !open)} disabled={generating}>
              {panelOpen ? <PanelBottomClose size={15} /> : <PanelBottomOpen size={15} />}
              素材面板
            </button>
            <button
              type="button"
              className="note-editor__generate"
              disabled={!selectedCards.length || generating}
              onClick={generate}
            >
              生成笔记
            </button>
            {pickerOpen && (
              <div className="note-editor__card-picker" role="menu">
                <header>
                  <strong>添加灵感卡片</strong>
                  <button type="button" aria-label="关闭添加卡片" onClick={() => setPickerOpen(false)}>
                    <X size={14} />
                  </button>
                </header>
                {availableCards.length
                  ? availableCards.map((card) => (
                    <button type="button" role="menuitem" key={card.id} onClick={() => attachCard(card.id)}>
                      {card.contentSnapshot}
                    </button>
                  ))
                  : <p>没有更多可添加的卡片。</p>}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="note-editor__document">
        <input
          className="note-editor__title"
          aria-label="笔记标题"
          disabled={generating}
          value={note.title}
          onChange={(event) => commit({ title: event.target.value })}
        />
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
          <NoteRichEditor
            key={note.id}
            editorRef={editorRef}
            contentHtml={editorHtml}
            editable={!generating}
            placeholder="开始记录你的想法…"
            showToolbar={false}
            onReady={setTiptapEditor}
            onUpdate={handleEditorUpdate}
          />
        )}
      </div>
      {isFullscreen && materialsEnabled && panelOpen && (
        <MaterialsPanel
          cards={selectedCards}
          thoughts={note.materialThoughts || {}}
          onReorder={reorderCards}
          onThoughtChange={updateThought}
          onRemove={removeCard}
        />
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
