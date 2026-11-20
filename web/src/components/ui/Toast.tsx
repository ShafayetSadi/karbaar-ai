import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from './cx';

export type ToastInput = {
  message: ReactNode;
  tone?: 'neutral' | 'ok' | 'danger';
  /** One follow-up, such as Undo. Running it also dismisses the toast. */
  action?: { label: string; onClick: () => void };
};

type ShownToast = ToastInput & { id: number };

const MAX_TOASTS = 3;
const DURATION_MS = 5000;
const DURATION_WITH_ACTION_MS = 8000;

// Outside a provider (an isolated component test) a toast is simply not shown.
const ToastContext = createContext<(toast: ToastInput) => void>(() => {});

/** Returns `toast({ message, tone?, action? })`, a short confirmation that dismisses itself. */
export function useToast() {
  return useContext(ToastContext);
}

/** Mount once, in `App.tsx`. Shows at most three toasts; a fourth drops the oldest. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ShownToast[]>([]);
  const nextId = useRef(0);

  const toast = useCallback((input: ToastInput) => {
    const id = ++nextId.current;
    setToasts((current) => [...current, { ...input, id }].slice(-MAX_TOASTS));
  }, []);
  const dismiss = useCallback(
    (id: number) => setToasts((current) => current.filter((t) => t.id !== id)),
    [],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* No role here: each toast is its own status region and exists only while shown. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col gap-2 p-3 sm:inset-x-auto sm:top-auto sm:right-4 sm:bottom-4 sm:w-96 sm:p-0">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ShownToast; onDismiss: (id: number) => void }) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(toast.action ? DURATION_WITH_ACTION_MS : DURATION_MS);
  const paused = hovered || focused;
  const { id } = toast;

  // The clock only runs while the toast is neither hovered nor focused, and resumes where it was.
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(() => onDismiss(id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [paused, id, onDismiss]);

  return (
    <div
      role="status"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
      className={cx(
        'pointer-events-auto flex items-center gap-3 rounded-lg py-2 pr-2 pl-4 text-sm shadow-lg motion-safe:transition motion-safe:duration-150 motion-safe:starting:translate-y-2 motion-safe:starting:opacity-0',
        toast.tone === 'danger'
          ? 'border border-danger-ink/30 bg-danger text-danger-ink'
          : 'bg-ink text-paper',
      )}
    >
      <span className="min-w-0 flex-1">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss(id);
          }}
          className="shrink-0 rounded px-2 py-1 font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-current"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label={t('toast.close')}
        onClick={() => onDismiss(id)}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded opacity-70 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-current"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
