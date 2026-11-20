import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { call } from '../api/call';

export const MAX_DICTATION_SECONDS = 60;

/** Plenty for speech, and keeps a full minute well under the server's 2 MB cap. */
const AUDIO_BITS_PER_SECOND = 64_000;

/** Tried in order; the server accepts each of them (it judges the type by the first bytes). */
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];

export type DictationState = 'idle' | 'recording' | 'transcribing';

/** Keys under `inbox.dictation.error.*` in the locale files. */
export type DictationError =
  | 'denied'
  | 'noDevice'
  | 'failed'
  | 'budget'
  | 'unavailable'
  | 'empty'
  | 'tooLarge'
  | 'tooLong'
  | 'unsupported'
  | 'rateLimited'
  | 'network'
  | 'full';

const API_ERRORS: Record<string, DictationError> = {
  AI_ALLOWANCE_DAILY: 'budget',
  AI_ALLOWANCE_MONTHLY: 'budget',
  AI_REVIEW_PENDING: 'unavailable',
  AI_PRICE_UNKNOWN: 'unavailable',
  AI_ALLOWANCE_UNAVAILABLE: 'unavailable',
  AI_UNAVAILABLE: 'unavailable',
  TRANSCRIPT_EMPTY: 'empty',
  FILE_TOO_LARGE: 'tooLarge',
  AUDIO_TOO_LONG: 'tooLong',
  INVALID_AUDIO: 'unsupported',
  UNSUPPORTED_MEDIA_TYPE: 'unsupported',
  RATE_LIMITED: 'rateLimited',
  NETWORK_ERROR: 'network',
};

export function pickMimeType(): string | undefined {
  const isSupported = (type: string) => MediaRecorder.isTypeSupported?.(type) ?? false;
  return MIME_TYPES.find(isSupported);
}

/**
 * Whether this browser can record in a format the server accepts; the mic button (and the voice
 * note button) is not shown otherwise.
 */
export function dictationSupported(): boolean {
  return canRecordAudio();
}

export function canRecordAudio(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    pickMimeType() !== undefined
  );
}

function fileName(type: string): string {
  if (type.includes('mp4')) return 'dictation.m4a';
  if (type.includes('ogg')) return 'dictation.ogg';
  return 'dictation.webm';
}

export function micError(e: unknown): 'denied' | 'noDevice' | 'failed' {
  const name = (e as { name?: unknown } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'noDevice';
  return 'failed';
}

/** One recording: its own stream, recorder and timer, so a late `onstop` touches only these. */
type Recording = {
  media: MediaStream;
  recorder: MediaRecorder | null;
  timer: ReturnType<typeof setInterval> | null;
  discard: boolean;
};

function release(recording: Recording) {
  if (recording.timer) clearInterval(recording.timer);
  recording.timer = null;
  recording.media.getTracks().forEach((track) => track.stop());
}

/**
 * Record from the microphone and turn it into text with the dictation endpoint. The text is handed
 * to `onText`, which returns false when not all of it fit; nothing is ever sent. Media tracks are
 * always stopped, and the audio is not kept.
 */
export function useDictation(conversationId: string, onText: (text: string) => boolean) {
  const [state, setState] = useState<DictationState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<DictationError | null>(null);
  // Set from the click until the recording runs, so a second click while the permission prompt
  // is open does not open a second microphone.
  const starting = useRef(false);
  const active = useRef<Recording | null>(null);
  const alive = useRef(true);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  });

  const upload = useCallback(
    async (blob: Blob) => {
      const result = await call(() =>
        api.POST('/v1/conversations/{conversation_id}/dictation', {
          params: { path: { conversation_id: conversationId } },
          // The generated type says `audio: string`; the real body is multipart, built here.
          body: { audio: '' },
          bodySerializer: () => {
            const form = new FormData();
            form.append('audio', blob, fileName(blob.type));
            return form;
          },
        }),
      );
      if (!alive.current) return;
      setState('idle');
      if (!result.ok) {
        setError(API_ERRORS[result.error.code] ?? 'failed');
        return;
      }
      const text = (result.data as { text?: string }).text?.trim();
      if (!text) setError('empty');
      else if (!onTextRef.current(text)) setError('full');
    },
    [conversationId],
  );

  const start = useCallback(async () => {
    if (state !== 'idle' || starting.current) return;
    starting.current = true;
    setError(null);
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      starting.current = false;
      if (alive.current) setError(micError(e));
      return;
    }
    starting.current = false;
    const recording: Recording = { media, recorder: null, timer: null, discard: false };
    if (!alive.current) {
      release(recording);
      return;
    }
    try {
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(media, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });
      const chunks: Blob[] = [];
      rec.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      rec.onstop = () => {
        release(recording);
        // Cancelled, unmounted, or already replaced by a newer recording: drop it quietly.
        if (recording.discard || !alive.current || active.current !== recording) return;
        active.current = null;
        if (chunks.length === 0) {
          setState('idle');
          setError('failed');
          return;
        }
        setState('transcribing');
        void upload(new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' }));
      };
      recording.recorder = rec;
      rec.start();
    } catch {
      release(recording);
      setError('failed');
      return;
    }
    active.current = recording;
    setSeconds(0);
    setState('recording');
    let elapsed = 0;
    recording.timer = setInterval(() => {
      elapsed += 1;
      setSeconds(elapsed);
      if (elapsed >= MAX_DICTATION_SECONDS && recording.recorder?.state === 'recording') {
        recording.recorder.stop();
      }
    }, 1000);
  }, [state, upload]);

  const stop = useCallback(() => {
    const recorder = active.current?.recorder;
    if (recorder?.state === 'recording') recorder.stop();
  }, []);

  const cancel = useCallback(() => {
    const recording = active.current;
    active.current = null;
    if (recording) {
      recording.discard = true;
      if (recording.recorder?.state === 'recording') recording.recorder.stop();
      else release(recording);
    }
    setState('idle');
  }, []);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const recording = active.current;
      active.current = null;
      if (!recording) return;
      recording.discard = true;
      if (recording.recorder?.state === 'recording') recording.recorder.stop();
      else release(recording);
    };
  }, []);

  return { state, seconds, error, start, stop, cancel, clearError };
}
