import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type TranscriptStatus = 'pending' | 'done' | 'empty' | 'failed' | 'too_long';

/**
 * What a voice note's transcript looks like on the attachment: plain text (never HTML), two lines
 * until expanded. Nothing for an empty or missing transcript.
 */
export function VoiceTranscript({
  transcript,
  status,
}: {
  transcript?: string | null;
  status?: TranscriptStatus | null;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const text = useRef<HTMLParagraphElement>(null);

  // Measured again when the bubble narrows or widens (the side panel opening, a window resize).
  useLayoutEffect(() => {
    const el = text.current;
    if (!el || expanded) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [transcript, expanded]);

  if (status === 'pending') {
    return (
      <p role="status" className="mt-1 text-xs italic opacity-80">
        {t('inbox.transcript.transcribing')}
      </p>
    );
  }
  if (status === 'too_long') {
    return <p className="mt-1 text-xs italic opacity-80">{t('inbox.transcript.tooLong')}</p>;
  }
  if (status === 'failed') {
    return <p className="mt-1 text-xs italic opacity-80">{t('inbox.transcript.failed')}</p>;
  }
  if (!transcript) return null;
  return (
    <div className="mt-1">
      <p
        ref={text}
        className={`text-sm break-words whitespace-pre-wrap ${expanded ? '' : 'line-clamp-2'}`}
      >
        {transcript}
      </p>
      {(clamped || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          className="text-xs underline focus-visible:outline-2 focus-visible:outline-active"
        >
          {expanded ? t('inbox.transcript.less') : t('inbox.transcript.more')}
        </button>
      )}
    </div>
  );
}
