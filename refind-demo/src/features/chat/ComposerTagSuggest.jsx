import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { getTextareaCaretClientRect } from '../../lib/textareaCaret.js';

const MENU_WIDTH = 220;

/**
 * Fixed-position # tag picker. Portaled to body so overflow:hidden cannot clip it.
 * Anchors above the active `#` caret inside the textarea when possible.
 */
export function ComposerTagSuggest({
  open = false,
  anchorRef,
  textareaRef,
  caretIndex = 0,
  menuRef,
  tags = [],
  selectedTags = [],
  onPick,
  emptyText = '暂无标签',
}) {
  const [coords, setCoords] = useState(null);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return undefined;
    }
    const update = () => {
      const textarea = textareaRef?.current;
      const fallback = anchorRef?.current;
      const caret = textarea
        ? getTextareaCaretClientRect(textarea, caretIndex)
        : null;

      if (caret) {
        const width = MENU_WIDTH;
        const left = Math.min(
          Math.max(8, caret.left),
          Math.max(8, window.innerWidth - width - 8),
        );
        const spaceAbove = caret.top;
        if (spaceAbove > 96) {
          setCoords({
            left,
            bottom: Math.max(8, window.innerHeight - caret.top + 6),
            width,
            top: 'auto',
          });
        } else {
          setCoords({
            left,
            top: caret.top + caret.height + 6,
            bottom: 'auto',
            width,
          });
        }
        return;
      }

      if (!fallback) {
        setCoords(null);
        return;
      }
      const rect = fallback.getBoundingClientRect();
      const width = Math.min(MENU_WIDTH, Math.max(160, rect.width));
      const left = Math.min(
        Math.max(8, rect.left),
        Math.max(8, window.innerWidth - width - 8),
      );
      setCoords({
        left,
        bottom: Math.max(8, window.innerHeight - rect.top + 8),
        width,
        top: 'auto',
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef, textareaRef, caretIndex]);

  if (!open || !coords) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="composer-menu composer-tag-suggest is-ported"
      role="listbox"
      aria-label="选择标签"
      style={{
        position: 'fixed',
        left: coords.left,
        bottom: coords.bottom,
        top: coords.top,
        width: coords.width,
        right: 'auto',
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {tags.length ? tags.map((item) => (
        <button
          key={item}
          type="button"
          role="option"
          aria-label={`#${item}`}
          aria-selected={selectedTags.includes(item)}
          onClick={() => onPick?.(item)}
        >
          <span className="tag-text">
            <span className="tag-hash">#</span>
            <span className="tag-label">{item}</span>
          </span>
          {selectedTags.includes(item) && <Check size={14} aria-hidden="true" />}
        </button>
      )) : (
        <div className="composer-tag-suggest__empty">{emptyText}</div>
      )}
    </div>,
    document.body,
  );
}
