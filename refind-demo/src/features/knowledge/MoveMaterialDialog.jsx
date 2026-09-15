import { Check, X } from 'lucide-react';

export function MoveMaterialDialog({
  open,
  bases = [],
  currentBaseId,
  onPick,
  onClose,
}) {
  if (!open) return null;

  return (
    <div
      className="modal-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        className="material-simple-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="移动到"
      >
        <header>
          <h2>移动到</h2>
          <button type="button" aria-label="关闭" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <div className="material-move-list" role="listbox" aria-label="知识库列表">
          {bases.map((base) => {
            const isCurrent = base.id === currentBaseId;
            return (
              <button
                key={base.id}
                type="button"
                role="option"
                aria-selected={isCurrent}
                className={isCurrent ? 'is-current' : ''}
                disabled={isCurrent}
                onClick={() => {
                  if (!isCurrent) onPick?.(base);
                }}
              >
                <span>{base.name}</span>
                {isCurrent && <Check size={14} strokeWidth={1.9} />}
              </button>
            );
          })}
        </div>
        <footer>
          <button type="button" onClick={onClose}>取消</button>
        </footer>
      </section>
    </div>
  );
}
