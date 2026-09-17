import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const VIEW_PAD = 8;
const GAP = 6;
const DEFAULT_MENU_WIDTH = 150;
const DEFAULT_MENU_HEIGHT = 88;

function readRect(anchorRect, anchorRef) {
  if (anchorRect && Number.isFinite(anchorRect.top) && Number.isFinite(anchorRect.left)) {
    return {
      top: anchorRect.top,
      left: anchorRect.left,
      right: anchorRect.right ?? (anchorRect.left + (anchorRect.width || 0)),
      bottom: anchorRect.bottom ?? (anchorRect.top + (anchorRect.height || 0)),
      width: anchorRect.width ?? Math.max(0, (anchorRect.right || 0) - anchorRect.left),
      height: anchorRect.height ?? Math.max(0, (anchorRect.bottom || 0) - anchorRect.top),
    };
  }
  const node = anchorRef?.current;
  if (!node?.getBoundingClientRect) return null;
  const rect = node.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

/** Keep a fixed menu inside the viewport, preferring below the anchor (or above if needed). */
export function placeFloatingMenu(rect, {
  menuWidth = DEFAULT_MENU_WIDTH,
  menuHeight = DEFAULT_MENU_HEIGHT,
  preferCenter = false,
  gap = GAP,
  pad = VIEW_PAD,
  viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024,
  viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768,
} = {}) {
  if (!rect) return null;

  // Menu size is independent of the anchor/selection width.
  const width = Math.max(DEFAULT_MENU_WIDTH, Number(menuWidth) || DEFAULT_MENU_WIDTH);

  let left = preferCenter
    ? rect.left + (rect.width / 2) - (width / 2)
    : rect.left;
  if (left + width > viewportWidth - pad) {
    left = Math.max(pad, rect.right - width);
  }
  left = Math.min(Math.max(pad, left), Math.max(pad, viewportWidth - width - pad));

  const spaceBelow = viewportHeight - rect.bottom;
  const spaceAbove = rect.top;
  const openUp = spaceBelow < menuHeight + gap && spaceAbove > spaceBelow;

  if (openUp) {
    const bottom = Math.min(
      viewportHeight - rect.top + gap,
      viewportHeight - pad - menuHeight,
    );
    return {
      left,
      bottom: Math.max(pad, bottom),
      top: 'auto',
      width,
      minWidth: width,
      maxWidth: width,
    };
  }

  let top = rect.bottom + gap;
  if (top + menuHeight > viewportHeight - pad) {
    top = Math.max(pad, viewportHeight - menuHeight - pad);
  }
  return {
    left,
    top,
    bottom: 'auto',
    width,
    minWidth: width,
    maxWidth: width,
  };
}

export function FloatingMenu({
  open,
  anchorRef,
  anchorRect = null,
  menuRef,
  className,
  role,
  'aria-label': ariaLabel,
  children,
  width = DEFAULT_MENU_WIDTH,
  preferCenter = false,
}) {
  const [coords, setCoords] = useState(null);
  const centered = preferCenter || Boolean(anchorRect);
  const fixedWidth = Number(width) > 0 ? Number(width) : DEFAULT_MENU_WIDTH;

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return undefined;
    }

    const update = () => {
      const rect = readRect(anchorRect, anchorRef);
      if (!rect) return;
      const menuNode = menuRef?.current;
      const menuHeight = menuNode?.offsetHeight || DEFAULT_MENU_HEIGHT;
      const next = placeFloatingMenu(rect, {
        menuWidth: fixedWidth,
        menuHeight,
        preferCenter: centered,
      });
      if (next) setCoords(next);
    };

    update();
    const raf = window.requestAnimationFrame(update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef, anchorRect, menuRef, fixedWidth, centered]);

  if (!open || !coords || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      className={`floating-menu ${className || ''}`.trim()}
      role={role}
      aria-label={ariaLabel}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: 'fixed',
        zIndex: 10000,
        left: coords.left,
        top: coords.top,
        bottom: coords.bottom,
        width: coords.width,
        minWidth: coords.minWidth,
        maxWidth: coords.maxWidth,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
