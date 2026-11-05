import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ToastContext, type ToastInput, type ToastTone } from './toast-context';

interface ToastItem extends ToastInput {
  id: number;
}

const DURATION_MS = 4500;

const TONE_CLASSES: Record<ToastTone, string> = {
  success: 'border-good/50',
  error: 'border-critical/60',
  info: 'border-brand/50',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(-3), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6">
        <div role="status" aria-live="polite" className="flex w-full max-w-sm flex-col gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className={`pointer-events-auto rounded-lg border bg-surface p-3 shadow-lg ${TONE_CLASSES[item.tone]}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{item.title}</p>
                  {item.description && <p className="mt-0.5 text-sm text-ink-2">{item.description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="shrink-0 rounded px-1 text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
                  aria-label="Dismiss notification"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
