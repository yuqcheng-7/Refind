import { Check, NotebookPen, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CardDetailDialog } from './NoteDialogs.jsx';

export function InspirationCards({ cards, onCreateOrganizedNote, onDeleteCard, onAddToNote }) {
  const [query, setQuery] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [detailCard, setDetailCard] = useState(null);

  const visibleCards = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cards.filter((card) => (
      !needle || `${card.contentSnapshot} ${card.questionSnapshot}`.toLowerCase().includes(needle)
    ));
  }, [cards, query]);
  const visibleSelectedIds = visibleCards.map((card) => card.id).filter((id) => selectedIds.includes(id));

  const exitSelection = () => {
    setSelecting(false);
    setSelectedIds([]);
  };
  const toggleCard = (id) => setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
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

  return (
    <section className="inspiration-cards" aria-label="灵感卡片">
      <header className="cards-header">
        <label className="cards-header__search">
          <Search size={16} />
          <input aria-label="搜索灵感卡片" placeholder="搜索灵感卡片" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        {!selecting && (
          <button type="button" className="cards-header__organize" onClick={() => setSelecting(true)}>
            <NotebookPen size={14} strokeWidth={1.85} />
            整理为笔记
          </button>
        )}
      </header>
      {selecting && (
        <div className="cards-selection-bar" aria-live="polite">
          <span>已选 <em>{visibleSelectedIds.length}</em> 张</span>
          <div>
            <button type="button" onClick={exitSelection}>取消</button>
            <button type="button" disabled={!visibleSelectedIds.length} onClick={organize}>开始整理</button>
          </div>
        </div>
      )}
      <div className="inspiration-cards__grid">
        {visibleCards.map((card) => (
          <article key={card.id} className={`inspiration-card ${selecting && selectedIds.includes(card.id) ? 'is-selected' : ''}`}>
            {selecting && (
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
              <span className="inspiration-card__source">{card.sourceLabel}</span>
              <strong>{card.contentSnapshot}</strong>
              <p>{card.questionSnapshot}</p>
              <time>{card.savedAt}</time>
            </button>
          </article>
        ))}
        {!visibleCards.length && <p className="inspiration-cards__empty">没有匹配的灵感卡片。</p>}
      </div>
      <CardDetailDialog card={detailCard} onClose={() => setDetailCard(null)} onAddToNote={onAddToNote} onDelete={deleteCard} />
    </section>
  );
}
