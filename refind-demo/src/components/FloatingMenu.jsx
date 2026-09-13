import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export function FloatingMenu({
  open,
  anchorRef,
  menuRef,
  className,
  role,
  'aria-label': ariaLabel,
  children,
  width,
}) {
  const [coords, setCoords] = useState(null);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return undefined;
    }

    const update = () => {
      const anchor = anchorRef?.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const menuWidth = width || Math.max(150, rect.width);
      const estimatedHeight = 96;
      const gap = 6;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < estimatedHeight && rect.top > estimatedHeight + gap;
      let left = rect.left;
      if (left + menuWidth > window.innerWidth - 8) {
        left = Math.max(8, rect.right - menuWidth);
      }
      left = Math.max(8, left);

      if (openUp) {
        setCoords({
          left,
          bottom: window.innerHeight - rect.top + gap,
          top: 'auto',
          minWidth: menuWidth,
        });
      } else {
        setCoords({
          left,
          top: rect.bottom + gap,
          bottom: 'auto',
          minWidth: menuWidth,
        });
      }
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef, width]);

  if (!open || !coords || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      className={`floating-menu ${className || ''}`.trim()}
      role={role}
      aria-label={ariaLabel}
      style={{
        position: 'fixed',
        zIndex: 10000,
        left: coords.left,
        top: coords.top,
        bottom: coords.bottom,
        minWidth: coords.minWidth,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
