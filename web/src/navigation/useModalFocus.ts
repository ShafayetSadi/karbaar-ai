import { useEffect, useLayoutEffect, useRef } from 'react';

/** Native dialog supplies focus containment, Escape and inert background without a dependency. */
export function useModalFocus(open: boolean, close: () => void, visible = false) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(close);
  useLayoutEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!open) {
      if (visible) dialog.setAttribute('open', '');
      else dialog.removeAttribute('open');
      return () => {
        dialog.removeAttribute('open');
      };
    }
    dialog.removeAttribute('open');
    dialog.dataset.modal = 'true';
    const previous = document.activeElement;
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute('open', '');
    const cancel = (event: Event) => {
      event.preventDefault();
      closeRef.current();
    };
    dialog.addEventListener('cancel', cancel);
    const fallbackKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const dialogs = document.querySelectorAll('dialog[data-modal="true"]');
      if (dialogs[dialogs.length - 1] === dialog) {
        event.stopImmediatePropagation();
        closeRef.current();
      }
    };
    if (!dialog.showModal) window.addEventListener('keydown', fallbackKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.removeEventListener('cancel', cancel);
      window.removeEventListener('keydown', fallbackKey);
      delete dialog.dataset.modal;
      dialog.close?.();
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open, visible]);
  return ref;
}
