import { Check, ListChecks, NotebookPen, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useDismissable } from '../../hooks/useDismissable.js';
import {
  cardMatchesOriginFilter,
  cardMatchesTimeFilter,
  formatCardPreviewText,
  resolveCardOriginLabel,
} from '../../lib/api/notes.js';
import { CardDetailDialog, PickNoteDialog } from './NoteDialogs.jsx';

const TIME_FILTERS = [
  { id: 'all', label: '全部时间' },
  { id: 'today', label: '今天' },
  { id: '7d', label: '近 7 天' },
  { id: '30d', label: '近 30 天' },
];

export function InspirationCards({
  cards,
  knowledgeBases = [],
  notes = [],
  notebooks = [],
  onCreateOrganizedNote,
  onDeleteCard,
  onDeleteCards,
  onAddToNote,
  onAddCardsAsNotes,
  onAttachCardsToNote,
  onOpenMaterial,
}) {
  const [query, setQuery] = useState('');
  const [selectionMode, setSelectionMode] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [detailCard, setDetailCard] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState('all');
  const [originFilter, setOriginFilter] = useState('all');
  const [importOpen, setImportOpen] = useState(false);
  const [pickNoteOpen, setPickNoteOpen] = useState(false);
  const filterRef = useRef(null);
  const importRef = useRef(null);

  useDismissable({
    open: filterOpen,
    onClose: () => setFilterOpen(false),
    rootRef: filterRef,
  });
  useDismissable({
    open: importOpen,
    onClose: () => setImportOpen(false),
    rootRef: importRef,
  });

  const originOptions = useMemo(() => {
    const usedIds = new Set(
      cards.flatMap((card) => (card.answerMode === 'rag' ? (card.sourceKnowledgeBaseIds || []) : [])),
    );
    const bases = knowledgeBases.filter((base) => usedIds.has(base.id));
    const listed = bases.length ? bases : knowledgeBases;
    return [
      { id: 'all', label: '全部来源' },
      { id: 'general', label: '通用回答' },
      ...listed.map((base) => ({ id: base.id, label: base.name })),
    ];
  }, [cards, knowledgeBases]);

  const filterActive = timeFilter !== 'all' || originFilter !== 'all';

  const visibleCards = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cards.filter((card) => {
      if (!cardMatchesTimeFilter(card, timeFilter)) return false;
      if (!cardMatchesOriginFilter(card, originFilter)) return false;
      if (!needle) return true;
      return `${card.contentSnapshot} ${card.questionSnapshot}`.toLowerCase().includes(needle);
    });
  }, [cards, query, timeFilter, originFilter]);
  const visibleSelectedIds = visibleCards.map((card) => card.id).filter((id) => selectedIds.includes(id));

  const exitSelection = () => {
    setSelectionMode(null);
    setSelectedIds([]);
    setImportOpen(false);
    setPickNoteOpen(false);
  };
  const enterMode = (mode) => {
    setSelectedIds([]);
    setImportOpen(false);
    setPickNoteOpen(false);
    setSelectionMode(mode);
  };
  const toggleCard = (id) => setSelectedIds((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
  const organize = () => {
    const orderedIds = visibleCards.map((card) => card.id).filter((id) => selectedIds.includes(id));
    onCreateOrganizedNote?.(orderedIds);
    exitSelection();
  };
  const deleteCard = (card) => {
    onDeleteCard?.(card.id);
    setDetailCard(null);
    setSelectedIds((ids) => ids.filter((id) => id !== card.id));
  };
  const batchDelete = () => {
    const result = onDeleteCards?.(visibleSelectedIds);
    if (result !== false) exitSelection();
  };
  const createNotesFromSelection = async () => {
    setImportOpen(false);
    try {
      await onAddCardsAsNotes?.(visibleSelectedIds);
      exitSelection();
    } catch {
      // Parent toasts; keep selection for retry.
    }
  };
  const openPickNote = () => {
    setImportOpen(false);
    setPickNoteOpen(true);
  };
  const confirmPickNote = async (noteId) => {
    try {
      await onAttachCardsToNote?.(noteId, visibleSelectedIds);
      setPickNoteOpen(false);
      exitSelection();
    } catch {
      // Keep picker/selection for retry.
    }
  };

  return (
    <section className="inspiration-cards" aria-label="灵感卡片">
      <header className="cards-header">
        <label className="cards-header__search">
          <Search size={16} />
          <input aria-label="搜索灵感卡片" placeholder="搜索灵感卡片" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="cards-header__filter" ref={filterRef}>
          <button
            type="button"
            aria-label="筛选灵感卡片"
            aria-expanded={filterOpen}
            className={filterActive ? 'is-active' : ''}
            onClick={() => setFilterOpen((open) => !open)}
          >
            <SlidersHorizontal size={15} strokeWidth={1.7} />
            筛选
          </button>
          {filterOpen && (
            <div className="cards-filter-menu" role="menu" aria-label="灵感卡片筛选">
              <span>按时间</span>
              {TIME_FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={timeFilter === item.id}
                  className={timeFilter === item.id ? 'is-active' : ''}
                  onClick={() => setTimeFilter(item.id)}
                >
                  <span>{item.label}</span>
                  {timeFilter === item.id ? <Check size={13} strokeWidth={1.6} /> : null}
                </button>
              ))}
              <span>按来源</span>
              {originOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={originFilter === item.id}
                  className={originFilter === item.id ? 'is-active' : ''}
                  onClick={() => setOriginFilter(item.id)}
                >
                  <span>{item.label}</span>
                  {originFilter === item.id ? <Check size={13} strokeWidth={1.6} /> : null}
                </button>
              ))}
            </div>
          )}
        </div>
        {!selectionMode && (
          <>
            <button type="button" className="cards-header__organize" onClick={() => enterMode('manage')}>
              <ListChecks size={15} strokeWidth={1.75} />
              管理
            </button>
            <button type="button" className="cards-header__organize" onClick={() => enterMode('organize')}>
              <NotebookPen size={14} strokeWidth={1.85} />
              整理为笔记
            </button>
          </>
        )}
      </header>
      {selectionMode === 'organize' && (
        <div className="cards-selection-bar" aria-live="polite">
          <span>已选 <em>{visibleSelectedIds.length}</em> 张</span>
          <div>
            <button type="button" onClick={exitSelection}>取消</button>
            <button type="button" className="cards-selection-bar__primary" disabled={!visibleSelectedIds.length} onClick={organize}>开始整理</button>
          </div>
        </div>
      )}
      {selectionMode === 'manage' && (
        <div className="cards-selection-bar" aria-live="polite">
          <span>已选 <em>{visibleSelectedIds.length}</em> 张</span>
          <div>
            <button type="button" onClick={exitSelection}>取消</button>
            <button type="button" className="cards-selection-bar__danger" disabled={!visibleSelectedIds.length} onClick={batchDelete}>删除</button>
            <div className="cards-selection-bar__import" ref={importRef}>
              <button
                type="button"
                className="cards-selection-bar__primary"
                disabled={!visibleSelectedIds.length}
                aria-expanded={importOpen}
                onClick={() => setImportOpen((open) => !open)}
              >
                导入笔记
              </button>
              {importOpen && (
                <div className="cards-import-menu" role="menu" aria-label="导入笔记">
                  <button type="button" role="menuitem" onClick={createNotesFromSelection}>新建笔记</button>
                  <button type="button" role="menuitem" onClick={openPickNote}>加入已有笔记…</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="inspiration-cards__grid">
        {visibleCards.map((card) => (
          <article key={card.id} className={`inspiration-card ${selectionMode && selectedIds.includes(card.id) ? 'is-selected' : ''}`}>
            {selectionMode && (
              <button
                type="button"
                className="inspiration-card__select"
                aria-label={`选择卡片：${card.id}`}
                aria-pressed={selectedIds.includes(card.id)}
                onClick={() => toggleCard(card.id)}
              >
                <Check size={14} />
              </button>
            )}
            <button type="button" className="inspiration-card__open" onClick={() => setDetailCard(card)}>
              <span className="inspiration-card__source">{resolveCardOriginLabel(card, knowledgeBases)}</span>
              <strong>{formatCardPreviewText(card.contentSnapshot)}</strong>
              <p>{card.questionSnapshot}</p>
              <time>{card.savedAt}</time>
            </button>
          </article>
        ))}
        {!visibleCards.length && (
          <div className="inspiration-cards__empty">
            {!cards.length ? (
              <>
                <p>暂无灵感卡片</p>
                <p>可在 AI 回答中收藏内容，保存后将显示于此</p>
              </>
            ) : (
              <p>未找到符合条件的灵感卡片</p>
            )}
          </div>
        )}
      </div>
      <CardDetailDialog
        card={detailCard}
        knowledgeBases={knowledgeBases}
        notes={notes}
        notebooks={notebooks}
        onClose={() => setDetailCard(null)}
        onAddToNote={onAddToNote}
        onAttachCardsToNote={onAttachCardsToNote}
        onDelete={deleteCard}
        onOpenMaterial={onOpenMaterial}
      />
      {pickNoteOpen && (
        <PickNoteDialog
          notes={notes}
          notebooks={notebooks}
          onConfirm={confirmPickNote}
          onClose={() => setPickNoteOpen(false)}
        />
      )}
    </section>
  );
}
