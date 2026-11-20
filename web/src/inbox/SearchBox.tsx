import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Kbd } from '../components/ui';

/** Waits this long after the last keystroke before searching, so typing a name is one request. */
export const SEARCH_DELAY_MS = 300;
/** The API refuses longer searches. */
export const MAX_SEARCH = 100;

function typingInField(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * A list's search box, by default the inbox's (the customer's name or phone). `value` is the
 * search in effect; typing reports a new one through `onSearch` once the merchant pauses. `/`
 * focuses it, Escape clears it.
 */
export function SearchBox({
  value,
  onSearch,
  label,
  placeholder,
  maxLength = MAX_SEARCH,
}: {
  value: string;
  onSearch: (q: string) => void;
  label?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(value);

  // The search changed from outside (back button, a link): show it. Not when it only trails what
  // is typed, which would eat a space the merchant just typed between two names.
  if (value !== shown) {
    setShown(value);
    if (value !== text.trim()) setText(value);
  }

  useEffect(() => {
    const q = text.trim();
    if (q === value) return;
    const timer = setTimeout(() => onSearch(q), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, value, onSearch]);

  function clear() {
    setText('');
    onSearch('');
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (typingInField(event.target)) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <label className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 focus-within:outline-2 focus-within:outline-active">
      <Search aria-hidden className="size-4 text-ink-faint" />
      <input
        ref={input}
        type="search"
        value={text}
        maxLength={maxLength}
        // Named here, not by the label: its text would include the `/` hint.
        aria-label={label ?? t('inbox.search.label')}
        placeholder={placeholder ?? t('inbox.search.placeholder')}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          clear();
        }}
        className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
      />
      {text ? (
        <button
          type="button"
          aria-label={t('inbox.search.clear')}
          title={t('inbox.search.clear')}
          onClick={() => {
            clear();
            input.current?.focus();
          }}
          className="rounded text-ink-faint hover:text-ink focus-visible:outline-2 focus-visible:outline-active"
        >
          <X aria-hidden className="size-4" />
        </button>
      ) : (
        <Kbd>/</Kbd>
      )}
    </label>
  );
}
