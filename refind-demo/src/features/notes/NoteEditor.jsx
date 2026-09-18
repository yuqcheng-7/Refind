import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronsLeft, Maximize2, PanelRightClose, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatCardPreviewText } from '../../lib/api/notes.js';
import { AddInspirationCardsDialog, CardDetailDialog } from './NoteDialogs.jsx';
import { NoteEditorToolbar } from './editor/NoteEditorToolbar.jsx';
import { NoteRichEditor } from './editor/NoteRichEditor.jsx';
import { htmlFromNoteContent, noteContentFromEditor } from './editor/noteContentCodec.js';
import {
  addCardsToUnassigned,
  flattenOutlineCardIds,
  hasSavedOutline,
  moveCardInOutline,
  normalizeOutline,
  removeCardFromOutline,
  renameChapter,
} from './materialOutline.js';

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

function MaterialsPanel({
  cards,
  thoughts,
  outline,
  readOnly,
  outlining,
  outlineError,
  onReorder,
  onMove,
  onRenameChapter,
  onThoughtChange,
  onRemove,
  onCollapse,
  onRetryOutline,
}) {
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [draggedCardId, setDraggedCardId] = useState(null);

  const toggleExpanded = (cardId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const renderCard = (card, index, listLength, chapterId = null) => {
    const expanded = expandedIds.has(card.id);
    const preview = formatCardPreviewText(card.contentSnapshot);
    const source = card.sourceLabel || (card.answerMode === 'rag' ? '知识库回答' : '通用回答');
    const thought = thoughts[card.id] || '';
    const move = (to) => {
      if (chapterId) onReorder?.(chapterId, index, to);
      else onReorder?.(index, to);
    };
    return (
      <article
        className={`material-card ${expanded ? 'is-expanded' : ''}`}
        data-testid="material-card"
        data-card-id={card.id}
        draggable={!readOnly}
        onDragStart={() => setDraggedCardId(card.id)}
        onDragEnd={() => setDraggedCardId(null)}
        onDragOver={(event) => { if (!readOnly) event.preventDefault(); }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!readOnly && draggedCardId && draggedCardId !== card.id) {
            onMove?.(draggedCardId, chapterId || 'unassigned', index);
          }
          setDraggedCardId(null);
        }}
        key={card.id}
      >
        <div className="material-card__order"><span>{index + 1}</span></div>
        <div className="material-card__content">
          <div className="material-card__summary">
            <span className="material-card__source">{source}</span>
            <p className={expanded ? 'is-full' : ''}>{preview}</p>
            <button type="button" className="material-card__toggle" aria-expanded={expanded} onClick={() => toggleExpanded(card.id)}>
              {expanded ? '收起' : '展开全文'} <ChevronDown size={13} strokeWidth={1.8} />
            </button>
          </div>
          {expanded && (
            <label className="material-card__thought">
              <span>我的想法</span>
              <textarea value={thought} onChange={(event) => onThoughtChange(card.id, event.target.value)} placeholder="写下你的想法…" rows={2} />
            </label>
          )}
          {!expanded && thought ? <p className="material-card__thought-preview">{thought}</p> : null}
        </div>
        <div className="material-card__actions">
          <button type="button" aria-label={`上移 ${card.id}`} disabled={readOnly || index === 0} onClick={() => move(index - 1)}><ArrowUp size={14} /></button>
          <button type="button" aria-label={`下移 ${card.id}`} disabled={readOnly || index === listLength - 1} onClick={() => move(index + 1)}><ArrowDown size={14} /></button>
          <button type="button" aria-label={`移除 ${card.id}`} disabled={readOnly} onClick={() => onRemove(card.id)}><Trash2 size={14} /></button>
        </div>
      </article>
    );
  };

  const renderOutlineSection = (title, cardIds, chapterId = 'unassigned') => {
    const sectionCards = cardIds.map((id) => cards.find((card) => card.id === id)).filter(Boolean);
    return (
      <section className={`materials-rail__chapter${chapterId === 'unassigned' ? ' materials-rail__chapter--unassigned' : ''}`} key={chapterId}>
        {chapterId === 'unassigned' ? <h3>{title}</h3> : (
          <input
            className="materials-rail__chapter-title"
            value={title}
            disabled={readOnly}
            aria-label={`章节标题 ${title}`}
            onChange={(event) => onRenameChapter(chapterId, event.target.value)}
          />
        )}
        <div
          className="materials-rail__chapter-list"
          onDragOver={(event) => { if (!readOnly) event.preventDefault(); }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!readOnly && draggedCardId) onMove(draggedCardId, chapterId, sectionCards.length);
            setDraggedCardId(null);
          }}
        >
          {sectionCards.map((card, index) => renderCard(card, index, sectionCards.length, chapterId))}
          {!sectionCards.length ? <p className="materials-rail__chapter-empty">拖入素材卡片</p> : null}
        </div>
      </section>
    );
  };

  return (
    <section className="materials-rail" aria-label="素材面板">
      <header className="materials-rail__header">
        <div>
          <span className="eyebrow">写作素材</span>
          <h2>{outlining ? '成章中…' : outline ? '章节大纲' : '已选灵感卡片'}</h2>
        </div>
        <div className="materials-rail__header-right">
          <span>{cards.length} 张</span>
          {outlineError ? <p className="materials-rail__error">{outlineError}</p> : null}
          {(outline || outlineError) && onRetryOutline ? <button type="button" className="materials-rail__retry" disabled={readOnly} onClick={onRetryOutline}>重试成章</button> : null}
          <button
            type="button"
            className="materials-rail__collapse"
            aria-label="收起素材面板"
            title="收起"
            onClick={onCollapse}
          >
            <PanelRightClose size={16} strokeWidth={1.7} />
          </button>
        </div>
      </header>
      <div className="materials-rail__list">
        {outline
          ? [
            ...outline.chapters.map((chapter) => renderOutlineSection(chapter.title, chapter.cardIds, chapter.id)),
            renderOutlineSection('未归章', outline.unassignedCardIds),
          ]
          : cards.map((card, index) => renderCard(card, index, cards.length))}
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
  knowledgeBases = [],
  onAttachCards,
  onGenerate,
  onOutline,
  onRetryOutline,
  onAddToNote,
  onAttachCardsToNote,
  onDeleteCard,
  onOpenMaterial,
  onBack,
  onEnterFullscreen,
  notes = [],
  notebooks = [],
}) {
  const isFullscreen = mode === 'inspiration';
  const materialsEnabled = showMaterials ?? isFullscreen;
  const [saveState, setSaveState] = useState('已保存');
  const [panelOpen, setPanelOpen] = useState(materialsEnabled);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [outlining, setOutlining] = useState(false);
  const [outlineError, setOutlineError] = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [detailCard, setDetailCard] = useState(null);
  const persistTimerRef = useRef(null);
  const pendingPersistRef = useRef(null);
  const autoOutlineAttemptedRef = useRef(null);
  const onPersistRef = useRef(onPersist);
  const lastHtmlRef = useRef(null);
  const documentScrollRef = useRef(null);
  const [tiptapEditor, setTiptapEditor] = useState(null);
  const outline = normalizeOutline(note.content?.outline);
  const panelReadOnly = generating || outlining;
  const handleEditorReady = useCallback((editor) => {
    setTiptapEditor(editor);
  }, []);

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
    setRevisions([]);
    setOutlineError(null);
    lastHtmlRef.current = null;
  }, [note.id, mode, materialsEnabled]);

  useEffect(() => {
    setOutlining(false);
    setOutlineError(null);
    autoOutlineAttemptedRef.current = null;
  }, [note.id]);

  useEffect(() => {
    if (!isFullscreen || !materialsEnabled) return undefined;
    if (autoOutlineAttemptedRef.current === note.id) return undefined;
    const bound = note.inspirationCardIds?.length ?? 0;
    if (bound < 2 || hasSavedOutline(note.content) || !onOutline) return undefined;

    autoOutlineAttemptedRef.current = note.id;
    let cancelled = false;
    (async () => {
      setOutlining(true);
      setOutlineError(null);
      try {
        await onOutline();
      } catch {
        if (!cancelled) setOutlineError('成章失败，可重试');
      } finally {
        if (!cancelled) setOutlining(false);
      }
    })();
    return () => { cancelled = true; };
  }, [note.id, isFullscreen, materialsEnabled]);

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
  const commitOutline = (nextOutline) => commit({
    inspirationCardIds: flattenOutlineCardIds(nextOutline),
    content: { ...note.content, outline: nextOutline },
  });
  const moveOutlineCard = (cardId, toChapterId, index) => {
    if (panelReadOnly || !outline) return;
    commitOutline(moveCardInOutline(outline, cardId, { toChapterId, index }));
  };
  const reorderOutlineCard = (chapterId, from, to) => {
    if (panelReadOnly || !outline) return;
    const cardIds = chapterId === 'unassigned'
      ? outline.unassignedCardIds
      : outline.chapters.find((chapter) => chapter.id === chapterId)?.cardIds;
    if (!cardIds || to < 0 || to >= cardIds.length) return;
    moveOutlineCard(cardIds[from], chapterId, to);
  };
  const renameOutlineChapter = (chapterId, title) => {
    if (panelReadOnly || !outline) return;
    commitOutline(renameChapter(outline, chapterId, title));
  };
  const updateThought = (cardId, thought) => commit({
    materialThoughts: { ...(note.materialThoughts || {}), [cardId]: thought },
  });
  const removeCard = (cardId) => {
    const inspirationCardIds = note.inspirationCardIds.filter((id) => id !== cardId);
    if (!outline) {
      commit({ inspirationCardIds });
      return;
    }
    commit({
      inspirationCardIds,
      content: { ...note.content, outline: removeCardFromOutline(outline, cardId) },
    });
  };
  const attachCards = async (cardIds) => {
    await onAttachCards?.(cardIds);
    if (outline) {
      const nextOutline = addCardsToUnassigned(outline, cardIds);
      commitOutline(nextOutline);
    }
    setPickerOpen(false);
  };
  const generate = async () => {
    if (!selectedCards.length || generating) return;
    setGenerating(true);
    try {
      await onGenerate?.();
      setRevisions((prev) => [...prev, { reason: 'before_generate', at: Date.now() }]);
      const scroller = documentScrollRef.current;
      if (scroller) scroller.scrollTop = 0;
    } catch {
      // Parent surfaces the failure notice; keep original content editable.
    } finally {
      setGenerating(false);
    }
  };
  const handleRetryOutline = async () => {
    if (outlining || generating || !onRetryOutline) return;
    setOutlining(true);
    setOutlineError(null);
    try {
      await onRetryOutline();
    } catch {
      setOutlineError('成章失败，可重试');
    } finally {
      setOutlining(false);
    }
  };

  return (
    <article className={`note-editor ${isFullscreen ? 'note-editor--inspiration' : 'note-editor--plain'}${isFullscreen && materialsEnabled && panelOpen ? ' has-materials-rail' : ''}`}>
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
            <button type="button" onClick={() => setPickerOpen(true)} disabled={panelReadOnly}>
              <Plus size={15} />
              添加灵感卡片
            </button>
            <button
              type="button"
              className="note-editor__generate"
              disabled={!selectedCards.length || panelReadOnly}
              onClick={generate}
            >
              {generating ? '生成中' : '生成笔记'}
            </button>
          </div>
        )}
      </div>
      {isFullscreen && materialsEnabled && !panelOpen ? (
        <button
          type="button"
          className="materials-rail-fab"
          aria-label="展开素材面板"
          title="展开素材"
          onClick={() => setPanelOpen(true)}
        >
          <ChevronsLeft size={16} strokeWidth={1.8} />
          <span className="materials-rail-fab__label">素材</span>
        </button>
      ) : null}
      {isFullscreen ? (
        <div className="note-editor__main">
          <div className="note-editor__document" ref={documentScrollRef}>
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
                contentHtml={editorHtml}
                editable={!generating}
                placeholder="开始记录你的想法…"
                showToolbar={false}
                onReady={handleEditorReady}
                onUpdate={handleEditorUpdate}
              />
            )}
          </div>
          {materialsEnabled ? (
            <div
              className={`materials-rail-slot${panelOpen ? ' is-open' : ''}`}
              aria-hidden={!panelOpen}
            >
              <MaterialsPanel
                cards={selectedCards}
                thoughts={note.materialThoughts || {}}
                outline={outline}
                readOnly={panelReadOnly}
                outlining={outlining}
                outlineError={outlineError}
                onReorder={outline ? reorderOutlineCard : reorderCards}
                onMove={moveOutlineCard}
                onRenameChapter={renameOutlineChapter}
                onThoughtChange={updateThought}
                onRemove={removeCard}
                onCollapse={() => setPanelOpen(false)}
                onRetryOutline={handleRetryOutline}
              />
            </div>
          ) : null}
        </div>
      ) : (
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
              contentHtml={editorHtml}
              editable={!generating}
              placeholder="开始记录你的想法…"
              showToolbar={false}
              onReady={handleEditorReady}
              onUpdate={handleEditorUpdate}
            />
          )}
        </div>
      )}
      {isFullscreen && materialsEnabled && revisions.length > 0 && (
        <span className="note-editor__revision" aria-live="polite">已保留生成前版本，可用撤销返回。</span>
      )}
      {pickerOpen ? (
        <AddInspirationCardsDialog
          cards={availableCards}
          onConfirm={attachCards}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
      <CardDetailDialog
        card={detailCard}
        knowledgeBases={knowledgeBases}
        notes={notes}
        notebooks={notebooks}
        onClose={() => setDetailCard(null)}
        onAddToNote={(card) => {
          onAddToNote?.(card);
          setDetailCard(null);
        }}
        onAttachCardsToNote={onAttachCardsToNote}
        onDelete={(card) => {
          onDeleteCard?.(card.id);
          setDetailCard(null);
        }}
        onOpenMaterial={onOpenMaterial}
      />
    </article>
  );
}
