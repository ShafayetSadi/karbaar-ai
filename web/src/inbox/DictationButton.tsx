import { Loader2, Mic, Square } from 'lucide-react';
import { useEffect, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Tooltip } from '../components/ui';
import { dictationSupported, useDictation, type DictationState } from './useDictation';
import { clock } from './VoicePlayer';

/**
 * Put `spoken` into `text` at the selection, with a space either side where it would otherwise
 * run into a word. Only `spoken` is shortened to fit `maxLength`, never what is already typed.
 * Returns the new value and caret, and whether all of `spoken` fit (null when none of it did).
 */
export function insertDictation(
  text: string,
  spoken: string,
  at: number,
  end: number,
  maxLength: number,
): { value: string; caret: number; complete: boolean } | null {
  const before = text.slice(0, at);
  const after = text.slice(end);
  const lead = before !== '' && !/\s$/.test(before) ? ' ' : '';
  const trail = after !== '' && !/^\s/.test(after) ? ' ' : '';
  const room = maxLength - before.length - after.length - lead.length - trail.length;
  if (room <= 0) return null;
  const fitted = spoken.slice(0, room);
  const inserted = lead + fitted + trail;
  return {
    value: before + inserted + after,
    caret: before.length + inserted.length,
    complete: fitted.length === spoken.length,
  };
}

/**
 * The composer's mic button: record, stop, and the transcript is inserted at the cursor. Hidden
 * where the browser cannot record. Esc cancels a recording. Never sends anything.
 */
export function DictationButton({
  conversationId,
  disabled,
  replyRef,
  text,
  maxLength,
  onTextChange,
  onStateChange,
}: {
  conversationId: string;
  disabled: boolean;
  replyRef: RefObject<HTMLTextAreaElement | null>;
  text: string;
  maxLength: number;
  onTextChange: (value: string) => void;
  /** So the reply box can make room for the wider recording and transcribing controls. */
  onStateChange?: (state: DictationState) => void;
}) {
  const { t } = useTranslation();
  const { state, seconds, error, start, stop, cancel, clearError } = useDictation(
    conversationId,
    (spoken) => {
      const box = replyRef.current;
      const at = box?.selectionStart ?? text.length;
      const result = insertDictation(text, spoken, at, box?.selectionEnd ?? at, maxLength);
      if (!result) return false;
      onTextChange(result.value);
      requestAnimationFrame(() => {
        box?.focus();
        box?.setSelectionRange(result.caret, result.caret);
      });
      return result.complete;
    },
  );

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  // A message is about the last attempt; once the merchant types, it is stale. Only their own
  // input counts, so the note that a transcript was cut short survives its own insertion.
  useEffect(() => {
    const box = replyRef.current;
    if (!error || !box) return;
    box.addEventListener('input', clearError);
    return () => box.removeEventListener('input', clearError);
  }, [error, replyRef, clearError]);
  // Sent or cleared some other way (a draft sent as is).
  useEffect(() => {
    if (text === '') clearError();
  }, [text, clearError]);

  useEffect(() => {
    if (state !== 'recording') return;
    // Capture on window runs before every other Esc handler (side panel, lightbox, search), so
    // one Esc only discards the recording.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      cancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [state, cancel]);

  if (!dictationSupported()) return null;

  return (
    <>
      <div className="absolute top-0 right-1 flex h-9 items-center">
        {state === 'idle' && (
          <Tooltip side="top" content={t('inbox.dictation.hint')}>
            <IconButton
              icon={Mic}
              label={t('inbox.dictation.start')}
              title={undefined}
              disabled={disabled}
              onClick={() => void start()}
            />
          </Tooltip>
        )}
        {state === 'recording' && (
          <div className="flex items-center gap-1">
            <span
              role="timer"
              aria-label={t('inbox.dictation.recording')}
              className="font-mono text-xs text-danger-ink tabular-nums"
            >
              {clock(seconds)}
            </span>
            <IconButton icon={Square} label={t('inbox.dictation.stop')} onClick={stop} />
          </div>
        )}
        {state === 'transcribing' && (
          <span role="status" className="flex items-center gap-1.5 px-2 text-xs text-ink-faint">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {t('inbox.dictation.transcribing')}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger-ink">
          {t(`inbox.dictation.error.${error}`)}
        </p>
      )}
    </>
  );
}
