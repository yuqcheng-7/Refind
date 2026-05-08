"use client";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  hideCancel?: boolean;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

export function ConfirmModal({
  open,
  title,
  description,
  confirmText = "确定",
  cancelText = "取消",
  hideCancel,
  danger,
  loading,
  onConfirm,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <button
        type="button"
        className="modal-backdrop fixed inset-0 bg-[color:rgba(15,15,15,0.33)]"
        aria-label="关闭"
        onClick={onClose}
      />
      <div className="page-enter relative z-10 w-full max-w-md rounded-xl border border-[var(--border)] bg-surface p-6 shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
        <h2 className="font-display text-lg text-foreground">{title}</h2>
        {description ? (
          <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">{description}</p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          {!hideCancel ? (
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] bg-surface px-4 text-sm font-medium text-[var(--foreground-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[rgba(55,53,47,0.04)] disabled:opacity-50"
            >
              {cancelText}
            </button>
          ) : null}
          <button
            type="button"
            disabled={loading}
            onClick={() => void onConfirm()}
            className={`inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold text-white transition-opacity duration-[var(--duration-fast)] disabled:opacity-50 ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-[var(--dominant)] hover:bg-[var(--dominant-hover)]"
            }`}
          >
            {loading ? "请稍候…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
