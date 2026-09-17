import { useEffect } from 'react';

export function useDismissable({ open, onClose, rootRef, triggerRef }) {
  useEffect(() => {
    if (!open) return undefined;

    const containsTarget = (ref, target) => ref?.current?.contains(target);
    const dismissOnOutsidePointerDown = (event) => {
      if (containsTarget(rootRef, event.target) || containsTarget(triggerRef, event.target)) return;
      onClose();
      // Closing on pointerdown can otherwise let the same click activate controls
      // underneath (e.g. home history items under a floating menu).
      event.preventDefault();
    };
    const dismissOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('pointerdown', dismissOnOutsidePointerDown);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOnOutsidePointerDown);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [open, onClose, rootRef, triggerRef]);
}
