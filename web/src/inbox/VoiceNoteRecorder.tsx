import { AudioLines, RotateCcw, Send, Square, Trash2, X } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionButton, IconButton, Tooltip } from '../components/ui';
import { canRecordAudio } from './useDictation';
import { MAX_VOICE_NOTE_SECONDS, type VoiceNote } from './useVoiceNote';
import { clock, VoicePlayer } from './VoicePlayer';

/** The composer's waveform button: starts a voice note. Hidden where the browser cannot record. */
export function VoiceNoteButton({ voice, disabled }: { voice: VoiceNote; disabled: boolean }) {
  const { t } = useTranslation();
  if (!canRecordAudio() || voice.state !== 'idle') return null;
  return (
    <Tooltip side="top" content={t('inbox.voiceRecorder.hint')}>
      <IconButton
        icon={AudioLines}
        label={t('inbox.voiceRecorder.start')}
        title={undefined}
        disabled={disabled}
        onClick={() => void voice.start()}
      />
    </Tooltip>
  );
}

/**
 * The voice note being recorded or about to be sent, above the reply box: a timer and level
 * meter while recording; then playback, record again, delete or send. Esc discards a recording.
 */
export function VoiceNoteBar({
  voice,
  maxSeconds = MAX_VOICE_NOTE_SECONDS,
}: {
  voice: VoiceNote;
  maxSeconds?: number;
}) {
  const { t } = useTranslation();
  const { state, discard } = voice;

  useEffect(() => {
    if (state !== 'recording') return;
    // Capture on window runs before every other Esc handler, so one Esc only discards this.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      discard();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [state, discard]);

  if (state === 'idle') {
    return voice.error ? (
      <p role="alert" className="mb-2 text-xs text-danger-ink">
        {t(`inbox.voiceRecorder.error.${voice.error}`)}
      </p>
    ) : null;
  }

  const sending = state === 'sending';
  return (
    <div
      role="group"
      aria-label={t('inbox.voiceRecorder.label')}
      className="mb-2 space-y-1.5 rounded-lg border border-line bg-panel-muted px-3 py-2"
    >
      {state === 'recording' ? (
        <div className="flex items-center gap-2">
          <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-danger-ink" />
          <span
            role="timer"
            aria-label={t('inbox.voiceRecorder.recording')}
            className="shrink-0 font-mono text-xs text-danger-ink tabular-nums"
          >
            {clock(voice.seconds)} / {clock(maxSeconds)}
          </span>
          <span aria-hidden className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line">
            <span
              data-testid="voice-level"
              className="block h-full rounded-full bg-ink transition-[width] duration-75"
              style={{ width: `${Math.round(voice.level * 100)}%` }}
            />
          </span>
          <IconButton icon={Square} label={t('inbox.voiceRecorder.stop')} onClick={voice.stop} />
          <IconButton icon={X} label={t('inbox.voiceRecorder.cancel')} onClick={discard} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {voice.previewUrl && (
            <div className="min-w-0 flex-1">
              <VoicePlayer src={voice.previewUrl} onError={() => {}} />
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <IconButton
              icon={RotateCcw}
              label={t('inbox.voiceRecorder.again')}
              disabled={sending}
              onClick={() => void voice.start()}
            />
            <IconButton
              icon={Trash2}
              label={t('inbox.voiceRecorder.delete')}
              disabled={sending}
              onClick={discard}
            />
            <ActionButton
              tone="primary"
              icon={Send}
              disabled={sending}
              onClick={() => void voice.send()}
              className="py-1.5"
            >
              {sending ? t('common.pleaseWait') : t('inbox.voiceRecorder.send')}
            </ActionButton>
          </div>
        </div>
      )}
      {voice.error && (
        <p role="alert" className="text-xs text-danger-ink">
          {t(`inbox.voiceRecorder.error.${voice.error}`)}
        </p>
      )}
    </div>
  );
}
