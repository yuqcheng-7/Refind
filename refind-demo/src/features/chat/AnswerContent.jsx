import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  citationByOrder,
  parseListItemLead,
  splitAnswerBlocks,
  tokenizeInline,
} from './formatAnswerText.js';

function clipExcerpt(text = '', max = 220) {
  const value = String(text).replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max).trim()}…`;
}

/** Keep citation card clear of the sticky composer / bottom chrome. */
const CITE_POP_BOTTOM_SAFE = 200;

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
  tokens: presetTokens,
}) {
  const tokens = presetTokens || tokenizeInline(text, { allowMarkdown });

  const renderTokens = (list, nestKey) => list.map((token, index) => {
    const key = `${nestKey}-${index}`;
    if (token.type === 'bold') {
      return (
        <strong key={key}>
          {renderTokens(token.children || [{ type: 'text', value: token.value || '' }], `${key}-b`)}
        </strong>
      );
    }
    if (token.type === 'italic') {
      return (
        <em key={key}>
          {renderTokens(token.children || [{ type: 'text', value: token.value || '' }], `${key}-i`)}
        </em>
      );
    }
    if (token.type === 'code') {
      return <code className="answer-content__code" key={key}>{token.value}</code>;
    }
    if (token.type === 'citation') {
      const meta = citationByOrder(citations, token.order);
      const instanceKey = `${keyPrefix}-${key}-c${token.order}`;
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
    return <span key={key}>{token.value}</span>;
  });

  return renderTokens(tokens, 't');
}

function ListItemText(props) {
  const lead = parseListItemLead(props.text);
  if (!lead) {
    return <InlineText {...props} />;
  }
  return (
    <>
      <strong className="answer-content__list-label">{lead.title}{lead.colon}</strong>
      {lead.rest ? (
        <InlineText
          {...props}
          text={lead.rest}
          keyPrefix={`${props.keyPrefix}-rest`}
        />
      ) : null}
    </>
  );
}

function CitationChip({ order, citation, open, onShow, onHide, onOpenMaterial }) {
  const wrapRef = useRef(null);
  const popRef = useRef(null);
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

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) {
      setCoords(null);
      return undefined;
    }
    const place = () => {
      const rect = wrapRef.current.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 24);
      let left = rect.left + rect.width / 2 - width / 2;
      left = Math.max(12, Math.min(left, window.innerWidth - width - 12));

      const measured = popRef.current?.getBoundingClientRect().height;
      const estimatedHeight = measured && measured > 40 ? measured : 168;
      const gap = 8;
      const maxBottom = window.innerHeight - CITE_POP_BOTTOM_SAFE;
      let top = rect.bottom + gap;
      const fitsBelow = top + estimatedHeight <= maxBottom;
      if (!fitsBelow) {
        top = Math.max(8, rect.top - estimatedHeight - gap);
      }
      // Still clamp so the card never sits under the composer band.
      if (top + estimatedHeight > maxBottom) {
        top = Math.max(8, maxBottom - estimatedHeight);
      }
      setCoords({ top, left, width });
    };
    place();
    // Second pass after portal mounts so height is accurate.
    const raf = window.requestAnimationFrame(place);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, excerpt]);

  const pop = open && coords
    ? createPortal(
      <button
        type="button"
        ref={popRef}
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
      </button>,
      document.body,
    )
    : null;

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
      {pop}
    </span>
  );
}

export function AnswerContent({
  text = '',
  citations = [],
  webSources = [],
  interactive = true,
  conversational = false,
  onOpenMaterial,
}) {
  const [openKey, setOpenKey] = useState(null);
  const blocks = splitAnswerBlocks(text, { conversational });
  const allowMarkdown = !conversational;
  const sources = Array.isArray(webSources) ? webSources : [];

  if (!blocks.length) return null;

  return (
    <div className={`answer-content ${conversational ? 'is-conversational' : ''}`}>
      {blocks.map((block, index) => {
        if (block.type === 'hr') {
          return <hr className="answer-content__hr" key={`hr-${index}`} />;
        }
        if (block.type === 'heading') {
          const HeadingTag = block.level >= 3 ? 'h4' : block.level === 1 ? 'h2' : 'h3';
          return (
            <HeadingTag className={`answer-content__heading answer-content__heading--h${block.level}`} key={`h-${index}`}>
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
            </HeadingTag>
          );
        }
        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul';
          return (
            <ListTag
              className={`answer-content__list ${block.ordered ? 'is-ordered' : 'is-unordered'}`}
              key={`list-${index}`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`li-${index}-${itemIndex}`}>
                  <ListItemText
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
            </ListTag>
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
      {sources.length > 0 && (
        <div className="answer-web-sources" aria-label="网络来源">
          {sources.map((source) => (
            interactive ? (
              <button
                key={source.order}
                type="button"
                className="answer-web-source"
                aria-label={`来源 ${source.order}：${source.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  window.open(source.url, '_blank', 'noopener,noreferrer');
                }}
              >
                来源 {source.order}：{source.title}
              </button>
            ) : (
              <span
                key={source.order}
                className="answer-web-source"
                aria-label={`来源 ${source.order}：${source.title}`}
              >
                来源 {source.order}：{source.title}
              </span>
            )
          ))}
        </div>
      )}
    </div>
  );
}
