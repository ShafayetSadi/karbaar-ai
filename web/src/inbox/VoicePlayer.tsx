import { Pause, Play } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** mm:ss for a playback or recording time. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** A compact voice-note player that sits inside a message bubble. */
export function VoicePlayer({ src, onError }: { src: string; onError: () => void }) {
  const { t } = useTranslation();
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  function toggle() {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setPlaying(false));
    else el.pause();
  }

  return (
    <div role="group" aria-label={t('inbox.voiceNote')} className="flex w-56 items-center gap-2.5">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onError={onError}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setTime(0);
        }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setDuration(d);
        }}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setDuration(d);
        }}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={t(playing ? 'inbox.pauseVoice' : 'inbox.playVoice')}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-active"
      >
        {playing ? (
          <Pause aria-hidden className="size-4 fill-current" />
        ) : (
          <Play aria-hidden className="size-4 fill-current" />
        )}
      </button>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(time, duration || 0)}
        disabled={!duration}
        aria-label={t('inbox.voiceSeek')}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (audio.current) audio.current.currentTime = next;
          setTime(next);
        }}
        className="h-1 min-w-0 flex-1 cursor-pointer accent-ink"
      />
      <span className="shrink-0 font-mono text-xs text-ink-muted tabular-nums">
        {clock(playing || time > 0 ? time : duration)}
      </span>
    </div>
  );
}
