import { useEffect, useId, useRef, useState } from 'react';
import {
  citationByOrder,
  splitAnswerBlocks,
  tokenizeInline,
} from './formatAnswerText.js';

function clipExcerpt(text = '', max = 220) {
  const value = String(text).replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max).trim()}…`;
}

function InlineText({
  text,
  citations,
  interactive,
  allowMarkdown,
  openKey,
  keyPrefix,
  onShowCitation,
  onHideCitation,
  onOpenMaterial,
}) {
  return tokenizeInline(text, { allowMarkdown }).map((token, index) => {
    if (token.type === 'bold') {
      return <strong key={`b-${index}`}>{token.value}</strong>;
    }
    if (token.type === 'citation') {
      const meta = citationByOrder(citations, token.order);
      const instanceKey = `${keyPrefix}-c${index}-${token.order}`;
      if (!meta) {
        return <span key={instanceKey} className="answer-cite answer-cite--missing">[{token.order}]</span>;
      }
      if (!interactive) {
        return <span key={instanceKey} className="answer-cite">[{token.order}]</span>;
      }
      const isOpen = openKey === instanceKey;
      return (
        <CitationChip
          key={instanceKey}
          instanceKey={instanceKey}
          order={token.order}
          citation={meta}
          open={isOpen}
          onShow={() => onShowCitation(instanceKey)}
          onHide={() => onHideCitation(instanceKey)}
          onOpenMaterial={onOpenMaterial}
        />
      );
    }
    return <span key={`t-${index}`}>{token.value}</span>;
  });
}

function CitationChip({ order, citation, open, onShow, onHide, onOpenMaterial }) {
  const wrapRef = useRef(null);
  const hideTimer = useRef(null);
  const labelId = useId();
  const [coords, setCoords] = useState(null);
  const excerpt = clipExcerpt(citation.excerpt || '');

  const clearHide = () => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const scheduleHide = () => {
    clearHide();
    hideTimer.current = window.setTimeout(() => onHide(), 120);
  };

  useEffect(() => () => clearHide(), []);

  useEffect(() => {
    if (!open || !wrapRef.current) {
      setCoords(null);
      return undefined;
    }
    const place = () => {
      const rect = wrapRef.current.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 24);
      let left = rect.left + rect.width / 2 - width / 2;
      left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
      let top = rect.bottom + 8;
      // Keep card on screen; prefer below marker.
      const estimatedHeight = 160;
      if (top + estimatedHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - estimatedHeight - 8);
      }
      setCoords({ top, left, width });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  return (
    <span
      className={`answer-cite-wrap ${open ? 'is-open' : ''}`}
      ref={wrapRef}
      onMouseEnter={() => {
        clearHide();
        onShow();
      }}
      onMouseLeave={scheduleHide}
      onFocus={() => {
        clearHide();
        onShow();
      }}
      onBlur={scheduleHide}
    >
      <button
        type="button"
        className="answer-cite"
        aria-expanded={open}
        aria-controls={open ? labelId : undefined}
        aria-label={`引用 ${order}：${citation.label || '资料'}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (citation.materialId) onOpenMaterial?.(citation.materialId);
        }}
      >
        [{order}]
      </button>
      {open && coords && (
        <button
          type="button"
          className="answer-cite-pop"
          id={labelId}
          role="dialog"
          aria-label={`引用 ${order}：${citation.label || '资料'}`}
          style={{ top: coords.top, left: coords.left, width: coords.width }}
          onMouseEnter={clearHide}
          onMouseLeave={scheduleHide}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (citation.materialId) onOpenMaterial?.(citation.materialId);
          }}
        >
          <span className="answer-cite-pop__title">{citation.label || '资料'}</span>
          {excerpt ? <span className="answer-cite-pop__excerpt">{excerpt}</span> : null}
        </button>
      )}
    </span>
  );
}

export function AnswerContent({
  text = '',
  citations = [],
  interactive = true,
  conversational = false,
  onOpenMaterial,
}) {
  const [openKey, setOpenKey] = useState(null);
  const blocks = splitAnswerBlocks(text, { conversational });
  const allowMarkdown = !conversational;

  if (!blocks.length) return null;

  return (
    <div className={`answer-content ${conversational ? 'is-conversational' : ''}`}>
      {blocks.map((block, index) => {
        if (block.type === 'list') {
          return (
            <ol className="answer-content__list" key={`list-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`li-${index}-${itemIndex}`}>
                  <InlineText
                    text={item}
                    citations={citations}
                    interactive={interactive}
                    allowMarkdown={allowMarkdown}
                    openKey={openKey}
                    keyPrefix={`b${index}-i${itemIndex}`}
                    onShowCitation={setOpenKey}
                    onHideCitation={(key) => setOpenKey((current) => (current === key ? null : current))}
                    onOpenMaterial={onOpenMaterial}
                  />
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p className="answer-content__p" key={`p-${index}`}>
            <InlineText
              text={block.text}
              citations={citations}
              interactive={interactive}
              allowMarkdown={allowMarkdown}
              openKey={openKey}
              keyPrefix={`b${index}`}
              onShowCitation={setOpenKey}
              onHideCitation={(key) => setOpenKey((current) => (current === key ? null : current))}
              onOpenMaterial={onOpenMaterial}
            />
          </p>
        );
      })}
    </div>
  );
}
