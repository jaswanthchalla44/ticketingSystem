import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';

interface DialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** A modal confirmation. Focus moves into it on open, Escape closes it, and focus returns to the trigger. */
export function Dialog({ open, title, children, confirmLabel, busy = false, destructive = false, onConfirm, onClose }: DialogProps) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      returnFocus?.focus();
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-xl">
        <h2 id={titleId} className="text-lg font-semibold text-ink">
          {title}
        </h2>
        <div className="mt-2 text-sm text-ink-2">{children}</div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} busy={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
