import { useEffect, useRef, useState } from 'react';

/** Hoverable [n] chip that opens the linked inspiration card. */
export function NoteCitationChip({ index, label, card, onOpenCard }) {
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

  const title = label || card?.sourceLabel || `引用 ${index}`;

  return (
    <span
      ref={wrapRef}
      className="note-editor__citation-wrap"
      contentEditable={false}
      onMouseEnter={showMenu}
      onMouseLeave={hideMenu}
    >
      <button
        type="button"
        className="note-editor__citation"
        aria-label={`${title} 引用`}
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
          <span className="note-editor__citation-menu-source">{card?.sourceLabel || title}</span>
          <strong>{card?.contentSnapshot || title}</strong>
          {card?.questionSnapshot ? <p>{card.questionSnapshot}</p> : null}
          <span className="note-editor__citation-menu-hint">点击查看灵感卡片</span>
        </button>
      )}
    </span>
  );
}
